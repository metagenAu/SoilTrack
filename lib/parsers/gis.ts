import type { FeatureCollection, Feature } from 'geojson'

export type GISFileType = 'geojson' | 'kml' | 'kmz' | 'shapefile'

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
 * Sanitise a FeatureCollection by removing features with null or
 * unsupported geometries that would cause Leaflet to throw.
 */
function sanitizeFeatures(fc: FeatureCollection): FeatureCollection {
  const clean = fc.features.filter((f): f is Feature => {
    if (!f || f.type !== 'Feature') return false
    if (!f.geometry) return false
    if (!VALID_GEOMETRY_TYPES.has(f.geometry.type)) return false
    return true
  })
  return { ...fc, features: clean }
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
export const GIS_ACCEPT = '.geojson,.kml,.kmz,.shp,.zip'

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

async function parseShapefile(file: File): Promise<FeatureCollection> {
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
  const result = await shp(buffer)

  // shpjs can return a single FeatureCollection or an array of them (for .zip with multiple layers)
  if (Array.isArray(result)) {
    // Merge all features into a single FeatureCollection
    return sanitizeFeatures({
      type: 'FeatureCollection',
      features: result.flatMap((fc) => fc.features),
    })
  }
  return sanitizeFeatures(result as FeatureCollection)
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
