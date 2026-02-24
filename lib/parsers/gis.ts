import type { FeatureCollection, Feature, Geometry } from 'geojson'

export type GISFileType = 'geojson' | 'kml' | 'kmz' | 'shapefile'

/** A single named layer parsed from a GIS file (e.g. one shapefile in a multi-layer ZIP). */
export interface ParsedGISLayer {
  name: string
  geojson: FeatureCollection
}

/** Geometry types that Leaflet can render */
const VALID_GEOMETRY_TYPES = new Set([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
  'GeometryCollection',
])

/**
 * Recursively validate that a geometry object has the structure Leaflet
 * expects.  Returns false for null geometries, missing coordinates, or
 * GeometryCollections whose `geometries` array is null / empty / contains
 * invalid children.
 */
function isValidGeometry(geom: Geometry | null | undefined): boolean {
  if (!geom || typeof geom !== 'object') return false
  if (!VALID_GEOMETRY_TYPES.has(geom.type)) return false

  if (geom.type === 'GeometryCollection') {
    if (!Array.isArray(geom.geometries) || geom.geometries.length === 0) return false
    return geom.geometries.every(isValidGeometry)
  }

  // All other geometry types require a coordinates array
  if (!Array.isArray((geom as any).coordinates)) return false
  return true
}

/**
 * Sanitise a FeatureCollection by removing features with null or
 * unsupported geometries that would cause Leaflet to throw.
 */
export function sanitizeFeatures(fc: FeatureCollection): FeatureCollection {
  if (!fc || typeof fc !== 'object') {
    return { type: 'FeatureCollection', features: [] }
  }
  const features = Array.isArray(fc.features) ? fc.features : []
  const clean = features.filter((f): f is Feature => {
    if (!f || f.type !== 'Feature') return false
    return isValidGeometry(f.geometry)
  })
  return { ...fc, features: clean }
}

/**
 * Truncate coordinate precision to reduce GeoJSON payload size.
 * 6 decimal places ≈ 10 cm accuracy — more than enough for application zones.
 * Shapefiles often carry 15+ decimal places, inflating the JSON payload.
 */
const COORD_PRECISION = 1_000_000 // 10^6

function truncateCoords(coords: unknown): unknown {
  if (typeof coords === 'number') {
    return Math.round(coords * COORD_PRECISION) / COORD_PRECISION
  }
  if (Array.isArray(coords)) return coords.map(truncateCoords)
  return coords
}

function compactGeometry(geom: Geometry | null | undefined): Geometry | null {
  if (!geom || typeof geom !== 'object') return null
  if (geom.type === 'GeometryCollection') {
    return {
      ...geom,
      geometries: (geom.geometries || []).map(
        (g) => compactGeometry(g) as Geometry
      ),
    }
  }
  return { ...geom, coordinates: truncateCoords((geom as any).coordinates) } as Geometry
}

/**
 * Create a compact copy of a FeatureCollection by truncating coordinate
 * precision and stripping null bytes from string property values.
 *
 * Use this before sending GeoJSON to the server to keep the request body
 * under platform size limits (Vercel 4.5 MB, nginx default 1 MB, etc.).
 */
export function compactGeoJSON(fc: FeatureCollection): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => ({
      type: 'Feature' as const,
      geometry: compactGeometry(f.geometry)!,
      properties: sanitizeProps(f.properties || {}),
    })),
  }
}

/** Remove null bytes (\u0000) from string values — PostgreSQL JSONB rejects them. */
function sanitizeProps(
  props: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(props)) {
    out[key] = typeof val === 'string' ? val.replace(/\0/g, '') : val
  }
  return out
}

const GIS_EXTENSIONS: Record<string, GISFileType> = {
  '.geojson': 'geojson',
  '.kml': 'kml',
  '.kmz': 'kmz',
  '.shp': 'shapefile',
  '.zip': 'shapefile', // zipped shapefile bundle
}

/** Detect GIS file type from filename, or null if not a GIS file */
export function detectGISFileType(filename: string): GISFileType | null {
  const lower = filename.toLowerCase()
  for (const [ext, type] of Object.entries(GIS_EXTENSIONS)) {
    if (lower.endsWith(ext)) return type
  }
  return null
}

/** Returns a list of accepted file extensions for the upload input */
export const GIS_ACCEPT = '.geojson,.kml,.kmz,.zip'

async function parseGeoJSON(file: File): Promise<FeatureCollection> {
  const text = await file.text()
  const parsed = JSON.parse(text)

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('File does not contain a valid GeoJSON object.')
  }

  // Normalise: wrap bare Feature or Geometry in a FeatureCollection
  if (parsed.type === 'FeatureCollection') {
    return sanitizeFeatures(parsed)
  }
  if (parsed.type === 'Feature') {
    return sanitizeFeatures({ type: 'FeatureCollection', features: [parsed] })
  }
  // Bare geometry — validate before wrapping
  if (!VALID_GEOMETRY_TYPES.has(parsed.type)) {
    throw new Error(
      `Unsupported or invalid GeoJSON geometry type "${parsed.type || 'unknown'}". ` +
      'Please ensure the file is valid GeoJSON.'
    )
  }
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: parsed, properties: {} }],
  }
}

async function parseKML(file: File): Promise<FeatureCollection> {
  const { kml } = await import('@tmcw/togeojson')
  const text = await file.text()
  const dom = new DOMParser().parseFromString(text, 'application/xml')

  // DOMParser never throws — check for XML parse errors
  const parseError = dom.querySelector('parsererror')
  if (parseError) {
    throw new Error('The KML file contains invalid XML and could not be parsed.')
  }

  return sanitizeFeatures(kml(dom) as FeatureCollection)
}

async function parseKMZ(file: File): Promise<FeatureCollection> {
  const JSZip = (await import('jszip')).default
  const { kml } = await import('@tmcw/togeojson')

  const zip = await JSZip.loadAsync(await file.arrayBuffer())

  // Find the first .kml file inside the archive
  const kmlEntry = Object.keys(zip.files).find((name) =>
    name.toLowerCase().endsWith('.kml')
  )
  if (!kmlEntry) throw new Error('No .kml file found inside KMZ archive')

  const text = await zip.files[kmlEntry].async('text')
  const dom = new DOMParser().parseFromString(text, 'application/xml')

  const parseError = dom.querySelector('parsererror')
  if (parseError) {
    throw new Error('The KML inside the KMZ archive contains invalid XML and could not be parsed.')
  }

  return sanitizeFeatures(kml(dom) as FeatureCollection)
}

/**
 * Extract a user-friendly layer name from the path shpjs attaches to each
 * parsed FeatureCollection.  The value is the full path within the ZIP
 * (e.g. "subfolder/boundary") so we strip directory components.
 */
function shpjsLayerName(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback
  return raw.split('/').pop() || fallback
}

/** Companion extensions that make up a complete shapefile. */
const SHP_COMPANIONS = ['.shp', '.dbf', '.shx', '.prj', '.cpg']

/**
 * Parse each shapefile in a ZIP individually using JSZip for extraction
 * (more reliable across compression methods) and shpjs for geometry parsing.
 * Each .shp file becomes its own mini-ZIP so shpjs can handle it independently.
 */
async function parseShapefileGroupsViaJSZip(
  shp: typeof import('shpjs').default,
  zip: InstanceType<typeof import('jszip')>,
  shpBases: string[],
  fallbackName: string
): Promise<ParsedGISLayer[]> {
  const JSZip = (await import('jszip')).default

  // Case-insensitive lookup for companion files
  const fileLookup = new Map<string, string>()
  for (const name of Object.keys(zip.files)) {
    fileLookup.set(name.toLowerCase(), name)
  }

  const layers: ParsedGISLayer[] = []

  for (const base of shpBases) {
    const displayName = base.split('/').pop() || fallbackName

    // Build a mini-ZIP with just this shapefile + its companion files
    const mini = new JSZip()
    for (const ext of SHP_COMPANIONS) {
      const key = fileLookup.get((base + ext).toLowerCase())
      if (key && !zip.files[key].dir) {
        mini.file(displayName + ext, await zip.files[key].async('arraybuffer'))
      }
    }

    try {
      const miniBuffer = await mini.generateAsync({ type: 'arraybuffer' })
      const result = await shp(miniBuffer)
      const raw = Array.isArray(result) ? result[0] : result
      if (!raw) continue
      const fc = raw as FeatureCollection
      const sanitized = sanitizeFeatures(fc)
      if (sanitized.features.length > 0) {
        layers.push({ name: displayName, geojson: sanitized })
      }
    } catch (e) {
      console.warn(`Failed to parse shapefile layer "${displayName}":`, e)
    }
  }

  return layers
}

async function parseShapefileLayers(file: File): Promise<ParsedGISLayer[]> {
  let shp: typeof import('shpjs').default
  try {
    shp = (await import('shpjs')).default
  } catch {
    throw new Error(
      'Failed to load the shapefile parser. Please try refreshing the page. ' +
      'If the problem persists, upload a .geojson file instead.'
    )
  }
  const buffer = await file.arrayBuffer()
  const baseName = file.name.replace(/\.[^.]+$/, '')

  // Use JSZip to discover .shp files inside the ZIP.  JSZip handles more
  // compression methods than shpjs's built-in extractor (but-unzip), so it
  // gives us a reliable layer count and proper shapefile names for display.
  let shpBases: string[] = []
  let zip: InstanceType<typeof import('jszip')> | null = null
  try {
    const JSZip = (await import('jszip')).default
    zip = await JSZip.loadAsync(buffer)
    shpBases = Object.keys(zip.files)
      .filter((n) => !n.startsWith('__MACOSX') && n.toLowerCase().endsWith('.shp'))
      .map((n) => n.slice(0, -4)) // strip .shp extension
  } catch {
    // JSZip scan failed — fall through to shpjs-only path below
  }

  // When multiple .shp files exist, parse each individually via mini-ZIPs
  // to guarantee every layer is discovered and properly named.
  if (zip && shpBases.length > 1) {
    const layers = await parseShapefileGroupsViaJSZip(shp, zip, shpBases, baseName)
    if (layers.length > 0) return layers
    // All layers empty or failed — fall through to shpjs as a last resort
  }

  // Parse with shpjs (works well for single-layer and as a fallback)
  let result: Awaited<ReturnType<typeof shp>>
  try {
    result = await shp(buffer)
  } catch {
    // shpjs's but-unzip may fail on certain ZIP formats — try JSZip extraction
    if (zip && shpBases.length > 0) {
      const layers = await parseShapefileGroupsViaJSZip(shp, zip, shpBases, baseName)
      if (layers.length > 0) return layers
    }
    throw new Error(
      'Failed to parse the shapefile ZIP. The file may be corrupted or use an unsupported compression method. ' +
      'Try re-exporting from your GIS software or converting to .geojson.'
    )
  }

  if (Array.isArray(result)) {
    return result
      .map((fc, idx) => {
        const sanitized = sanitizeFeatures(fc)
        // Strip directory paths from shpjs fileName for cleaner display
        const layerName = shpjsLayerName(fc.fileName, `${baseName} - Layer ${idx + 1}`)
        return { name: layerName, geojson: sanitized }
      })
      .filter((layer) => layer.geojson.features.length > 0)
  }

  // Single shapefile — name after the .shp file inside the ZIP, not the ZIP itself
  const layerName = shpBases.length === 1
    ? (shpBases[0].split('/').pop() || baseName)
    : shpjsLayerName((result as any).fileName, baseName)
  return [{ name: layerName, geojson: sanitizeFeatures(result as FeatureCollection) }]
}

async function parseShapefile(file: File): Promise<FeatureCollection> {
  const layers = await parseShapefileLayers(file)
  if (layers.length === 0) {
    return { type: 'FeatureCollection', features: [] }
  }
  // Merge all layers for single-layer compat
  return {
    type: 'FeatureCollection',
    features: layers.flatMap((l) => l.geojson.features),
  }
}

/**
 * Parse a GIS file into a GeoJSON FeatureCollection.
 * For shapefiles, pass a .zip archive containing .shp + sidecar files.
 */
export async function parseGISFile(
  file: File,
  fileType: GISFileType
): Promise<FeatureCollection> {
  switch (fileType) {
    case 'geojson':
      return parseGeoJSON(file)
    case 'kml':
      return parseKML(file)
    case 'kmz':
      return parseKMZ(file)
    case 'shapefile':
      return parseShapefile(file)
    default:
      throw new Error(`Unsupported GIS file type: ${fileType}`)
  }
}

/**
 * Parse a GIS file into one or more named layers.
 *
 * For zipped shapefiles (e.g. John Deere Ops exports) a single ZIP often
 * contains multiple separate .shp files — one per operation type (seeding,
 * harvest, spraying, etc.).  This function returns each as a separate layer
 * so they can be uploaded and toggled independently on the map.
 *
 * For other formats the result is always a single-element array.
 */
export async function parseGISFileMultiLayer(
  file: File,
  fileType: GISFileType
): Promise<ParsedGISLayer[]> {
  const baseName = file.name.replace(/\.[^.]+$/, '')

  switch (fileType) {
    case 'shapefile':
      return parseShapefileLayers(file)
    case 'geojson':
      return [{ name: baseName, geojson: await parseGeoJSON(file) }]
    case 'kml':
      return [{ name: baseName, geojson: await parseKML(file) }]
    case 'kmz':
      return [{ name: baseName, geojson: await parseKMZ(file) }]
    default:
      throw new Error(`Unsupported GIS file type: ${fileType}`)
  }
}
