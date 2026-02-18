import 'leaflet'

declare module 'leaflet' {
  namespace Control {
    class Draw extends Control {
      constructor(options?: DrawConstructorOptions)
    }

    interface DrawConstructorOptions {
      position?: string
      draw?: DrawOptions
      edit?: EditOptions
    }

    interface DrawOptions {
      polyline?: DrawOptions.PolylineOptions | false
      polygon?: DrawOptions.PolygonOptions | false
      rectangle?: DrawOptions.RectangleOptions | false
      circle?: DrawOptions.CircleOptions | false
      marker?: DrawOptions.MarkerOptions | false
      circlemarker?: DrawOptions.CircleMarkerOptions | false
    }

    namespace DrawOptions {
      interface PolylineOptions {
        shapeOptions?: L.PolylineOptions
        allowIntersection?: boolean
      }
      interface PolygonOptions {
        shapeOptions?: L.PolylineOptions
        allowIntersection?: boolean
        showArea?: boolean
      }
      interface RectangleOptions {
        shapeOptions?: L.PolylineOptions
      }
      interface CircleOptions {
        shapeOptions?: L.PathOptions
      }
      interface MarkerOptions {
        icon?: L.Icon
      }
      interface CircleMarkerOptions {
        shapeOptions?: L.PathOptions
      }
    }

    interface EditOptions {
      featureGroup: L.FeatureGroup
      remove?: boolean
      edit?: boolean | { selectedPathOptions?: L.PathOptions }
    }
  }

  namespace Draw {
    namespace Event {
      const CREATED: string
      const EDITED: string
      const DELETED: string
    }
  }
}

declare module 'leaflet-draw' {
  // Side-effect import that adds drawing functionality to Leaflet
}
