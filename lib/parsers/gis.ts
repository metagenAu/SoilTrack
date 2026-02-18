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
  const clean = fc.features.filter((f): f is Feature => {
    if (!f || f.type !== 'Feature') return false
    return isValidGeometry(f.geometry)
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
  const result = await shp(buffer)

  const baseName = file.name.replace(/\.[^.]+$/, '')

  // shpjs can return a single FeatureCollection or an array of them (for .zip with multiple layers)
  if (Array.isArray(result)) {
    return result
      .map((fc, idx) => {
        const sanitized = sanitizeFeatures(fc)
        // shpjs attaches fileName to each FeatureCollection in a multi-layer ZIP
        const layerName = fc.fileName || `${baseName} - Layer ${idx + 1}`
        return { name: layerName, geojson: sanitized }
      })
      .filter((layer) => layer.geojson.features.length > 0)
  }

  return [{ name: baseName, geojson: sanitizeFeatures(result as FeatureCollection) }]
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
