# SoilTrack Code Review

**Date:** 2026-02-19
**Reviewer:** Senior Full-Stack Developer (automated review)
**Scope:** Full codebase — architecture, quality, database, API, frontend, testing, performance, DevOps

---

## Executive Summary

SoilTrack is a Next.js 14 (App Router) + Supabase application for managing agricultural field trials, soil samples, and analytical reports. The codebase is well-organized at a macro level — feature-grouped components, a dedicated parser library, and clean Supabase client abstractions — but has significant gaps in **security** (authorization bypass, public storage buckets, open RLS policies), **testing** (zero test files), **validation** (no schema validation on any API route), and **performance** (no pagination, main-thread IDW rendering). The findings below are ordered by priority within each section.

**Rating by area:**

| Area | Rating |
|------|--------|
| Architecture & Design | Good |
| Code Quality | Fair |
| Database & Data Layer | Fair |
| API Design | Poor |
| Frontend | Fair |
| Testing | Critical — absent |
| Performance | Poor |
| DevOps & Deployment | Poor |

---

## 1. Architecture & Design

### Positive observations

- **Clear feature grouping:** Components under `components/trials/`, `components/fields/`, `components/data-hub/`, etc. follow a domain-based structure that is easy to navigate.
- **Supabase client abstraction:** Four client factories (`server.ts`, `client.ts`, `middleware.ts`, `admin.ts`) correctly separate server-component, browser, edge-middleware, and admin contexts.
- **Upload pipeline separation:** `lib/upload-pipeline.ts` encapsulates the parse → stage → load ETL workflow, keeping it out of route handlers.
- **Declarative column mapping:** `lib/parsers/column-maps.ts` uses alias-based column definitions that are easy to extend for new data types.
- **Role context provider:** `UserRoleProvider` computes derived booleans (`canUpload`, `canModify`, `canManageUsers`) once and distributes them via React context — no prop drilling for role checks.

### Findings

| # | File / Area | Issue | Why It Matters | Suggested Fix | Priority |
|---|-------------|-------|----------------|---------------|----------|
| A1 | `components/trials/TrialMap.tsx` (1,467 lines) | God component — contains GPS parsing, CSV parsing, IDW interpolation algorithm, color interpolation, two Leaflet custom layers, GIS upload handlers, metric discovery, and a 400-line JSX tree all in one file. | Impossible to test in isolation; any state change re-evaluates all `useMemo` hooks; hard to code-split; onboarding developers face a wall of interleaved concerns. | Extract into: `lib/map/mapUtils.ts` (parseGPS, parseCSV, IDW, color utils), `lib/map/discoverMetrics.ts`, `components/trials/map/IDWOverlay.tsx`, `components/trials/map/HeatmapLayer.tsx`, `components/trials/map/LayerPanel.tsx`, `components/trials/map/MetricLegend.tsx`. | **High** |
| A2 | `components/data-hub/FolderUpload.tsx` (615 lines) | Single component handles file classification, three sequential upload phases with retry logic, result reconciliation, and full UI. `handleUpload` alone is ~310 lines with 8 responsibilities. | Untestable; retry/timeout logic duplicated 3 times; impossible to reuse upload logic elsewhere. | Extract `uploadWithRetry()` helper, `classifyFiles()` utility, and split UI into `FolderUploadForm` + `FolderUploadResults`. | **High** |
| A3 | `components/fields/SamplingPlanPanel.tsx` (484 lines) | Mixes three geometry algorithms (random, grid, stratified), ray-casting `pointInPolygon`, boundary extraction, plan CRUD operations, and CSV export in one component. | Algorithms cannot be unit-tested without mounting a React component; geometry logic has no reuse path. | Move algorithms to `lib/sampling/generators.ts` and `lib/geo/pointInPolygon.ts`. | **Medium** |
| A4 | `app/api/` routes | No service layer — business logic (trial data reconciliation, treatment cleanup, upload staging) lives directly in route handlers. | Logic cannot be reused across routes or tested without HTTP; route handlers are 100-200 lines of interleaved DB calls and business rules. | Introduce `lib/services/` (e.g., `trialService.ts`, `uploadService.ts`) that route handlers delegate to. | **Medium** |
| A5 | `lib/auth.ts` line 14 | Unauthenticated callers receive `{ role: 'readonly', userId: null }` instead of a hard rejection. | Routes without explicit role checks silently grant readonly access to anyone who can reach the API. Combined with permissive RLS this creates a silent auth gap. | Return `null` or throw for unauthenticated callers; force routes to handle the null case explicitly. | **Medium** |

---

## 2. Code Quality

### Findings

| # | File / Area | Issue | Why It Matters | Suggested Fix | Priority |
|---|-------------|-------|----------------|---------------|----------|
| Q1 | `lib/utils.ts` lines 16-32 | `getProductColor()` and `getStatusColor()` hardcode the exact same color literals as `PRODUCT_COLORS` and `STATUS_COLORS` in `lib/constants/brand.ts`. Complete duplication. | Two sources of truth — a color change in `brand.ts` won't propagate to `utils.ts`. | Import from `brand.ts`: `return PRODUCT_COLORS[product] ?? '#6b7280'`. | **Medium** |
| Q2 | `components/data-hub/FolderUpload.tsx` lines 188, 292, 377 | Upload timeout (`120_000`ms), retry delay (`2000`ms), and retry count (`2`) are magic numbers repeated 3 times each. | Any change requires editing three places; easy to create inconsistency. | Extract `const UPLOAD_TIMEOUT_MS = 120_000`, `RETRY_DELAY_MS = 2000`, `MAX_RETRIES = 2`. | **Medium** |
| Q3 | `lib/parsers/column-maps.ts` lines 61, 79-82, 119-122, 135-140 | Alias arrays for `sample_no`, `date`, and `barcode` are copy-pasted across `soilHealth`, `soilChemistry`, `tissueChemistry`, and `sampleMetadata`. | Adding a new alias (e.g., "sample_number") requires editing 4 places. | Define shared `COMMON_ALIASES = { sample_no: [...], date: [...], barcode: [...] }` and spread into each map. | **Medium** |
| Q4 | `components/analysis/BarChartWithSE.tsx` line 15, `BoxPlotChart.tsx` line 19 | `CHART_COLORS` array duplicated verbatim in both files. | Any palette change requires editing two files. | Move to `lib/constants/charts.ts`. | **Low** |
| Q5 | `components/analysis/BarChartWithSE.tsx` lines 20-38, `BoxPlotChart.tsx` lines 24-42, `AnalysisClient.tsx` lines 23-41 | `GroupStats` and `MetricStats` interfaces duplicated 3 times. | Type drift risk across files. | Define once in `types/analysis.ts`. | **Low** |
| Q6 | `lib/parsers/generic-parser.ts` lines 133-141 | Dead conditional branch — both arms execute `map[lh] = targetField`. | Dead code confuses readers. | Replace with a single `map[lh] = targetField` assignment. | **Low** |
| Q7 | `components/trials/TrialMap.tsx` lines 92-101 | Hand-rolled CSV parser splits on literal `,` without handling RFC 4180 quoted fields. PapaParse is already a dependency. | A field value like `"Smith, John"` will produce corrupted columns. | Replace with `Papa.parse(text, { header: true })`. | **High** |
| Q8 | `lib/supabase/middleware.ts` lines 68-73 | Public routes are hardcoded as inline string comparisons scattered in a conditional. | Adding a new public route requires finding and editing nested conditionals. | Extract `const PUBLIC_ROUTES = ['/', '/login', '/api', ...]` and use `.some(prefix => path.startsWith(prefix))`. | **Low** |
| Q9 | `components/fields/SamplingPlanPanel.tsx` lines 93, 104, 143, 183, 380, 384 | Magic numbers: max attempts multiplier `100`, per-stratum attempts `50`, coordinate precision `1e6`, min/max point count `1`/`500`. | Intent is unclear; values can't be tuned or tested without reading implementation. | Extract named constants: `MAX_RANDOM_ATTEMPTS_MULTIPLIER`, `COORD_PRECISION`, `MIN_SAMPLE_POINTS`, `MAX_SAMPLE_POINTS`. | **Low** |

### Error handling

| # | File / Area | Issue | Why It Matters | Suggested Fix | Priority |
|---|-------------|-------|----------------|---------------|----------|
| Q10 | `app/(dashboard)/analysis/AnalysisClient.tsx` lines 83-85 | Empty `catch` block — analysis errors are silently swallowed. No error state shown to user. | User clicks "Run Analysis", nothing happens, no feedback. | Set an `error` state and render it; `console.error` at minimum. | **High** |
| Q11 | `app/(dashboard)/reports/ReportsClient.tsx` lines 31-33 | Empty `catch` block — report generation errors silently disappear. | Same UX problem as Q10. | Same fix — surface errors to the user. | **High** |
| Q12 | `components/fields/FieldAnnotationsPanel.tsx` line 36, `FieldGISLayersPanel.tsx` lines 81-83 + 97-99, `FieldTrialsPanel.tsx` lines 93-95, `SamplingPlanPanel.tsx` lines 294-296 | Six separate silent `catch` blocks across field panel components. | CRUD failures (delete, rename, unlink) are invisible to the user. | Add toast notifications or inline error messages for each operation. | **Medium** |
| Q13 | `lib/supabase/admin.ts` lines 11-13 | Returns `null` silently when `SUPABASE_SERVICE_ROLE_KEY` is missing. | Callers get a null client with no error; misconfigured environments fail silently at runtime. | Throw an error with a descriptive message at initialization. | **High** |
| Q14 | `lib/supabase/client.ts` lines 5-6, `server.ts` lines 8-9 | Non-null assertions (`!`) on environment variables with no runtime guard. | If env vars are missing, Supabase throws an opaque error with no helpful message. | Validate presence and throw with a clear message: `"Missing NEXT_PUBLIC_SUPABASE_URL"`. | **Medium** |

---

## 3. Database & Data Layer

### Schema overview

14 sequential migrations define 20+ tables with Row Level Security enabled. Core entities: `clients`, `trials`, `treatments`, `fields`, `soil_health_samples`, `soil_chemistry`, `plot_data`, `tissue_chemistry`, `sample_metadata`, `raw_uploads`, `upload_log`. A `load_and_track` RPC function handles atomic upserts with deduplication.

### Findings

| # | File / Area | Issue | Why It Matters | Suggested Fix | Priority |
|---|-------------|-------|----------------|---------------|----------|
| D1 | `001_initial_schema.sql` | **No standalone `trial_id` index** on `soil_chemistry`, `tissue_chemistry`, `soil_health_samples`, or `plot_data`. These tables have composite unique indexes that start with `trial_id`, but those are wide functional indexes the planner may not always choose. | `GET /api/analysis` and `GET /api/report` both filter by `trial_id` — these will degrade to sequential scans as tables grow. | Add `CREATE INDEX idx_<table>_trial ON <table>(trial_id)` for all four. | **High** |
| D2 | `001_initial_schema.sql` | `treatments` table has only `UNIQUE(trial_id, trt_number)` — no standalone `trial_id` index. | Queries filtering treatments by trial_id alone rely on the composite unique index, which is suboptimal for range scans. | Add `CREATE INDEX idx_treatments_trial ON treatments(trial_id)`. | **Medium** |
| D3 | All migrations | **No DOWN/rollback scripts.** None of the 14 migrations are reversible. Migration `005` contains `DELETE FROM upload_log WHERE trial_id NOT IN (SELECT id FROM trials)` — a destructive, irreversible data cleanup. | Cannot roll back a failed deployment; schema changes are one-way. | Add rollback SQL to each migration (at minimum for DDL changes). Use Supabase's `down.sql` convention. | **Medium** |
| D4 | `012_custom_map_layers.sql` lines 17-24 | **RLS `USING (true)` / `WITH CHECK (true)` on `custom_map_layers`** — no `auth.role()` check. The `anon` PostgREST role can SELECT, INSERT, and DELETE rows directly via the Supabase REST API. | **Any unauthenticated person can read, create, and delete custom map layers** by calling the Supabase URL directly. All other tables require `auth.role() = 'authenticated'`. | Change policies to `USING (auth.role() = 'authenticated')` and `WITH CHECK (auth.role() = 'authenticated')`. | **Critical** |
| D5 | `004_trial_photos.sql` line 29, `006_trial_gis_layers.sql` line 30 | Storage buckets `trial-photos` and `trial-gis` are **public** (`public = true`). SELECT storage policies have no auth check. | Anyone with a direct Supabase storage URL can download trial photos and GIS files without authentication. | Set `public = false` on both buckets and restrict storage policies to authenticated users. | **High** |
| D6 | `load_and_track` RPC (`003_raw_uploads_and_dedup.sql`) | Table name parameter is validated against a hardcoded whitelist — **positive finding, no injection risk**. | N/A — this is done correctly. | N/A | N/A |
| D7 | All route handlers | All application-level queries use the Supabase JS client (PostgREST-based) — **no raw SQL injection vectors from the application layer**. | N/A — positive finding. | N/A | N/A |

---

## 4. API Design

### Findings

| # | File / Area | Issue | Why It Matters | Suggested Fix | Priority |
|---|-------------|-------|----------------|---------------|----------|
| P1 | All 22 route files | **No schema validation library** (no Zod, Joi, or Yup). All routes use manual `if (!field)` presence checks only. No type coercion, no structural validation, no enum checks. | Malformed requests can corrupt database state. Example: `POST /api/fields/[id]/sampling-plans` accepts any JSON for `points` and `strategy` without validating structure or enum membership. | Add Zod schemas for all request payloads. Example: `const CreateFieldSchema = z.object({ name: z.string().min(1), client_id: z.string().uuid().optional(), ... })`. | **Critical** |
| P2 | `app/api/upload/review/route.ts` lines 12-31 | **`GET /api/upload/review` has no authentication check.** Any caller who knows a UUID can retrieve the full `raw_uploads` record including all original file data in `raw_rows`. | Raw uploaded scientific data exposed to unauthenticated users. | Add `const { role } = await getUserRole()` and return 401/403 for unauthorized callers. | **Critical** |
| P3 | All 7 `fields/` API routes | **Entire fields API family has no role-based authorization.** Any Supabase-authenticated user (including `readonly`) can create, update, and delete fields, sampling plans, annotations, and GIS layers. | Contradicts the role model in `lib/auth.ts`. A readonly user can mutate field data. | Add `canModify(role)` / `canUpload(role)` checks to all mutating endpoints. | **Critical** |
| P4 | All routes | **`error.message` from Supabase passed directly to clients** in 500 responses: `NextResponse.json({ error: error.message }, { status: 500 })`. | Supabase error messages expose table names, column names, constraint names, and SQL fragments. | Return generic messages to clients: `{ error: "Failed to create field" }`; log the real error server-side. | **High** |
| P5 | 9+ list endpoints | **Zero pagination on any list endpoint.** `GET /api/fields`, `GET /api/analysis`, `GET /api/admin/users`, `GET /api/report`, all sub-resource GETs — none support `limit`/`offset`. | `GET /api/analysis` loads entire data tables into JS memory, pivots them, and returns full `values` arrays. A trial with 100k chemistry rows could OOM the Next.js server. | Add `?page=1&limit=50` support. For analysis, paginate on the server or stream results. | **High** |
| P6 | `app/api/metadata/route.ts` line 127, `upload/paste/route.ts` line 90, `upload/single/route.ts` line 177 | **Error responses return HTTP 200** instead of 4xx/5xx. Format: `{ status: 'error', detail: err.message }` with no non-2xx status code. | Clients cannot distinguish success from failure by HTTP status; monitoring tools won't flag these as errors. | Return `NextResponse.json({ error: detail }, { status: 400 })` or `{ status: 500 }`. | **High** |
| P7 | `app/api/fields/[id]/sampling-plans/route.ts` line 55, `annotations/route.ts` line 48, `trials/route.ts` line 52 | **DELETE uses query parameters** (`?plan_id=X`) instead of URL segments (`/sampling-plans/[planId]`). | Non-RESTful; breaks HTTP caching semantics; ambiguous route signature. | Create proper `[planId]/route.ts` nested routes. | **Low** |
| P8 | All API routes | **No API versioning** (no `/api/v1/` prefix). | If the API needs breaking changes, all consumers break simultaneously. | Low priority for internal-only APIs; add versioning if external consumers are planned. | **Low** |

---

## 5. Frontend

### Findings

| # | File / Area | Issue | Why It Matters | Suggested Fix | Priority |
|---|-------------|-------|----------------|---------------|----------|
| F1 | All tab components: `FieldDetailTabs.tsx` lines 119-157, `TrialDetailTabs.tsx` lines 69-182, `AnalyticsDashboard.tsx` lines 47-65 | **No ARIA tab roles.** Tab bars use `<button>` elements but none set `role="tab"`, `aria-selected`, `role="tablist"`, or `role="tabpanel"`. | Tabbed interfaces are completely inaccessible to screen reader users; no keyboard arrow-key navigation between tabs. | Implement the WAI-ARIA Tabs pattern: `role="tablist"` on container, `role="tab"` + `aria-selected` on each button, `role="tabpanel"` + `aria-labelledby` on content. | **High** |
| F2 | `components/ui/Modal.tsx` | Modal has no `role="dialog"`, no `aria-modal="true"`, no `aria-labelledby`, no focus trap, and no focus restoration on close. | Screen readers don't announce the modal; keyboard users can tab behind it; focus isn't returned to the trigger on dismiss. | Add `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the `<h2>`, trap focus with a focus-trap library, and restore focus on unmount. | **High** |
| F3 | Multiple icon buttons: `FieldAnnotationsPanel.tsx` line 64, `PhotosTab.tsx` lines 178-185, `TrialStatusToggle.tsx` lines 87-109 | **Icon-only buttons without `aria-label`**. Trash, edit, and toggle buttons render only SVG icons with no accessible name. | Completely invisible to screen reader users; announced as "button" with no context. | Add `aria-label="Delete annotation"`, `aria-label="Delete photo"`, etc. | **High** |
| F4 | `components/trials/TrialMap.tsx` line 24-27 | **Leaflet marker icons loaded from unpkg CDN** without Subresource Integrity. Version `1.9.4` is hardcoded. | External CDN dependency for core UI; CDN compromise could serve malicious assets; version can drift from `package.json`. | Bundle icons locally from `node_modules/leaflet/dist/images/`. | **High** |
| F5 | `FieldDetailTabs.tsx` lines 119-157, `TrialDetailTabs.tsx` lines 69-182 | **Tab switch destroys and remounts** child components (conditional rendering with `&&`). Switching away from the Map tab destroys the Leaflet instance and all uploaded GIS layer state. | Users lose in-session work when switching tabs; expensive Leaflet map is re-initialized on every tab visit. | Use CSS `display: none` to hide inactive tabs, or persist state in a parent/context. | **High** |
| F6 | All forms | **Minimal client-side validation.** `NewFieldForm` validates only `name`; `ManagementLog` validates only `newEntry.trim()` (date unchecked); `PasteData` checks `!csvText.trim()` only; `SingleFileUpload` checks `!file` only. No file size limits. No `required` or `aria-required` attributes. | Bad data reaches the server; no accessible validation messaging for assistive tech. | Add Zod/Yup schemas for form data; set `aria-required="true"` and `aria-invalid` on inputs; validate file size client-side. | **Medium** |
| F7 | `components/data-hub/SingleFileUpload.tsx` lines 39-50, `PasteData.tsx` lines 31-42 | **Identical `useEffect`** to fetch `/api/upload/check-existing` when `selectedTrial` changes, including the same `cancelled` flag pattern. | Copy-pasted hook logic; change in one won't propagate. | Extract a custom hook: `useExistingDataTypes(selectedTrial)`. | **Medium** |
| F8 | `components/trials/TrialMapWrapper.tsx`, `components/fields/FieldMapWrapper.tsx` | **Nearly identical `MapErrorBoundary` class components** — differ only in the wrapped component and one error message string. | Duplication of error boundary boilerplate. | Create a generic `MapWrapper` HOC parameterized by the inner component. | **Low** |
| F9 | `app/(dashboard)/trials/[id]/TrialDetailTabs.tsx` lines 15-28 | **All props typed as `any`** (`trial: any`, `treatments: any[]`, `plots: any[]`, etc.). `dataCoverage` prop declared but never read — dead prop. | Bypasses TypeScript's safety net entirely; any field access typo compiles silently. | Define proper interfaces (`Trial`, `Treatment`, etc.) and use them. | **Medium** |
| F10 | `components/fields/FieldDetailTabs.tsx` line 72 | **`clients` prop declared** in the interface but never forwarded to any child — dead prop. | Dead code; misleads readers into thinking clients data is used. | Remove from interface and call site. | **Low** |
| F11 | `components/landing/ParticleNetwork.tsx` line 144 vs 150 | **Memory leak.** `addEventListener` uses an inline arrow function but `removeEventListener` passes a different named function reference — the listener is never actually removed. | On every mount/unmount cycle, a new resize listener accumulates. Over time, multiple resize handlers fire simultaneously. | Use a single named function reference for both add and remove. | **Medium** |
| F12 | `components/analysis/BarChartWithSE.tsx`, `BoxPlotChart.tsx` | **Charts have no accessible text alternative** — no `aria-label` on chart containers, no visually-hidden description. | Chart data is invisible to screen reader users. | Add `aria-label` describing the chart purpose; consider a "view as table" toggle (the data tables in `AnalysisClient` partially serve this role). | **Medium** |
| F13 | `app/(dashboard)/` client components | **No error boundaries** on `AnalysisClient`, `SettingsClient`, `DataHubClient`, `ReportsClient`. Only `TrialDetailTabs` and the map wrappers have error boundaries. | An unhandled render error in any of these components crashes the entire dashboard. | Add route-level `error.tsx` files for each dashboard section, or a shared error boundary wrapper. | **Medium** |

---

## 6. Testing

### Findings

| # | File / Area | Issue | Why It Matters | Suggested Fix | Priority |
|---|-------------|-------|----------------|---------------|----------|
| T1 | Entire codebase | **Zero test files.** No `__tests__/` directories, no `*.test.ts` or `*.spec.ts` files, no test framework in `package.json` (no Jest, Vitest, Playwright, Cypress, or Testing Library). | No regression protection for any business logic, API route, or UI component. Every deployment is a manual QA exercise. | **Immediate action:** Add Vitest + React Testing Library. Start with critical business logic. | **Critical** |
| T2 | `lib/upload-pipeline.ts` | The core ETL pipeline (parse → stage → load) has no tests despite being the most critical business logic in the app. | A parser bug or column-mapping error silently corrupts trial data in the database. | Unit-test `stageFile()`, `parseAndStage()`, and the column mapping with fixture CSVs/Excel files. | **Critical** |
| T3 | `lib/parsers/` (7 parser files) | Parsers for soil health, soil chemistry, tissue chemistry, plot data, sample metadata, and GIS have no tests. | Parser regressions (e.g., a new column alias) are undetectable without manual data import. | Test each parser with known-good input files and assert output shape/values. | **Critical** |
| T4 | `app/api/` (22 route files) | No integration tests for any API endpoint. | Auth bypass bugs (like P2 and P3) can only be caught by manual testing or code review. | Add integration tests with `next/test-utils` or Supertest-style endpoint testing. | **High** |
| T5 | Edge cases | No tests for: empty datasets, duplicate entries (dedup logic in `load_and_track`), concurrent edits, malformed CSV/Excel files, boundary conditions in sampling algorithms. | Silent data corruption or crashes on unexpected input. | Add edge-case test suites for each parser and the `load_and_track` RPC. | **High** |

---

## 7. Performance

### Findings

| # | File / Area | Issue | Why It Matters | Suggested Fix | Priority |
|---|-------------|-------|----------------|---------------|----------|
| R1 | `GET /api/analysis` (`app/api/analysis/route.ts`) | Loads **entire data tables** (`SELECT *` from `soil_chemistry`, `tissue_chemistry`, etc.) into server memory, pivots them in JS, and returns full `values` arrays in every response. No pagination, no row limit. | A cross-trial query over 100k rows could OOM the Next.js server or produce a 50MB+ JSON response. | Perform aggregation in SQL (GROUP BY with AVG/STDDEV); paginate raw data; add `LIMIT` guards. | **Critical** |
| R2 | `components/trials/TrialMap.tsx` lines 325-417 | **IDW interpolation runs on the main thread** in a nested pixel-level loop on every `moveend` and `zoomend` event. At 4px grid resolution on a 1000×600 viewport, that's ~37,500 IDW evaluations per paint. | Visible UI jank on pan/zoom, especially with 50+ sample points. The map becomes unusable. | Move IDW computation to a Web Worker; debounce the `moveend`/`zoomend` handlers. | **High** |
| R3 | `components/data-hub/FolderUpload.tsx` lines 274-430 | **Files uploaded sequentially** in `for` loops — 10 data files means 10 sequential HTTP round-trips. | Upload time scales linearly with file count; user waits for each file to complete before the next starts. | Use `Promise.all()` (with concurrency limit) for data file and photo uploads after the trial summary is processed. | **High** |
| R4 | `components/fields/SamplingPlanPanel.tsx` line 93 | **Random point generation** uses `maxAttempts = numPoints * 100`. For `numPoints = 500`, that's 50,000 random attempts — all synchronous on the main thread. | Freezes UI for complex polygon shapes where many random points fall outside the boundary. | Use a more efficient algorithm (Halton sequence, pre-clipped bounding box); move to a Web Worker for large point counts. | **Medium** |
| R5 | `components/data-hub/FolderUpload.tsx` line 536, `TrialMap.tsx` line 1161 | **`key={i}` (array index)** used as React list keys in file result rows and map CircleMarkers. | When items are removed, all subsequent items re-render unnecessarily due to shifted keys. | Use stable identifiers: `key={r.filename}` for files, `key={s.sample_no}` for samples. | **Medium** |
| R6 | `lib/parsers/generic-parser.ts` lines 96-116 | **O(n × aliases) header resolution** — for each column definition, iterates all file headers to find a match. Repeated per row in `resolveValue`. | Slow parsing for wide files (50+ columns). | Pre-build a `Map<normalizedAlias, dbField>` once in `resolveHeaders`, then use O(1) lookups per row. | **Low** |
| R7 | No caching | **No caching layer** for static reference data (soil types, crop categories, client lists). Every page load re-fetches from Supabase. | Unnecessary database load and latency on every navigation. | Use Next.js `revalidate` for ISR on reference data pages, or SWR/React Query with `staleTime` on the client. | **Medium** |
| R8 | `GET /api/report` (`app/api/report/route.ts`) | Report data is fetched and returned synchronously. No background processing for large reports. | Large trial reports could timeout on slow connections. | For heavy reports, consider a background job that generates a downloadable file, or stream the response. | **Low** |

---

## 8. DevOps & Deployment

### Findings

| # | File / Area | Issue | Why It Matters | Suggested Fix | Priority |
|---|-------------|-------|----------------|---------------|----------|
| O1 | Root directory | **No CI/CD pipeline.** No GitHub Actions, GitLab CI, or any automation configuration. No `.github/workflows/` directory. | No automated linting, type-checking, or security scanning on PRs. Every merge is a leap of faith. | Add a GitHub Actions workflow with: `tsc --noEmit`, `eslint`, `npm audit`, and (once tests exist) `vitest run`. | **Critical** |
| O2 | Root directory | **No linter configuration.** No `.eslintrc`, `eslint.config.js`, or ESLint in `package.json`. | Code style inconsistencies accumulate; common bugs (unused variables, missing deps in hooks) go undetected. | Add `eslint` + `eslint-config-next` + `eslint-plugin-react-hooks`. | **High** |
| O3 | `.env.local.example` | **`SUPABASE_SERVICE_ROLE_KEY` is missing** from the example file, but `lib/supabase/admin.ts` reads it. | A new developer setting up the project gets a silently broken admin client (returns `null`). | Add `SUPABASE_SERVICE_ROLE_KEY=your_service_role_key` to `.env.local.example`. | **High** |
| O4 | All API routes | **No structured logging.** Routes use no logging library; errors are only returned in HTTP responses. There are no `console.error` calls with context (request ID, user ID, route path). | No observability in production; debugging requires reproducing the exact request. | Add a structured logger (e.g., `pino`) with request context. Log errors server-side before returning generic messages to clients. | **High** |
| O5 | All API routes | **Database error messages returned to clients** (see P4) may contain **sensitive schema information** — table names, column names, constraint names. | Information disclosure to potential attackers. | Log full errors server-side; return generic error messages to clients. | **High** |
| O6 | `package.json` | **No `npm audit` or dependency scanning** configured. | Known vulnerabilities in dependencies go undetected. | Add `npm audit` to CI, or integrate Dependabot / Snyk. | **Medium** |
| O7 | Root directory | **No Dockerfile or container configuration.** | Deployment is environment-specific and not reproducible. | Add a multi-stage `Dockerfile` for consistent builds. | **Low** |

---

## Priority Summary

### Critical (fix immediately)

| ID | Summary |
|----|---------|
| D4 | `custom_map_layers` RLS allows unauthenticated world access |
| P1 | No schema validation on any API route |
| P2 | `GET /api/upload/review` exposes data without auth |
| P3 | Entire fields API has no role-based authorization |
| T1 | Zero test files in the entire codebase |
| T2 | Core upload pipeline has no tests |
| T3 | All parsers untested |
| R1 | `GET /api/analysis` loads full tables into memory — OOM risk |
| O1 | No CI/CD pipeline |

### High (fix before next release)

| ID | Summary |
|----|---------|
| A1 | `TrialMap.tsx` 1,467-line god component |
| A2 | `FolderUpload.tsx` 615-line component with 310-line function |
| D1 | Missing `trial_id` indexes on 4 core data tables |
| D5 | Public storage buckets expose trial photos and GIS files |
| P4 | Database error messages leaked to API clients |
| P5 | Zero pagination on any list endpoint |
| P6 | Error responses return HTTP 200 instead of 4xx/5xx |
| Q7 | Hand-rolled CSV parser breaks on quoted commas |
| Q10 | Analysis errors silently swallowed |
| Q11 | Report generation errors silently swallowed |
| Q13 | Silent null return on missing service role key |
| F1 | No ARIA tab roles on any tabbed interface |
| F2 | Modal missing dialog role, focus trap, focus management |
| F3 | Icon-only buttons without accessible names |
| F4 | Leaflet icons from external CDN without SRI |
| F5 | Tab switching destroys stateful components / loses user work |
| T4 | No integration tests for API endpoints |
| T5 | No edge case tests |
| R2 | IDW interpolation blocks main thread |
| R3 | Files uploaded sequentially instead of in parallel |
| O2 | No linter configuration |
| O3 | Service role key missing from env example |
| O4 | No structured logging |
| O5 | Sensitive schema info in error responses |

### Medium

| ID | Summary |
|----|---------|
| A3-A5 | Component decomposition, service layer, auth default |
| D2-D3 | Treatments index, migration reversibility |
| Q1-Q3 | Constant duplication, magic numbers |
| Q12, Q14 | Silent catches in field panels, env var guards |
| F6-F7 | Form validation, duplicated hooks |
| F9, F11-F13 | `any` types, memory leak, chart a11y, error boundaries |
| R4-R5, R7 | Sampling perf, array-index keys, caching |
| O6 | Dependency scanning |

### Low

| ID | Summary |
|----|---------|
| Q4-Q6, Q8-Q9 | Minor duplication, dead code, hardcoded routes |
| P7-P8 | REST conventions, API versioning |
| F8, F10 | MapWrapper duplication, dead prop |
| R6, R8 | Parser perf, report streaming |
| O7 | Dockerfile |

---

## Recommended Action Plan

1. **Week 1 — Security:** Fix D4 (RLS policies), P2/P3 (auth gaps), D5 (public buckets), P4/O5 (error leakage).
2. **Week 2 — Foundation:** Add Vitest + ESLint (O1, O2). Write first tests for parsers and upload pipeline (T2, T3). Add Zod validation to API routes (P1).
3. **Week 3 — API Hardening:** Add pagination (P5), fix HTTP status codes (P6), add structured logging (O4), add `trial_id` indexes (D1).
4. **Week 4 — Frontend:** Fix accessibility (F1-F3), fix tab destruction (F5), fix Modal (F2), decompose TrialMap (A1).
5. **Ongoing:** Decompose large components (A2, A3), add integration tests (T4), add caching (R7), move IDW to Web Worker (R2).
