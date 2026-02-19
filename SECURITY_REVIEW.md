# SoilTrack Security Review

**Application:** SoilTrack Trial Management Software
**Review Date:** 2026-02-18
**Reviewer:** Application Security Engineer
**Scope:** Full codebase review of authentication, authorization, input validation, data protection, API security, infrastructure configuration, and business logic.

---

## Executive Summary

SoilTrack is a Next.js 14 fullstack application backed by Supabase (PostgreSQL + Auth + Storage). The security review identified **18 findings** across all severity levels. The most critical issues stem from a **fundamental mismatch between application-layer RBAC and database-layer RLS policies** — the application enforces three roles (`admin`, `upload`, `readonly`) in API route handlers, but the database RLS policies grant all authenticated users unrestricted CRUD access. Any authenticated user can bypass RBAC by calling the Supabase REST API directly using the publicly exposed anon key and their session token. A **privilege escalation vector** also exists in the user creation trigger that reads the role from user-controlled signup metadata.

**Finding Summary:**
| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 5 |
| Medium | 6 |
| Low | 4 |

---

## Critical Findings

### C1: RBAC Bypass — RLS Policies Do Not Enforce Application Roles

**Description:**
All data tables (`trials`, `clients`, `soil_health_samples`, `soil_chemistry`, `plot_data`, `tissue_chemistry`, `treatments`, `management_log`, `upload_log`, `trial_data_files`, `raw_uploads`, `sample_metadata`, `trial_photos`, `trial_gis_layers`, `fields`, `field_trials`, `field_annotations`, `field_sampling_plans`, `field_gis_layers`) use the same permissive RLS policy:

```sql
-- supabase/migrations/001_initial_schema.sql:161-170
CREATE POLICY "Authenticated users full access" ON trials
  FOR ALL USING (auth.role() = 'authenticated');
```

This grants **every authenticated user** full SELECT, INSERT, UPDATE, and DELETE access to all data. The application's RBAC (`admin`, `upload`, `readonly`) is only enforced in Next.js API route handlers via `getUserRole()` checks. Since the Supabase URL and anon key are publicly exposed via `NEXT_PUBLIC_*` environment variables (by design), any authenticated user can construct direct Supabase REST API calls or use the Supabase JS client in the browser console to bypass all application-layer RBAC.

**Risk:** A `readonly` user can insert, update, and delete any trial data, client records, or uploaded files by making direct Supabase API calls. This completely undermines the three-tier role model.

**Proof of Concept:**
A `readonly` user could open the browser console and execute:
```javascript
// Using the same Supabase client the app uses
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(
  'https://your-project.supabase.co',  // from NEXT_PUBLIC_SUPABASE_URL
  'eyJ...',                              // from NEXT_PUBLIC_SUPABASE_ANON_KEY
)
// Delete all data from a trial
await sb.from('soil_health_samples').delete().eq('trial_id', 'TRIAL-001')
// Modify trial results
await sb.from('plot_data').update({ yield_t_ha: 999 }).eq('trial_id', 'TRIAL-001')
```

**Recommended Fix:**
Rewrite RLS policies to enforce the application role model using the `get_my_role()` function:
```sql
-- Example: readonly users can only SELECT
CREATE POLICY "readonly_select" ON trials
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "upload_insert" ON trials
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND get_my_role() IN ('admin', 'upload')
  );

CREATE POLICY "admin_update" ON trials
  FOR UPDATE USING (
    auth.role() = 'authenticated'
    AND get_my_role() = 'admin'
  );

CREATE POLICY "admin_delete" ON trials
  FOR DELETE USING (
    auth.role() = 'authenticated'
    AND get_my_role() = 'admin'
  );
```

Apply this pattern to all data tables, matching the permission model defined in `lib/auth.ts`.

**Priority:** P0 — Fix immediately.

---

### C2: Privilege Escalation via User Signup Metadata

**Description:**
The `handle_new_user()` trigger function (migration `007_user_roles.sql:27-43`) reads the user's role from `raw_user_meta_data`:

```sql
INSERT INTO public.profiles (id, email, full_name, role)
VALUES (
  NEW.id,
  NEW.email,
  COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
  COALESCE(NEW.raw_user_meta_data->>'role', 'readonly')  -- USER-CONTROLLED
);
```

In Supabase Auth, the `raw_user_meta_data` field is populated from the `options.data` parameter passed during `signUp()`. If self-registration is enabled on the Supabase project, an attacker can register with an arbitrary role.

**Risk:** An attacker can self-register as an `admin` user, gaining full control over the application including user management, data deletion, and all privileged operations.

**Proof of Concept:**
```javascript
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const { data, error } = await sb.auth.signUp({
  email: 'attacker@example.com',
  password: 'password123',
  options: { data: { role: 'admin', full_name: 'Admin User' } }
})
// After email confirmation, attacker has admin role
```

**Recommended Fix:**
1. **Never trust user metadata for role assignment.** Hardcode the default role in the trigger:
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'readonly'  -- ALWAYS default to readonly
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
```
2. **Disable self-registration** in Supabase dashboard if the application is invite-only (which the UI suggests — there's no signup form).
3. Only allow role changes through the admin API endpoint which already validates the caller is an admin.

**Priority:** P0 — Fix immediately.

---

### C3: Public Storage Buckets Expose Sensitive Trial Data

**Description:**
Both storage buckets are created with `public = true` and have unrestricted SELECT policies:

```sql
-- supabase/migrations/004_trial_photos.sql:28-29
INSERT INTO storage.buckets (id, name, public)
VALUES ('trial-photos', 'trial-photos', true);

-- supabase/migrations/004_trial_photos.sql:37-38
CREATE POLICY "Anyone can view trial photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'trial-photos');

-- supabase/migrations/006_trial_gis_layers.sql:28-29
INSERT INTO storage.buckets (id, name, public)
VALUES ('trial-gis', 'trial-gis', true);

-- supabase/migrations/006_trial_gis_layers.sql:37-38
CREATE POLICY "Anyone can view gis files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'trial-gis');
```

**Risk:** Anyone on the internet can access trial photos and GIS files (containing GPS coordinates, field boundaries, spatial data) if they know or can guess the storage path. Storage paths follow a predictable pattern: `{trialId}/{uuid}.{ext}`. Trial IDs are user-visible text strings, so brute-forcing is feasible.

**Recommended Fix:**
1. Set buckets to `public = false`.
2. Replace the open SELECT policies with authenticated-only access:
```sql
CREATE POLICY "Authenticated users can view photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'trial-photos' AND auth.role() = 'authenticated');
```
3. Use Supabase's `createSignedUrl()` for time-limited access when rendering images.

**Priority:** P0 — Fix immediately.

---

## High Findings

### H1: Missing Authentication Checks on Multiple API Routes

**Description:**
The global middleware (`middleware.ts:70`) explicitly **excludes** API routes from authentication redirects:
```typescript
if (
  !user &&
  !request.nextUrl.pathname.startsWith('/api') &&  // <-- API routes bypassed
  ...
) { redirect to /login }
```

The following API routes never call `getUserRole()` or check authentication, relying solely on RLS (which as documented in C1, is overly permissive):

| Route | File | Methods |
|-------|------|---------|
| `/api/fields` | `app/api/fields/route.ts` | GET, POST |
| `/api/fields/[id]` | `app/api/fields/[id]/route.ts` | GET, PUT, DELETE |
| `/api/fields/[id]/trials` | `app/api/fields/[id]/trials/route.ts` | GET, POST, DELETE |
| `/api/fields/[id]/annotations` | `app/api/fields/[id]/annotations/route.ts` | GET, POST, DELETE |
| `/api/fields/[id]/gis-layers` | `app/api/fields/[id]/gis-layers/route.ts` | GET, POST |
| `/api/fields/[id]/gis-layers/[layerId]` | `app/api/fields/[id]/gis-layers/[layerId]/route.ts` | PUT, DELETE |
| `/api/fields/[id]/sampling-plans` | `app/api/fields/[id]/sampling-plans/route.ts` | GET, POST, DELETE |
| `/api/analysis` | `app/api/analysis/route.ts` | GET |
| `/api/report` | `app/api/report/route.ts` | GET |
| `/api/upload/check-existing` | `app/api/upload/check-existing/route.ts` | GET |
| `/api/upload/review` (GET) | `app/api/upload/review/route.ts` | GET |
| `/api/metadata` (GET) | `app/api/metadata/route.ts` | GET |

**Risk:** While the Supabase server client created from cookies will operate as anonymous if no session cookies are present (and RLS on most tables requires `auth.role() = 'authenticated'`), this is a defense-in-depth failure. Any table with permissive RLS (like `custom_map_layers` — see H5) would be accessible without authentication. Additionally, no role-based checks are performed, so `readonly` users can POST/PUT/DELETE via these routes.

**Recommended Fix:**
1. Add a centralized auth guard for all API routes (either extend the middleware to include `/api` paths, or create a shared `requireAuth()` helper).
2. Add RBAC checks to all write endpoints in the fields API.

**Priority:** P1

---

### H2: No File Upload Content Validation

**Description:**
Photo uploads (`app/api/upload/photos/route.ts`, `app/api/upload/folder/route.ts`) do not validate:
- **File type by content** (MIME type, magic bytes). The `contentType` is set from `file.type` (client-provided, easily spoofed) or inferred from the extension.
- **File extension whitelist**. The `classify.ts` file classifies by extension but doesn't block dangerous types.
- **Malware/malicious content scanning**.

Data file uploads (CSV, Excel) are parsed without size limits per-file (only a global 50MB `bodySizeLimit` in `next.config.js:4`).

```typescript
// app/api/upload/photos/route.ts:34
const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
const storagePath = `${trialId}/${crypto.randomUUID()}.${ext}`
// ... uploaded directly — no content validation
```

**Risk:** An attacker with upload permissions could:
- Upload executable files disguised as images to the public storage bucket
- Upload extremely large files to exhaust storage quotas
- Upload crafted Excel/CSV files designed to exploit parsing vulnerabilities in `xlsx` (see H3)

**Recommended Fix:**
1. Validate file content type using magic bytes (e.g., `file-type` npm package).
2. Restrict photo uploads to a whitelist of image MIME types.
3. Add per-file size limits.
4. Consider virus/malware scanning for uploaded files.

**Priority:** P1

---

### H3: Known Vulnerabilities in Dependencies

**Description:**
`npm audit` reports the following high/moderate vulnerabilities:

| Package | Severity | Issue | Fix |
|---------|----------|-------|-----|
| `xlsx@0.18.5` | **High** | Prototype Pollution ([GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)) | **No fix available** — package is unmaintained |
| `xlsx@0.18.5` | **High** | ReDoS ([GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)) | **No fix available** |
| `next@14.x` | **High** | DoS via Image Optimizer ([GHSA-9g9p-9gw9-jx7f](https://github.com/advisories/GHSA-9g9p-9gw9-jx7f)) | Upgrade to next@15.6+ |
| `next@14.x` | **High** | DoS via HTTP request deserialization ([GHSA-h25m-26qc-wcjf](https://github.com/advisories/GHSA-h25m-26qc-wcjf)) | Upgrade to next@15.6+ |
| `ajv` (via eslint) | Moderate | ReDoS | Dev dependency only |

The `xlsx` package is particularly concerning because it processes user-uploaded Excel files on the server. The prototype pollution vulnerability could allow an attacker to craft a malicious Excel file that, when parsed, modifies JavaScript object prototypes and potentially achieves code execution.

**Risk:** Server-side code execution or denial of service through crafted Excel file uploads.

**Recommended Fix:**
1. **Replace `xlsx`** with a maintained alternative like `exceljs` or `@sheet/core` (the community fork of SheetJS).
2. **Upgrade Next.js** to version 15.6+ or latest stable.
3. Parse uploaded Excel files in an isolated context (worker thread or sandbox) as defense-in-depth.

**Priority:** P1

---

### H4: No Rate Limiting on Any Endpoint

**Description:**
The application has no rate limiting middleware or configuration on any endpoint. No rate limiting libraries are installed, and the Next.js middleware does not implement throttling.

**Risk:**
- **Brute-force login attacks** against `signInWithPassword()` (Supabase has some built-in rate limiting, but it should not be the sole control).
- **Bulk data exfiltration** — an attacker could scrape all trial data through the unauthenticated analysis/report endpoints.
- **Resource exhaustion** — repeated large file uploads or computationally expensive analysis queries.

**Recommended Fix:**
1. Implement rate limiting at the API layer using `next-rate-limit`, Vercel edge middleware, or a reverse proxy (nginx, Cloudflare).
2. Apply stricter limits to auth-related endpoints (login, password reset).
3. Apply rate limits to upload endpoints based on file count and total size.

**Priority:** P1

---

### H5: custom_map_layers RLS Allows Unauthenticated Access

**Description:**
The `custom_map_layers` table has RLS policies with `USING (true)` and `WITH CHECK (true)`:

```sql
-- supabase/migrations/012_custom_map_layers.sql:17-24
CREATE POLICY "Users can view custom_map_layers" ON custom_map_layers
  FOR SELECT USING (true);

CREATE POLICY "Users can insert custom_map_layers" ON custom_map_layers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can delete custom_map_layers" ON custom_map_layers
  FOR DELETE USING (true);
```

**Risk:** Even unauthenticated users (using the publicly available anon key) can read, create, and delete custom map layers. This exposes trial GPS data and metrics to the public internet.

**Recommended Fix:**
Replace with authenticated-only policies matching the pattern used on other tables:
```sql
CREATE POLICY "Authenticated users full access" ON custom_map_layers
  FOR ALL USING (auth.role() = 'authenticated');
```
Then further restrict per role as part of the C1 remediation.

**Priority:** P1

---

## Medium Findings

### M1: No Multi-Factor Authentication (MFA)

**Description:**
The application uses email/password authentication only. No MFA/2FA is implemented or offered. Supabase Auth supports TOTP-based MFA, but it is not configured in this application.

**Risk:** Compromised passwords (via phishing, credential stuffing, or reuse) grant immediate full access to the account without a second authentication factor.

**Recommended Fix:**
1. Enable Supabase Auth MFA (TOTP) for admin users at minimum.
2. Enforce MFA for all users who can modify data (`admin` and `upload` roles).
3. Add MFA enrollment flow to the settings page.

**Priority:** P2

---

### M2: Weak Password Policy

**Description:**
The password reset page (`app/reset-password/page.tsx:32`) enforces only a 6-character minimum:
```typescript
if (password.length < 6) {
  setError('Password must be at least 6 characters.')
  return
}
```
No complexity requirements (uppercase, lowercase, numbers, special characters). The Supabase default minimum password length is also 6 characters.

**Risk:** Weak passwords are vulnerable to brute-force and dictionary attacks.

**Recommended Fix:**
1. Increase minimum length to 12 characters.
2. Configure Supabase Auth password strength requirements in the dashboard.
3. Consider checking passwords against known breached password lists (e.g., HaveIBeenPwned API).

**Priority:** P2

---

### M3: Missing HTTP Security Headers

**Description:**
The application does not configure any HTTP security headers. There is no `next.config.js` `headers()` configuration, no middleware setting headers, and no `<meta>` CSP tags.

Missing headers:
- `Content-Security-Policy` (CSP)
- `Strict-Transport-Security` (HSTS)
- `X-Frame-Options` / `frame-ancestors` CSP directive
- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`

**Risk:**
- **Clickjacking:** The application can be framed by malicious sites.
- **MIME sniffing:** Browsers may misinterpret content types.
- **Mixed content:** No HSTS means potential downgrade to HTTP.
- **XSS amplification:** No CSP to restrict inline scripts or external resource loading.

**Recommended Fix:**
Add security headers in `next.config.js`:
```javascript
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org; connect-src 'self' https://*.supabase.co wss://*.supabase.co;" },
    ],
  }]
}
```

**Priority:** P2

---

### M4: Open Redirect in Auth Callback Routes

**Description:**
Both auth callback routes accept a `next` query parameter that controls the post-authentication redirect destination:

```typescript
// app/auth/callback/route.ts:11
const next = searchParams.get('next') ?? '/dashboard'
// ...
const response = NextResponse.redirect(`${origin}${destination}`)

// app/auth/confirm/route.ts:10
const next = searchParams.get('next') ?? '/dashboard'
```

While `origin` is prepended (mitigating full open redirect), the `next` parameter is not validated against a whitelist of allowed paths. Values like `/\evil.com` or URL-encoded payloads could potentially be exploited in edge cases depending on browser URL normalization.

**Risk:** Could be used in phishing attacks to redirect users after authentication to an attacker-controlled page path, or to bypass path-based security controls.

**Recommended Fix:**
Validate the `next` parameter against a whitelist of allowed paths:
```typescript
const ALLOWED_REDIRECTS = ['/dashboard', '/reset-password', '/settings']
const next = searchParams.get('next') ?? '/dashboard'
const destination = ALLOWED_REDIRECTS.includes(next) ? next : '/dashboard'
```
Or at minimum, ensure it starts with `/` and does not contain `//` or `\`.

**Priority:** P2

---

### M5: No Audit Trail for Data Modifications

**Description:**
While `upload_log` tracks file upload events, there is no general audit trail for:
- Direct data modifications (UPDATE/DELETE on trial data records)
- Field CRUD operations
- User role changes (the admin PATCH endpoint at `app/api/admin/users/route.ts` updates roles but does not log the change)
- Trial status changes
- Storage file deletions

**Risk:** Regulatory compliance issues (GDPR, data integrity requirements for scientific trials). Inability to investigate data tampering or track who changed what.

**Recommended Fix:**
1. Create an `audit_log` table with columns: `id`, `user_id`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `timestamp`.
2. Implement PostgreSQL triggers on critical tables to automatically log changes.
3. Ensure audit logs are immutable (no UPDATE/DELETE policies for non-admin roles).
4. Log user role changes in the admin users endpoint.

**Priority:** P2

---

### M6: Internal Error Details Leaked to Clients

**Description:**
Multiple API routes return raw Supabase/PostgreSQL error messages to the client:

```typescript
// app/api/fields/[id]/route.ts:15
if (error) return NextResponse.json({ error: error.message }, { status: 404 })

// app/api/upload/gis/route.ts:91
return NextResponse.json({ error: `Database insert failed: ${dbError.message}` }, { status: 500 })

// app/api/metadata/route.ts:127
return NextResponse.json({ status: 'error', detail: err.message || 'Import failed' })
```

This pattern is consistent across all API routes.

**Risk:** Internal error messages may reveal database schema details, table names, constraint names, or SQL query fragments to attackers, aiding in reconnaissance.

**Recommended Fix:**
1. Return generic error messages to clients (e.g., "An error occurred. Please try again.").
2. Log detailed errors server-side only.
3. Use error codes that the client can map to user-friendly messages.

**Priority:** P2

---

## Low Findings

### L1: Content Injection via Login Error URL Parameter

**Description:**
The login page (`app/login/page.tsx:32`) reads the `error` query parameter and displays it:
```typescript
const urlError = params.get('error')
if (urlError) { setError(urlError) }
// Rendered as: {error && <p className="text-red-500 text-xs">{error}</p>}
```

React auto-escapes text content, so this is not an XSS vulnerability. However, an attacker can craft URLs with misleading error messages for social engineering.

**Risk:** Phishing — an attacker could send: `/login?error=Your+account+has+been+suspended.+Contact+helpdesk%40evil.com+to+recover+it.`

**Recommended Fix:**
Map error codes to predefined messages rather than displaying arbitrary URL parameters:
```typescript
const ERROR_MESSAGES: Record<string, string> = {
  'invalid_link': 'This link has expired. Please request a new one.',
  'auth_failed': 'Authentication failed. Please try again.',
}
const urlError = params.get('error')
if (urlError) { setError(ERROR_MESSAGES[urlError] || 'An error occurred.') }
```

**Priority:** P3

---

### L2: No Explicit CSRF Protection

**Description:**
The application relies solely on Supabase's cookie-based auth (which uses `SameSite` cookies by default) for CSRF protection. No explicit CSRF tokens are generated or validated on state-changing API endpoints.

**Risk:** If `SameSite` cookie policy is misconfigured or the application is served from a subdomain that shares cookies, cross-site request forgery could be possible against POST/PATCH/DELETE endpoints.

**Recommended Fix:**
The current reliance on `SameSite` cookies is acceptable for most deployment scenarios. For defense-in-depth, consider adding CSRF tokens to critical state-changing operations (user role changes, data deletion).

**Priority:** P3

---

### L3: Upload Logging is Best-Effort and Unreliable

**Description:**
Upload log insertions across all upload endpoints are wrapped in try/catch blocks that silently swallow errors:

```typescript
// app/api/upload/single/route.ts:126
try {
  await supabase.from('upload_log').insert({ ... })
} catch (logErr) { console.error('upload_log insert failed:', logErr) }

// app/api/upload/folder/route.ts:155
try { await supabase.from('upload_log').insert({ ... }) } catch { /* logging is best-effort */ }
```

**Risk:** Upload events may not be logged, creating gaps in the audit trail. If an attacker tampers with data via the upload mechanism, the activity may not be recorded.

**Recommended Fix:**
Make upload logging a critical path operation (fail the upload if logging fails), or use a separate reliable logging mechanism (application log aggregator, separate logging service).

**Priority:** P3

---

### L4: Service Role Key Could Be Leaked via Server-Side Error

**Description:**
The `SUPABASE_SERVICE_ROLE_KEY` is used in `lib/supabase/admin.ts` to create a client that bypasses RLS. While it's correctly not prefixed with `NEXT_PUBLIC_` (so it's not bundled into client-side code), it's used on every landing page load (`app/page.tsx:9`) to fetch statistics.

The `.env.local.example` file does not include the service role key, which is good, but there's no documentation warning about its sensitivity. If a server-side error included the environment variable in a stack trace, it could be leaked.

**Risk:** If the service role key is leaked, an attacker gains unrestricted access to all data bypassing RLS entirely.

**Recommended Fix:**
1. Use the service role key only in server-side API routes that need it, not in page components.
2. Consider caching the landing page statistics instead of querying on every page load with elevated privileges.
3. Add the service role key to `.env.local.example` with a clear warning comment.
4. Implement key rotation procedures.

**Priority:** P3

---

## Summary of Recommendations by Priority

### P0 — Fix Immediately
1. **Rewrite RLS policies** to enforce application roles at the database layer (C1)
2. **Harden `handle_new_user()` trigger** to never accept role from user metadata (C2)
3. **Make storage buckets private** and require authentication for access (C3)

### P1 — Fix Within Current Sprint
4. **Add authentication/authorization checks** to all API routes (H1)
5. **Validate file upload content** by type and size (H2)
6. **Replace `xlsx` package** and upgrade Next.js (H3)
7. **Implement rate limiting** on all endpoints (H4)
8. **Fix `custom_map_layers` RLS policies** (H5)

### P2 — Fix Within Next Sprint
9. **Enable MFA** for privileged accounts (M1)
10. **Strengthen password policy** (M2)
11. **Add HTTP security headers** (M3)
12. **Validate redirect parameters** in auth callbacks (M4)
13. **Implement comprehensive audit logging** (M5)
14. **Sanitize error messages** returned to clients (M6)

### P3 — Track in Backlog
15. **Use error codes** instead of URL-parameter error messages on login (L1)
16. **Add CSRF tokens** for critical operations (L2)
17. **Make upload logging reliable** (L3)
18. **Reduce service role key exposure surface** (L4)

---

## Appendix: Files Reviewed

### Authentication & Authorization
- `middleware.ts`
- `lib/supabase/middleware.ts`
- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `lib/supabase/admin.ts`
- `lib/auth.ts`
- `app/auth/callback/route.ts`
- `app/auth/confirm/route.ts`
- `app/login/page.tsx`
- `app/reset-password/page.tsx`
- `components/providers/UserRoleProvider.tsx`

### API Routes (all)
- `app/api/auth/role/route.ts`
- `app/api/admin/users/route.ts`
- `app/api/fields/route.ts`
- `app/api/fields/[id]/route.ts`
- `app/api/fields/[id]/trials/route.ts`
- `app/api/fields/[id]/annotations/route.ts`
- `app/api/fields/[id]/gis-layers/route.ts`
- `app/api/fields/[id]/gis-layers/[layerId]/route.ts`
- `app/api/fields/[id]/sampling-plans/route.ts`
- `app/api/analysis/route.ts`
- `app/api/report/route.ts`
- `app/api/metadata/route.ts`
- `app/api/map-layers/route.ts`
- `app/api/map-layers/[layerId]/route.ts`
- `app/api/upload/single/route.ts`
- `app/api/upload/folder/route.ts`
- `app/api/upload/paste/route.ts`
- `app/api/upload/photos/route.ts`
- `app/api/upload/gis/route.ts`
- `app/api/upload/gis/[layerId]/route.ts`
- `app/api/upload/review/route.ts`
- `app/api/upload/check-existing/route.ts`

### Database Migrations
- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_sample_metadata.sql`
- `supabase/migrations/003_raw_uploads_and_dedup.sql`
- `supabase/migrations/004_trial_photos.sql`
- `supabase/migrations/006_trial_gis_layers.sql`
- `supabase/migrations/007_user_roles.sql`
- `supabase/migrations/012_custom_map_layers.sql`
- `supabase/migrations/013_fix_gis_storage_update_policy.sql`
- `supabase/migrations/014_fields.sql`

### Core Library
- `lib/upload-pipeline.ts`
- `lib/parsers/classify.ts`

### Configuration
- `package.json`
- `next.config.js`
- `.env.local.example`
- `.gitignore`
- `app/layout.tsx`
