# SoilTrack

Trial management and soil health tracking platform for Metagen Australia.

## Tech Stack

- **Framework:** Next.js 14 (App Router) with TypeScript (strict mode)
- **Database/Auth:** Supabase (PostgreSQL + Row Level Security + Auth with PKCE)
- **Styling:** Tailwind CSS 3 with custom brand tokens defined in `tailwind.config.ts`
- **Fonts:** Instrument Sans (body) + JetBrains Mono (code), loaded via `next/font/google`
- **Charts:** Recharts
- **Maps:** Leaflet + react-leaflet + leaflet.heat (heatmaps for dense point layers)
- **File parsing:** PapaParse (CSV), xlsx (Excel), shpjs (Shapefile), @tmcw/togeojson (KML/KMZ), jszip
- **Icons:** lucide-react
- **Types:** @types/geojson, @types/leaflet, custom stubs in `types/` (leaflet-heat, shpjs)

## Commands

- `npm run dev` — Start development server
- `npm run build` — Production build
- `npm run lint` — ESLint via eslint-config-next (ESLint 9)
- No test framework is configured

## Project Structure

```
app/                        # Next.js App Router
├── page.tsx                # Public landing page
├── layout.tsx              # Root layout (fonts, metadata)
├── globals.css             # Tailwind base + custom classes
├── login/                  # Login + forgot password
├── reset-password/         # Password setup (invite/recovery flow)
├── auth/
│   ├── callback/route.ts   # PKCE code exchange
│   └── confirm/route.ts    # OTP/token_hash verification
├── (dashboard)/            # Route group: authenticated pages
│   ├── layout.tsx          # UserRoleProvider + AppShell wrapper
│   ├── dashboard/          # Overview stats + trial list
│   ├── trials/             # Trial list and trial detail ([id])
│   │   └── [id]/           # TrialDetailTabs + server data fetching
│   ├── analytics/          # Portfolio analytics (map + summary)
│   ├── analysis/           # Statistical charts (bar + boxplot)
│   ├── data-hub/           # Upload interface (folder, single, paste)
│   ├── clients/            # Client/grower management
│   ├── reports/            # Report generation
│   └── settings/           # User settings, export, admin user mgmt
└── api/                    # API routes (see below)

components/
├── analysis/               # BarChartWithSE, BoxPlotChart
├── data-hub/               # FolderUpload, SingleFileUpload, PasteData, ColumnReview, UploadLog
├── layout/                 # AppShell, Sidebar, PageHeader
├── providers/              # UserRoleProvider (React context)
├── trials/                 # TrialDetailTabs, tables, maps, photos, editable fields
│   ├── TrialCard.tsx       # Trial list card
│   ├── TrialMap.tsx        # Leaflet map with GIS layers, sample points, heatmaps
│   ├── TrialMapWrapper.tsx # Dynamic import wrapper (SSR disabled for Leaflet)
│   ├── TrialStatusToggle.tsx
│   ├── EditableField.tsx   # Inline-editable trial metadata fields
│   ├── ManagementLog.tsx   # Activity timeline per trial
│   ├── SoilHealthTable.tsx
│   ├── PlotDataTable.tsx
│   ├── MetadataTable.tsx   # Assay results / sample metadata table
│   ├── TreatmentsTable.tsx
│   └── PhotosTab.tsx
├── landing/                # AnimatedCounter, ParticleNetwork
├── clients/                # ClientCard
└── ui/                     # Button, Modal, StatCard, StatusPill, DataBadge, ProductTag

lib/
├── auth.ts                 # getUserRole(), canUpload(), canModify(), canManageUsers()
├── upload-pipeline.ts      # Core upload orchestration (parse → stage → transform → load)
├── utils.ts                # cn(), formatDate(), getProductColor(), getStatusColor()
├── constants/brand.ts      # Brand colour + product constants
├── parsers/
│   ├── classify.ts         # Filename → FileClassification type
│   ├── column-maps.ts      # Declarative column mapping configs (aliases, pivot modes)
│   ├── generic-parser.ts   # Direct + wide-to-long pivot parser engine
│   ├── gis.ts              # Client-side GIS parser (GeoJSON/KML/KMZ/Shapefile → FeatureCollection)
│   ├── parseTrialSummary.ts # Excel workbook parser for trial setup
│   └── parse*.ts           # Per-type parsers (SoilHealth, SoilChemistry, PlotData, etc.)
└── supabase/
    ├── client.ts           # Browser client (createBrowserClient)
    ├── server.ts           # Server component client (createServerClient)
    ├── admin.ts            # Service-role client (bypasses RLS, for landing stats)
    └── middleware.ts        # Session refresh + auth redirect logic

types/                      # Custom type declarations
├── leaflet-heat.d.ts       # Type stub for leaflet.heat plugin
└── shpjs.d.ts              # Type stub for shpjs library

supabase/
├── migrations/             # 001–013: sequential SQL migrations
├── seed.sql                # Sample data (3 clients, 3 trials)
└── templates/              # Branded email templates (invite, confirm, reset)
```

## Architecture

### Server/Client Split

- **Server Components** fetch data using `createServerSupabaseClient()` and pass props to client components
- **Client Components** (marked `'use client'`) handle interactivity — tabs, uploads, forms, maps
- **API Routes** (`app/api/`) are thin controllers that validate auth/roles, then delegate to `lib/upload-pipeline.ts` or query Supabase directly
- **Middleware** (`middleware.ts` → `lib/supabase/middleware.ts`) refreshes sessions and redirects unauthenticated users to `/login`

### Upload Pipeline

The upload flow is: **parse raw file → stage in `raw_uploads` → apply column mapping → call `load_and_track()` RPC** (atomic upsert + tracking). Column mappings are declarative in `lib/parsers/column-maps.ts` — add new aliases there to support different lab formats without code changes. If unmapped columns exist, the upload pauses in `needs_review` status for user column review.

### GIS / Spatial Layers

GIS files are parsed **client-side** in `lib/parsers/gis.ts` — supports GeoJSON, KML, KMZ, and Shapefiles (as ZIP). Multi-layer shapefile ZIPs (e.g. John Deere Ops exports containing multiple `.shp` files) are automatically split into separate named layers. Raw files are stored in the `trial-gis` Supabase Storage bucket; parsed GeoJSON is stored as JSONB in `trial_gis_layers`. Large GeoJSON payloads are uploaded to storage rather than sent inline to avoid 413 errors.

The trial Map tab renders layers on a Leaflet map with:
- Trial GPS marker and soil sample point markers
- GIS layers with toggleable visibility and custom styling
- Automatic heatmap rendering (via `leaflet.heat`) for dense point layers (>100 points)
- Canvas rendering for performance with large datasets
- Custom map layers from shapefile attribute columns (stored in `custom_map_layers`)

Raw `.shp` files are rejected — users must upload the complete shapefile as a `.zip` archive.

### Roles

Three roles: `admin`, `upload`, `readonly`. Checked server-side via `getUserRole()` in `lib/auth.ts` and client-side via `UserRoleProvider` context. All upload endpoints require `upload` or `admin`; delete/modify endpoints require `admin`.

### Database

All data access goes through the Supabase JS client — no ORM. Key tables: `trials`, `treatments`, `soil_health_samples`, `soil_chemistry`, `plot_data`, `tissue_chemistry`, `sample_metadata`, `management_log`, `trial_photos`, `trial_gis_layers`, `custom_map_layers`, `raw_uploads`, `upload_log`, `trial_data_files`, `profiles`. The `load_and_track()` RPC function handles atomic upserts with natural-key deduplication.

Migrations are in `supabase/migrations/` numbered 001–013. When adding new migrations, use the next sequential number.

### Data Model — Natural Keys

`sample_no` is NOT a globally unique row identifier. It maps to a treatment/block (sample point), and the same sample point can be measured at **multiple timepoints**. `barcode` is the UID for each chemistry/tissue sample and is stored on all sample tables for cross-linking. Deduplication keys must always include `date` and `barcode`:

| Table | Natural Key (dedup index) |
|---|---|
| `soil_health_samples` | `(trial_id, sample_no, date, property, block)` |
| `soil_chemistry` | `(trial_id, barcode, sample_no, date, metric)` |
| `tissue_chemistry` | `(trial_id, barcode, sample_no, date, tissue_type, metric)` |
| `sample_metadata` | `(trial_id, assay_type, barcode, sample_no, date, metric)` |
| `plot_data` | `(trial_id, plot, trt_number, rep)` |

### API Routes

| Route | Methods | Purpose |
|---|---|---|
| `/api/auth/role` | GET | Current user's role |
| `/api/admin/users` | GET, PATCH | List/update user profiles (admin) |
| `/api/analysis` | GET | Statistical analysis (mean, SE, SD, box-plot) |
| `/api/metadata` | GET, POST, DELETE | Sample metadata CRUD |
| `/api/report` | GET | Full trial report data |
| `/api/upload/check-existing` | GET | Check existing data types for a trial |
| `/api/upload/folder` | POST | Multi-file folder upload |
| `/api/upload/single` | POST | Single file upload |
| `/api/upload/paste` | POST | Paste CSV text import |
| `/api/upload/review` | GET, POST | Column mapping review |
| `/api/upload/photos` | POST | Photo upload to storage |
| `/api/upload/gis` | POST | GIS layer upload |
| `/api/upload/gis/[layerId]` | DELETE | Delete GIS layer |
| `/api/map-layers` | POST | Create custom map layer from shapefile attributes |
| `/api/map-layers/[layerId]` | DELETE | Delete custom map layer |

## Key Conventions

- **Path alias:** `@/*` maps to project root (configured in `tsconfig.json`)
- **Imports:** Use `@/lib/...`, `@/components/...`, `@/app/...` for all imports
- **File classification:** Based on filename keywords in `lib/parsers/classify.ts` — file types are `trialSummary`, `soilHealth`, `soilChemistry`, `plotData`, `tissueChemistry`, `sampleMetadata`, `photo`, `gis`
  - `sampleMetadata` matches: `"assay result"`, `"assay data"`, `"sample metadata"`, `"sample_metadata"`
  - `gis` matches extensions: `.shp`, `.dbf`, `.shx`, `.prj`, `.kml`, `.kmz`, `.geojson`
- **Column mappings:** Declarative in `lib/parsers/column-maps.ts` — add aliases to support new lab formats without changing parser logic
- **Brand colours:** Defined in `tailwind.config.ts` under `meta.*`, `green.*`, `brand.*` — use these instead of arbitrary colour values
- **Utility classes:** Use `cn()` from `lib/utils.ts` for conditional class merging
- **Date formatting:** Use `formatDate()` from `lib/utils.ts` (en-AU locale)
- **Supabase clients:** Use `createServerSupabaseClient()` in server components/API routes, `createBrowserSupabaseClient()` in client components, `createAdminSupabaseClient()` only for public-facing stats (bypasses RLS)
- **Leaflet SSR:** Map components must use `next/dynamic` with `ssr: false` because Leaflet requires `window`. See `TrialMapWrapper.tsx` for the pattern
- **Body size:** Next.js config sets `serverActions.bodySizeLimit: '50mb'` for large uploads; `xlsx` is in `serverComponentsExternalPackages` to avoid webpack bundling issues
- **Transpile packages:** `shpjs` and `but-unzip` are in `transpilePackages`; custom webpack config forces `browser` condition first for `but-unzip` to avoid Node.js entry in client bundles
- **API route timeouts:** Upload routes export `maxDuration = 60` for Vercel serverless functions
- **Auth flow:** Invite-only (no public signup). Users are invited via Supabase, accept via email link, set password at `/reset-password`. PKCE flow with AMR-based invite detection in `/auth/callback`
- **RLS:** All tables have Row Level Security enabled. Policies grant authenticated users access; `profiles` has fine-grained admin-only update policies
- **Storage buckets:** `trial-photos` (trial photo files), `trial-gis` (raw GIS files — shapefiles, KML, etc.)
- **GIS validation:** `lib/parsers/gis.ts` validates geometry types and filters out null/invalid geometries before storing. GeometryCollection features with null children are cleaned recursively

## Environment Variables

Required in `.env.local` (see `.env.local.example`):

```
NEXT_PUBLIC_SUPABASE_URL=<supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

The admin client in `lib/supabase/admin.ts` also requires `SUPABASE_SERVICE_ROLE_KEY` for server-side operations that bypass RLS.
