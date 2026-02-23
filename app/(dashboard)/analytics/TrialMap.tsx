'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

interface MapTrial {
  id: string
  name: string
  crop: string | null
  location: string | null
  status: string
  lat: number
  lng: number
  sample_count: number
}

interface TrialMapProps {
  trials: MapTrial[]
  getCropColor: (crop: string | null) => string
  visible?: boolean
}

/** Call map.invalidateSize() when the container becomes visible after being hidden */
function InvalidateSize({ visible }: { visible: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => map.invalidateSize(), 50)
      return () => clearTimeout(timer)
    }
  }, [visible, map])
  return null
}

// Fit bounds whenever trials change
function FitBounds({ trials }: { trials: MapTrial[] }) {
  const map = useMap()

  useEffect(() => {
    if (trials.length === 0) return
    if (trials.length === 1) {
      map.setView([trials[0].lat, trials[0].lng], 8)
      return
    }
    const lats = trials.map((t) => t.lat)
    const lngs = trials.map((t) => t.lng)
    map.fitBounds(
      [
        [Math.min(...lats) - 0.5, Math.min(...lngs) - 0.5],
        [Math.max(...lats) + 0.5, Math.max(...lngs) + 0.5],
      ],
      { padding: [30, 30] }
    )
  }, [trials, map])

  return null
}

export default function TrialMap({ trials, getCropColor, visible = true }: TrialMapProps) {
  // Center on Australia
  const center: [number, number] = [-28.0, 134.0]

  return (
    <MapContainer
      center={center}
      zoom={4}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={true}
      preferCanvas={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <InvalidateSize visible={visible} />
      <FitBounds trials={trials} />
      {trials.map((trial) => (
        <CircleMarker
          key={trial.id}
          center={[trial.lat, trial.lng]}
          radius={5}
          pathOptions={{
            color: '#FFFFFF',
            weight: 1.5,
            fillColor: getCropColor(trial.crop),
            fillOpacity: 0.9,
          }}
        >
          <Popup>
            <div className="text-xs space-y-1 min-w-[160px]">
              <p className="font-bold text-sm">{trial.id}</p>
              <p className="text-brand-grey-1">{trial.name}</p>
              {trial.crop && (
                <p>
                  <span className="text-brand-grey-1">Crop:</span>{' '}
                  <span className="font-medium">{trial.crop}</span>
                </p>
              )}
              {trial.location && (
                <p>
                  <span className="text-brand-grey-1">Location:</span>{' '}
                  {trial.location}
                </p>
              )}
              <p>
                <span className="text-brand-grey-1">Status:</span>{' '}
                <span className="capitalize font-medium">{trial.status}</span>
              </p>
              <p>
                <span className="text-brand-grey-1">Samples:</span>{' '}
                {trial.sample_count}
              </p>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
