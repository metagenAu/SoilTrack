'use client'

import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { FeatureCollection } from 'geojson'

// Fix default marker icon URLs (Webpack bundler issue)
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

interface SamplingPoint {
  lat: number
  lng: number
  label: string
}

interface SamplingPlanMapProps {
  boundary: FeatureCollection | null
  points: SamplingPoint[]
  onPointsChange: (points: SamplingPoint[]) => void
}

// Custom icon for draggable sampling point markers
const samplingPointIcon = L.divIcon({
  className: 'sampling-point-marker',
  html: '<div style="width:14px;height:14px;background:#8b5cf6;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);cursor:grab;"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

export default function SamplingPlanMap({
  boundary,
  points,
  onPointsChange,
}: SamplingPlanMapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<L.FeatureGroup>(new L.FeatureGroup())
  // Keep a mutable ref to the latest points so drag handlers always see current state
  const pointsRef = useRef<SamplingPoint[]>(points)
  pointsRef.current = points

  const addPointMarkers = useCallback((pts: SamplingPoint[]) => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.clearLayers()

    pts.forEach((pt, idx) => {
      const marker = L.marker([pt.lat, pt.lng], {
        icon: samplingPointIcon,
        draggable: true,
        title: pt.label,
      })

      marker.bindTooltip(pt.label, {
        permanent: false,
        direction: 'top',
        offset: [0, -8],
      })

      marker.on('dragend', (e: L.LeafletEvent) => {
        const m = e.target as L.Marker
        const newLatLng = m.getLatLng()
        const updated = [...pointsRef.current]
        updated[idx] = {
          ...updated[idx],
          lat: Math.round(newLatLng.lat * 1e6) / 1e6,
          lng: Math.round(newLatLng.lng * 1e6) / 1e6,
        }
        onPointsChange(updated)
      })

      markersRef.current.addLayer(marker)
    })

    markersRef.current.addTo(map)
  }, [onPointsChange])

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = L.map(mapContainerRef.current, {
      preferCanvas: true,
      center: [-33.86, 151.21],
      zoom: 5,
    })

    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    })
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri' }
    )
    satellite.addTo(map)

    L.control.layers(
      { 'Street Map': osm, 'Satellite': satellite },
      {},
      { position: 'topright' }
    ).addTo(map)

    // Render boundary (read-only)
    const boundsGroup = new L.FeatureGroup()
    if (boundary?.features?.length) {
      const geoLayer = L.geoJSON(boundary, {
        style: { color: '#22c55e', weight: 3, fillOpacity: 0.1, fillColor: '#22c55e' },
      })
      geoLayer.eachLayer((l) => boundsGroup.addLayer(l))
      boundsGroup.addTo(map)
    }

    mapRef.current = map

    // Add sampling point markers
    addPointMarkers(points)

    // Fit bounds to show everything
    const allLayers = new L.FeatureGroup()
    boundsGroup.eachLayer((l) => allLayers.addLayer(l))
    for (const pt of points) {
      L.marker([pt.lat, pt.lng]).addTo(allLayers)
    }
    if (allLayers.getLayers().length > 0) {
      map.fitBounds(allLayers.getBounds().pad(0.1))
    }

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update markers when points change (e.g. after drag or regenerate)
  useEffect(() => {
    if (!mapRef.current) return
    addPointMarkers(points)
  }, [points, addPointMarkers])

  return (
    <div
      ref={mapContainerRef}
      className="h-[400px] rounded-lg border border-brand-grey-2 z-0"
    />
  )
}
