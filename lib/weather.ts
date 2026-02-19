export interface WeatherVariable {
  key: string
  label: string
  unit: string
  color: string
  chartType: 'line' | 'bar'
}

export const DAILY_VARIABLES: WeatherVariable[] = [
  { key: 'temperature_2m_max', label: 'Max Temperature', unit: '°C', color: '#e63946', chartType: 'line' },
  { key: 'temperature_2m_min', label: 'Min Temperature', unit: '°C', color: '#457b9d', chartType: 'line' },
  { key: 'temperature_2m_mean', label: 'Mean Temperature', unit: '°C', color: '#f4a261', chartType: 'line' },
  { key: 'precipitation_sum', label: 'Precipitation', unit: 'mm', color: '#2a9d8f', chartType: 'bar' },
  { key: 'rain_sum', label: 'Rain', unit: 'mm', color: '#264653', chartType: 'bar' },
  { key: 'et0_fao_evapotranspiration', label: 'ET₀', unit: 'mm', color: '#e9c46a', chartType: 'line' },
  { key: 'wind_speed_10m_max', label: 'Max Wind Speed', unit: 'km/h', color: '#6c757d', chartType: 'line' },
  { key: 'shortwave_radiation_sum', label: 'Solar Radiation', unit: 'MJ/m²', color: '#fca311', chartType: 'line' },
  { key: 'relative_humidity_2m_mean', label: 'Mean Relative Humidity', unit: '%', color: '#8ecae6', chartType: 'line' },
]

export const HOURLY_VARIABLES: WeatherVariable[] = [
  { key: 'temperature_2m', label: 'Temperature', unit: '°C', color: '#e63946', chartType: 'line' },
  { key: 'precipitation', label: 'Precipitation', unit: 'mm', color: '#2a9d8f', chartType: 'bar' },
  { key: 'relative_humidity_2m', label: 'Relative Humidity', unit: '%', color: '#8ecae6', chartType: 'line' },
  { key: 'wind_speed_10m', label: 'Wind Speed', unit: 'km/h', color: '#6c757d', chartType: 'line' },
  { key: 'soil_temperature_0cm', label: 'Soil Temperature (0 cm)', unit: '°C', color: '#bc6c25', chartType: 'line' },
  { key: 'soil_moisture_0_to_1cm', label: 'Soil Moisture (0\u20131 cm)', unit: 'm³/m³', color: '#606c38', chartType: 'line' },
  { key: 'et0_fao_evapotranspiration', label: 'ET₀', unit: 'mm', color: '#e9c46a', chartType: 'line' },
  { key: 'shortwave_radiation', label: 'Solar Radiation', unit: 'W/m²', color: '#fca311', chartType: 'line' },
]

/** Variable groupings for the UI checkboxes */
export const DAILY_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Temperature', keys: ['temperature_2m_max', 'temperature_2m_min', 'temperature_2m_mean'] },
  { label: 'Water', keys: ['precipitation_sum', 'rain_sum', 'et0_fao_evapotranspiration'] },
  { label: 'Atmosphere', keys: ['wind_speed_10m_max', 'shortwave_radiation_sum', 'relative_humidity_2m_mean'] },
]

export const HOURLY_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Temperature', keys: ['temperature_2m'] },
  { label: 'Water', keys: ['precipitation', 'et0_fao_evapotranspiration'] },
  { label: 'Atmosphere', keys: ['wind_speed_10m', 'shortwave_radiation', 'relative_humidity_2m'] },
  { label: 'Soil', keys: ['soil_temperature_0cm', 'soil_moisture_0_to_1cm'] },
]

export interface WeatherDataRow {
  time: string
  [key: string]: string | number | null
}

export interface WeatherResponse {
  frequency: 'daily' | 'hourly'
  variables: WeatherVariable[]
  data: WeatherDataRow[]
}

/**
 * Parse a "lat, lon" GPS string into a [lat, lon] tuple.
 * Extracted from TrialMap.tsx to be shared across components.
 */
export function parseGPS(gps: string | null): [number, number] | null {
  if (!gps) return null
  const parts = gps.split(',').map((s) => parseFloat(s.trim()))
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return [parts[0], parts[1]]
  }
  return null
}

/**
 * Compute the centroid of a GeoJSON FeatureCollection's polygon coordinates.
 * Returns [lat, lon] or null if no valid coordinates found.
 */
export function getFieldCentroid(
  boundary: { type: string; features?: Array<{ geometry?: { type?: string; coordinates?: unknown } }> } | null
): [number, number] | null {
  if (!boundary || !boundary.features || boundary.features.length === 0) return null

  const coords: [number, number][] = []

  for (const feature of boundary.features) {
    if (!feature.geometry || !feature.geometry.coordinates) continue
    extractCoords(feature.geometry.coordinates as unknown[], coords)
  }

  if (coords.length === 0) return null

  let sumLat = 0
  let sumLon = 0
  for (const [lon, lat] of coords) {
    sumLat += lat
    sumLon += lon
  }
  // GeoJSON is [lon, lat], return as [lat, lon]
  return [sumLat / coords.length, sumLon / coords.length]
}

function extractCoords(arr: unknown[], out: [number, number][]): void {
  if (arr.length >= 2 && typeof arr[0] === 'number' && typeof arr[1] === 'number') {
    out.push([arr[0] as number, arr[1] as number])
    return
  }
  for (const item of arr) {
    if (Array.isArray(item)) {
      extractCoords(item, out)
    }
  }
}
