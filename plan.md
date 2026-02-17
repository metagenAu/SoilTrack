# GIS Data Support for Trials — Implementation Plan

## Overview

Add the ability to upload, store, and view GIS spatial data (Shapefiles, KML, KMZ, GeoJSON) on a per-trial basis. This adds a new **"Map"** tab to the trial detail page showing an interactive Leaflet map with:
- The trial's GPS location marker
- Soil sample point markers (from existing `soil_health_samples` lat/lon)
- User-uploaded GIS layers (field boundaries, plot layouts, zones, etc.)

---

## Architecture Decisions

### Storage Strategy
- **Raw GIS files** → Supabase Storage (new bucket: `trial-gis`)
- **Parsed GeoJSON** → Stored in a JSONB column in PostgreSQL for fast rendering (avoids re-parsing on every page load)
- **Metadata** → New `trial_gis_layers` database table

### GIS File Parsing (all client-side in the browser)
- **GeoJSON** (`.geojson`, `.json`) — native, no parsing needed
- **KML** (`.kml`) — parse with `@tmcw/togeojson` (lightweight, well-maintained)
- **KMZ** (`.kmz`) — unzip with `JSZip`, then parse inner `.kml` with `@tmcw/togeojson`
- **Shapefile** (`.shp` + `.dbf` + `.shx` + `.prj`) — parse with `shpjs` (converts to GeoJSON)

**Why client-side?** Keeps the API route simple (just receives the already-parsed GeoJSON + raw file), avoids server-side native dependencies, and the files are typically small (< 5MB).

### Map Library
`leaflet` + `react-leaflet` are already installed and typed — use them directly. The map component must be dynamically imported (`next/dynamic` with `ssr: false`) since Leaflet requires `window`.

---

## Implementation Steps

### Step 1: Database Migration (`supabase/migrations/004_trial_gis_layers.sql`)

```sql
-- GIS Layers: spatial data per trial
CREATE TABLE trial_gis_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id TEXT NOT NULL REFERENCES trials(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- user-facing layer name (defaults to filename)
  file_type TEXT NOT NULL CHECK (file_type IN ('shapefile', 'kml', 'kmz', 'geojson')),
  storage_path TEXT NOT NULL,          -- path in trial-gis bucket
  geojson JSONB NOT NULL,             -- parsed GeoJSON FeatureCollection for rendering
  feature_count INT DEFAULT 0,
  style JSONB DEFAULT '{"color": "#3b82f6", "weight": 2, "fillOpacity": 0.15}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_trial_gis_layers_trial ON trial_gis_layers(trial_id);

ALTER TABLE trial_gis_layers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON trial_gis_layers
  FOR ALL USING (auth.role() = 'authenticated');

-- Update trial_data_files constraint to include 'gis'
ALTER TABLE trial_data_files
  DROP CONSTRAINT IF EXISTS trial_data_files_file_type_check;
ALTER TABLE trial_data_files
  ADD CONSTRAINT trial_data_files_file_type_check
  CHECK (file_type IN ('soilHealth', 'soilChemistry', 'plotData', 'tissueChemistry', 'sampleMetadata', 'photo', 'gis'));

-- Storage bucket for GIS files
INSERT INTO storage.buckets (id, name, public)
VALUES ('trial-gis', 'trial-gis', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload gis"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'trial-gis' AND auth.role() = 'authenticated');
CREATE POLICY "Anyone can view gis files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'trial-gis');
CREATE POLICY "Authenticated users can delete gis"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'trial-gis' AND auth.role() = 'authenticated');
```

### Step 2: Install NPM Dependencies

```bash
npm install @tmcw/togeojson shpjs jszip
npm install -D @types/geojson
```

- `@tmcw/togeojson` — KML/KMZ → GeoJSON conversion (~15KB)
- `shpjs` — Shapefile → GeoJSON (~30KB)
- `jszip` — unzip KMZ files (~40KB)
- `@types/geojson` — TypeScript types for GeoJSON

### Step 3: GIS File Parser Utility (`lib/parsers/gis.ts`)

A client-side utility that accepts a `File` (or `File[]` for shapefiles) and returns a GeoJSON FeatureCollection:

```typescript
import type { FeatureCollection } from 'geojson'

export type GISFileType = 'geojson' | 'kml' | 'kmz' | 'shapefile'

export function detectGISFileType(filename: string): GISFileType | null {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.geojson') || lower.endsWith('.json')) return 'geojson'
  if (lower.endsWith('.kml')) return 'kml'
  if (lower.endsWith('.kmz')) return 'kmz'
  if (lower.endsWith('.shp') || lower.endsWith('.dbf') || lower.endsWith('.shx') || lower.endsWith('.prj')) return 'shapefile'
  return null
}

export async function parseGISFile(files: File[]): Promise<{ geojson: FeatureCollection; fileType: GISFileType }> {
  // Determine type from the primary file
  // For shapefiles: expect .shp + sidecar files
  // For single files: parse directly
  // Returns a GeoJSON FeatureCollection
}
```

Key behaviors:
- **GeoJSON**: `JSON.parse()` the file text, validate it has `type: "FeatureCollection"`
- **KML**: Parse as XML via `DOMParser`, pass to `@tmcw/togeojson`'s `kml()` function
- **KMZ**: Use `JSZip` to extract, find the `.kml` inside, then parse as KML
- **Shapefile**: Combine `.shp` + sidecar files into an ArrayBuffer and pass to `shpjs`

### Step 4: API Route for GIS Upload (`app/api/upload/gis/route.ts`)

Follows the same pattern as `app/api/upload/photos/route.ts`:

```
POST /api/upload/gis
Content-Type: multipart/form-data

Fields:
  - trial_id: string
  - name: string (layer name)
  - file_type: 'shapefile' | 'kml' | 'kmz' | 'geojson'
  - geojson: string (JSON-stringified FeatureCollection, parsed client-side)
  - files: File[] (raw file(s) for storage)
```

The route:
1. Validates `trial_id` exists
2. Stores raw file(s) in Supabase Storage at `trial-gis/{trial_id}/{uuid}/{filename}`
3. Inserts a row into `trial_gis_layers` with the parsed GeoJSON
4. Updates `trial_data_files` with `file_type: 'gis'`
5. Returns the created layer record

### Step 5: API Route for GIS Delete (`app/api/upload/gis/[layerId]/route.ts`)

```
DELETE /api/upload/gis/{layerId}
```

Deletes the storage file(s) and the database row.

### Step 6: Map Component (`components/trials/TrialMap.tsx`)

A dynamically-imported Leaflet map component. Must use `next/dynamic` with `ssr: false` because Leaflet accesses `window`.

**Features:**
- **Base layer**: OpenStreetMap tiles (free, no API key needed), with satellite tile option toggle
- **Trial marker**: If `trial.gps` exists, parse the text coordinate and place a marker with popup
- **Sample points**: Plot `soil_health_samples` that have lat/lon as circle markers, colored by property/block
- **GIS layers**: Render each `trial_gis_layers` entry as a GeoJSON layer with the stored style
- **Layer control**: Toggle visibility of each GIS layer, sample points, and trial marker
- **Auto-bounds**: Fit the map to show all visible features
- **Upload button**: Opens a file picker for GIS files, triggers the parsing + upload flow

**Component props:**
```typescript
interface TrialMapProps {
  trial: { id: string; gps: string | null; name: string }
  samples: { latitude: number | null; longitude: number | null; sample_no: string; property: string }[]
  gisLayers: GISLayer[]
  supabaseUrl: string
}
```

**Dynamic import wrapper:**
```typescript
// components/trials/TrialMapWrapper.tsx
import dynamic from 'next/dynamic'
const TrialMap = dynamic(() => import('./TrialMap'), { ssr: false, loading: () => <MapSkeleton /> })
```

### Step 7: Add "Map" Tab to `TrialDetailTabs.tsx`

- Add `'Map'` to the tabs array
- Import the dynamic map wrapper
- Pass `trial`, `samples`, `gisLayers`, and `supabaseUrl` as props

### Step 8: Fetch GIS Layers in Trial Detail Page (`app/(dashboard)/trials/[id]/page.tsx`)

Add to the `Promise.all` in `getTrialData()`:
```typescript
supabase.from('trial_gis_layers').select('*').eq('trial_id', id).order('created_at')
```

Pass `gisLayers` to `TrialDetailTabs`.

### Step 9: Update Data Coverage Badge

Add a "GIS" badge to the trial detail header alongside the existing badges:
```typescript
<DataBadge label="GIS" hasData={dataCoverage.gis || gisLayers.length > 0} />
```

### Step 10: Update File Classifier (`lib/parsers/classify.ts`)

Add GIS file detection so the folder upload pipeline can recognize GIS files:
```typescript
if (/\.(shp|dbf|shx|prj|kml|kmz|geojson)$/i.test(lower)) {
  return 'gis'
}
```

---

## File Changes Summary

| File | Action | Description |
|---|---|---|
| `supabase/migrations/004_trial_gis_layers.sql` | **New** | Migration for `trial_gis_layers` table + storage bucket |
| `package.json` | **Edit** | Add `@tmcw/togeojson`, `shpjs`, `jszip`, `@types/geojson` |
| `lib/parsers/gis.ts` | **New** | Client-side GIS file → GeoJSON parser |
| `lib/parsers/classify.ts` | **Edit** | Add GIS file type detection |
| `app/api/upload/gis/route.ts` | **New** | POST endpoint for GIS upload |
| `app/api/upload/gis/[layerId]/route.ts` | **New** | DELETE endpoint for GIS layer removal |
| `components/trials/TrialMap.tsx` | **New** | Leaflet map component with layers |
| `components/trials/TrialMapWrapper.tsx` | **New** | Dynamic import wrapper (ssr: false) |
| `app/(dashboard)/trials/[id]/page.tsx` | **Edit** | Fetch `trial_gis_layers`, pass to tabs |
| `app/(dashboard)/trials/[id]/TrialDetailTabs.tsx` | **Edit** | Add Map tab, import map wrapper, pass props |

---

## Key Considerations

1. **Shapefile multi-file handling**: Shapefiles consist of 3-4 files (.shp, .dbf, .shx, .prj). The upload UI needs to accept multiple files and group them together. The simplest approach is to accept a `.zip` of the shapefile bundle, which `shpjs` can handle directly.

2. **GeoJSON size limits**: GeoJSON stored in JSONB could get large for complex shapefiles. For the agricultural use case (field boundaries, plot layouts), this is unlikely to exceed a few hundred KB. If needed, simplification could be added later using `@turf/simplify`.

3. **Coordinate systems**: Shapefiles may use different coordinate reference systems (CRS). `shpjs` handles reprojection from common Australian CRS (GDA94/GDA2020) to WGS84 (lat/lng) when a `.prj` file is included. KML and GeoJSON are natively WGS84.

4. **Leaflet CSS**: Leaflet requires its CSS to be loaded. Import `leaflet/dist/leaflet.css` in the map component.

5. **No PostGIS needed**: All spatial operations (rendering, bounds calculation) happen client-side in Leaflet. The database just stores GeoJSON as JSONB. This keeps the Supabase setup simple.
