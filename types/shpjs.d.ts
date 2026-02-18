declare module 'shpjs' {
  import type { FeatureCollection } from 'geojson'

  /** When shpjs parses a multi-layer ZIP it attaches the shapefile name to each collection. */
  interface ShpFeatureCollection extends FeatureCollection {
    fileName?: string
  }

  function shp(input: ArrayBuffer | string): Promise<ShpFeatureCollection | ShpFeatureCollection[]>
  export default shp
}
