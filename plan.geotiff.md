# Plan: GeoTIFF Raster Support for DroneDeploy Exports

## Overview

Add the ability to upload GeoTIFF files (orthomosaics, NDVI, elevation maps) from DroneDeploy and display them as raster overlays on the trial map.

## Conversion Strategy

**Client-side conversion on upload.** The browser parses the GeoTIFF using `geotiff.js`, extracts georeferencing bounds, renders the raster data to a PNG via canvas, and uploads the PNG to Supabase Storage. The database stores the PNG path + bounds — the map renders it with a simple `L.imageOverlay()`.

### Why client-side?

- No server-side GDAL or native GIS dependencies needed
- `geotiff.js` works natively in the browser and can parse multi-band rasters
- Avoids the 60s API route timeout and 50MB body size limit — the raw TIF goes straight to Storage, and only the lighter PNG + metadata hit the API
- Consistent with the existing pattern (GIS files are already parsed client-side)

### What gets stored in Supabase?

| Artifact | Location | Purpose |
|---|---|---|
| Raw `.tif` file | `trial-gis` Storage bucket | Archive / re-processing later |
| Rendered `.png` file | `trial-gis` Storage bucket | Leaflet overlay image |
| Bounds + metadata | `trial_gis_layers` table (new columns) | Positioning the overlay on the map |

---

## Implementation Steps

### Step 1: New dependencies

Install in `package.json`:

```
geotiff       — parse GeoTIFF files (browser-compatible)
proj4         — reproject CRS bounds to WGS84 (EPSG:4326) for Leaflet
```

`geotiff` may need to be added to `transpilePackages` in `next.config.js` if it causes webpack issues. Also add `proj4` type stubs or `@types/proj4`.

### Step 2: Database migration — `017_raster_support.sql`

Extend `trial_gis_layers` to accommodate raster data:

```sql
-- Allow 'geotiff' as a file_type
ALTER TABLE trial_gis_layers
  DROP CONSTRAINT trial_gis_layers_file_type_check;
ALTER TABLE trial_gis_layers
  ADD CONSTRAINT trial_gis_layers_file_type_check
  CHECK (file_type IN ('shapefile', 'kml', 'kmz', 'geojson', 'geotiff'));

-- Make geojson nullable (rasters don't have vector features)
ALTER TABLE trial_gis_layers
  ALTER COLUMN geojson DROP NOT NULL;

-- Add raster-specific columns
ALTER TABLE trial_gis_layers
  ADD COLUMN raster_png_path TEXT,           -- Storage path to the rendered PNG
  ADD COLUMN raster_bounds   JSONB,          -- [[south, west], [north, east]] for L.imageOverlay
  ADD COLUMN band_count      INT,            -- Number of bands (3=RGB, 1=NDVI/elevation)
  ADD COLUMN raster_type     TEXT;           -- 'orthomosaic' | 'ndvi' | 'elevation' | 'other'
```

Also extend `field_gis_layers` with the same columns if field-level rasters are desired (can defer).

### Step 3: File classification — `lib/parsers/classify.ts`

Add `.tif` and `.tiff` to the GIS regex:

```typescript
// Before:
if (/\.(shp|dbf|shx|prj|kml|kmz|geojson)$/i.test(lower)) return 'gis'
// After:
if (/\.(shp|dbf|shx|prj|kml|kmz|geojson|tif|tiff)$/i.test(lower)) return 'gis'
```

### Step 4: GIS parser updates — `lib/parsers/gis.ts`

Add GeoTIFF detection and parsing:

```typescript
// 1. Add to GISFileType union:
export type GISFileType = 'geojson' | 'kml' | 'kmz' | 'shapefile' | 'geotiff'

// 2. Add to extension map:
'.tif': 'geotiff', '.tiff': 'geotiff'

// 3. Update GIS_ACCEPT:
export const GIS_ACCEPT = '.geojson,.kml,.kmz,.zip,.tif,.tiff'

// 4. New types for raster results:
export interface ParsedRasterLayer {
  name: string
  pngBlob: Blob              // Rendered PNG image
  bounds: [[number, number], [number, number]]  // [[south, west], [north, east]]
  bandCount: number
  width: number
  height: number
  rasterType: 'orthomosaic' | 'ndvi' | 'elevation' | 'other'
}

// 5. New function: parseGeoTIFF(file: File): Promise<ParsedRasterLayer>
```

**`parseGeoTIFF()` implementation outline:**

```typescript
async function parseGeoTIFF(file: File): Promise<ParsedRasterLayer> {
  const { fromArrayBuffer } = await import('geotiff')
  const proj4 = (await import('proj4')).default

  const arrayBuffer = await file.arrayBuffer()
  const tiff = await fromArrayBuffer(arrayBuffer)
  const image = await tiff.getImage()

  // 1. Extract CRS and bounds
  const bbox = image.getBoundingBox()           // [minX, minY, maxX, maxY] in native CRS
  const geoKeys = image.getGeoKeys()
  const epsgCode = geoKeys.ProjectedCSTypeGeoKey || geoKeys.GeographicTypeGeoKey || 4326

  // 2. Reproject bounds to WGS84 if needed
  let [west, south, east, north] = bbox
  if (epsgCode !== 4326) {
    const projString = `EPSG:${epsgCode}`
    ;[west, south] = proj4(projString, 'EPSG:4326', [bbox[0], bbox[1]])
    ;[east, north] = proj4(projString, 'EPSG:4326', [bbox[2], bbox[3]])
  }

  // 3. Read raster data
  const bands = await image.readRasters()
  const width = image.getWidth()
  const height = image.getHeight()
  const bandCount = bands.length

  // 4. Render to canvas → PNG
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(width, height)

  if (bandCount >= 3) {
    // RGB orthomosaic — map bands directly
    renderRGBToImageData(imageData, bands[0], bands[1], bands[2], bands[3])
  } else {
    // Single-band (NDVI/elevation) — apply color ramp
    renderSingleBandToImageData(imageData, bands[0], rasterType)
  }

  ctx.putImageData(imageData, 0, 0)

  // 5. Export canvas as PNG blob
  const pngBlob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/png')
  )

  return {
    name: file.name.replace(/\.(tif|tiff)$/i, ''),
    pngBlob,
    bounds: [[south, west], [north, east]],
    bandCount,
    width,
    height,
    rasterType: detectRasterType(bandCount, file.name),
  }
}
```

**Helper functions needed:**

- `renderRGBToImageData()` — maps 3 (or 4) bands into RGBA pixel data, handling uint8/uint16/float32 normalization
- `renderSingleBandToImageData()` — applies a color ramp (green→yellow→red for NDVI, terrain palette for elevation)
- `detectRasterType()` — heuristic based on band count and filename keywords ("ndvi", "dsm", "dtm", "elevation")

**Large file handling:**

For very large GeoTIFFs (>100MB), `readRasters()` could exhaust browser memory. Mitigations:
- Read a downsampled window: `image.readRasters({ width: maxWidth, height: maxHeight })` — `geotiff.js` supports this natively, returning a resampled subset
- Cap the rendered PNG at 4096x4096 pixels (16M pixels) — sufficient visual quality for a map overlay
- Show a progress indicator during parsing

### Step 5: Upload API — `app/api/upload/gis/route.ts`

Add `'geotiff'` to `validTypes` array. Add a raster branch:

```typescript
if (fileType === 'geotiff') {
  // Expect: raster_png_path, raster_bounds, band_count, raster_type (no geojson)
  const { error } = await supabase.from('trial_gis_layers').insert({
    trial_id: trialId,
    name,
    file_type: 'geotiff',
    storage_path: storagePath,       // raw .tif in trial-gis bucket
    geojson: null,                   // no vector data
    feature_count: 0,
    raster_png_path: rasterPngPath,  // rendered .png in trial-gis bucket
    raster_bounds: rasterBounds,     // [[south, west], [north, east]]
    band_count: bandCount,
    raster_type: rasterType,
  })
  // ... return response
}
```

### Step 6: Map rendering — `components/trials/TrialMap.tsx`

**Extend the GISLayer interface:**

```typescript
interface GISLayer {
  // ... existing fields ...
  raster_png_path?: string | null
  raster_bounds?: [[number, number], [number, number]] | null
  band_count?: number | null
  raster_type?: string | null
}
```

**Add raster overlay rendering:**

When iterating GIS layers, check if the layer is a raster:

```typescript
{gisLayers.map((layer) => {
  if (layer.file_type === 'geotiff' && layer.raster_png_path && layer.raster_bounds) {
    // Build the public URL for the PNG in Supabase Storage
    const pngUrl = supabase.storage.from('trial-gis').getPublicUrl(layer.raster_png_path).data.publicUrl
    return (
      <LayersControl.Overlay key={layer.id} name={layer.name} checked>
        <RasterOverlay url={pngUrl} bounds={layer.raster_bounds} opacity={0.7} />
      </LayersControl.Overlay>
    )
  }
  // ... existing vector layer rendering ...
})}
```

**`RasterOverlay` component** (thin wrapper around `L.imageOverlay`):

```typescript
function RasterOverlay({ url, bounds, opacity }: {
  url: string
  bounds: [[number, number], [number, number]]
  opacity: number
}) {
  const map = useMap()
  useEffect(() => {
    const overlay = L.imageOverlay(url, bounds, { opacity })
    overlay.addTo(map)
    return () => { overlay.remove() }
  }, [map, url, bounds, opacity])
  return null
}
```

Add opacity slider control per raster layer so users can blend with the base map / satellite imagery.

**Upload handler changes in TrialMap:**

The existing `handleGISUpload()` function branches on file type. Add a GeoTIFF branch:

```typescript
if (fileType === 'geotiff') {
  // 1. Parse GeoTIFF (client-side)
  const rasterLayer = await parseGeoTIFF(file)

  // 2. Upload raw .tif to Storage
  const rawPath = `${trialId}/${uuidv4()}.tif`
  await supabase.storage.from('trial-gis').upload(rawPath, file)

  // 3. Upload rendered .png to Storage
  const pngPath = `${trialId}/${uuidv4()}.png`
  await supabase.storage.from('trial-gis').upload(pngPath, rasterLayer.pngBlob)

  // 4. POST metadata to API
  const res = await fetch('/api/upload/gis', {
    method: 'POST',
    body: JSON.stringify({
      trial_id: trialId,
      name: rasterLayer.name,
      file_type: 'geotiff',
      storage_path: rawPath,
      raster_png_path: pngPath,
      raster_bounds: rasterLayer.bounds,
      band_count: rasterLayer.bandCount,
      raster_type: rasterLayer.rasterType,
    }),
  })
  // 5. Add to local state for immediate display
}
```

### Step 7: CSP and image source updates — `next.config.js`

The `img-src` directive in the Content-Security-Policy header already includes `https://*.supabase.co`, so Supabase Storage PNG URLs should load without CSP errors. Verify this works for `L.imageOverlay` (which uses an `<img>` element internally).

### Step 8: Update `claude.md`

Document the new GeoTIFF support under the GIS / Spatial Layers section.

---

## File Change Summary

| File | Change |
|---|---|
| `package.json` | Add `geotiff`, `proj4`, `@types/proj4` |
| `next.config.js` | Possibly add `geotiff` to `transpilePackages` |
| `supabase/migrations/017_raster_support.sql` | New migration — extend `trial_gis_layers` |
| `lib/parsers/classify.ts` | Add `.tif`, `.tiff` to GIS regex |
| `lib/parsers/gis.ts` | Add `'geotiff'` type, `parseGeoTIFF()`, render helpers |
| `app/api/upload/gis/route.ts` | Add `'geotiff'` to valid types, raster insert branch |
| `components/trials/TrialMap.tsx` | Raster overlay rendering, GeoTIFF upload handler, opacity control |
| `types/geotiff.d.ts` | Type stub if needed |
| `claude.md` | Document raster support |

---

## Considerations

### File size limits
- DroneDeploy orthomosaics can be 100MB–2GB+. The current 50MB upload limit won't cover large orthomosaics.
- **Mitigation**: The raw TIF upload goes directly to Supabase Storage (bypasses Next.js body limit). Only the rendered PNG (typically 1-10MB) and metadata hit the API route. We may need to raise the `MAX_FILE_SIZE` constant in TrialMap for GeoTIFF files specifically, and check Supabase Storage's per-file size limit (default 50MB on free tier, configurable on paid).

### Browser memory
- A 100MB GeoTIFF decompresses to ~400MB+ in memory for a full-resolution render.
- **Mitigation**: Downsample during `readRasters()` — cap at 4096x4096 output. `geotiff.js` handles resampling internally.

### CRS reprojection
- Most DroneDeploy exports use EPSG:4326 or EPSG:3857. `proj4` handles both.
- For unusual CRS codes, `proj4` needs the projection definition string. We can bundle the most common ones or fetch from `epsg.io` on-demand.

### Color ramps for single-band data
- NDVI: diverging green-yellow-red (standard)
- Elevation: terrain palette (blue→green→brown→white)
- Custom ramps could be a future enhancement

### What this does NOT cover (future work)
- Tiled rendering for very large rasters (would need server-side tile generation)
- Band selection/toggling for multi-band data
- Raster value inspection (click to see pixel value)
- Field-level raster layers (extend `field_gis_layers` similarly)
- DroneDeploy API integration (automated export pull)
