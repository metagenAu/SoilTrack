import type { FeatureCollection } from 'geojson'

export type GISFileType = 'geojson' | 'kml' | 'kmz' | 'shapefile'

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

  // Normalise: wrap bare Feature or Geometry in a FeatureCollection
  if (parsed.type === 'FeatureCollection') return parsed
  if (parsed.type === 'Feature') {
    return { type: 'FeatureCollection', features: [parsed] }
  }
  // Bare geometry
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: parsed, properties: {} }],
  }
}

async function parseKML(file: File): Promise<FeatureCollection> {
  const { kml } = await import('@tmcw/togeojson')
  const text = await file.text()
  const dom = new DOMParser().parseFromString(text, 'application/xml')
  return kml(dom) as FeatureCollection
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
  return kml(dom) as FeatureCollection
}

async function parseShapefile(file: File): Promise<FeatureCollection> {
  const shp = (await import('shpjs')).default
  const buffer = await file.arrayBuffer()
  const result = await shp(buffer)

  // shpjs can return a single FeatureCollection or an array of them (for .zip with multiple layers)
  if (Array.isArray(result)) {
    // Merge all features into a single FeatureCollection
    return {
      type: 'FeatureCollection',
      features: result.flatMap((fc) => fc.features),
    }
  }
  return result as FeatureCollection
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
