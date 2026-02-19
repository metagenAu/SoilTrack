import { NextResponse } from 'next/server'
import { requireAuth, safeErrorResponse } from '@/lib/api-utils'
import { DAILY_VARIABLES, HOURLY_VARIABLES, type WeatherDataRow } from '@/lib/weather'

const OPEN_METEO_BASE = 'https://archive-api.open-meteo.com/v1/archive'
const CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes
const MAX_RANGE_DAYS = 730 // ~2 years

const cache = new Map<string, { data: unknown; expires: number }>()

// Periodic cleanup to prevent memory leaks
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (entry.expires < now) cache.delete(key)
  }
}, 60_000)

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s))
}

function daysBetween(a: string, b: string): number {
  return Math.abs(
    (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)
  )
}

export async function GET(request: Request) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const lat = searchParams.get('lat')
    const lon = searchParams.get('lon')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const frequency = searchParams.get('frequency') || 'daily'
    const variablesParam = searchParams.get('variables')

    // Validate required params
    if (!lat || !lon || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required parameters: lat, lon, start_date, end_date' },
        { status: 400 }
      )
    }

    const latNum = parseFloat(lat)
    const lonNum = parseFloat(lon)
    if (isNaN(latNum) || isNaN(lonNum) || latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
      return NextResponse.json(
        { error: 'Invalid latitude/longitude values' },
        { status: 400 }
      )
    }

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD.' },
        { status: 400 }
      )
    }

    if (startDate > endDate) {
      return NextResponse.json(
        { error: 'start_date must be before end_date' },
        { status: 400 }
      )
    }

    // Cap end_date to 5 days ago — the archive API lags behind real-time
    const archiveLimit = new Date()
    archiveLimit.setDate(archiveLimit.getDate() - 5)
    const archiveLimitStr = archiveLimit.toISOString().slice(0, 10)
    const safeEndDate = endDate > archiveLimitStr ? archiveLimitStr : endDate

    if (startDate > safeEndDate) {
      return NextResponse.json(
        { error: 'Requested date range is too recent for the weather archive (data has a ~5 day lag)' },
        { status: 400 }
      )
    }

    if (daysBetween(startDate, safeEndDate) > MAX_RANGE_DAYS) {
      return NextResponse.json(
        { error: `Date range must be ${MAX_RANGE_DAYS} days or less (~2 years)` },
        { status: 400 }
      )
    }

    if (frequency !== 'daily' && frequency !== 'hourly') {
      return NextResponse.json(
        { error: 'frequency must be "daily" or "hourly"' },
        { status: 400 }
      )
    }

    // Determine which variables to fetch
    const allVars = frequency === 'daily' ? DAILY_VARIABLES : HOURLY_VARIABLES
    const requestedKeys = variablesParam
      ? variablesParam.split(',').filter((k) => allVars.some((v) => v.key === k))
      : allVars.map((v) => v.key)

    if (requestedKeys.length === 0) {
      return NextResponse.json(
        { error: 'No valid variables specified' },
        { status: 400 }
      )
    }

    // Build cache key
    const cacheKey = `${latNum},${lonNum},${startDate},${safeEndDate},${frequency},${requestedKeys.join(',')}`
    const cached = cache.get(cacheKey)
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json(cached.data)
    }

    // Build Open-Meteo URL
    const params = new URLSearchParams({
      latitude: latNum.toString(),
      longitude: lonNum.toString(),
      start_date: startDate,
      end_date: safeEndDate,
      timezone: 'auto',
    })
    params.set(frequency, requestedKeys.join(','))

    const url = `${OPEN_METEO_BASE}?${params.toString()}`

    const resp = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      console.error('[weather] Open-Meteo error:', resp.status, text)
      return NextResponse.json(
        { error: 'Failed to fetch weather data from Open-Meteo' },
        { status: 502 }
      )
    }

    const raw = await resp.json()

    // Normalize to flat row format
    const timeKey = frequency === 'daily' ? 'daily' : 'hourly'
    const timeArray: string[] = raw[timeKey]?.time ?? []
    const data: WeatherDataRow[] = timeArray.map((time: string, i: number) => {
      const row: WeatherDataRow = { time }
      for (const key of requestedKeys) {
        row[key] = raw[timeKey]?.[key]?.[i] ?? null
      }
      return row
    })

    const variables = allVars.filter((v) => requestedKeys.includes(v.key))

    const result = { frequency, variables, data }

    // Cache the result
    cache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL_MS })

    return NextResponse.json(result)
  } catch (err) {
    return safeErrorResponse(err, 'weather')
  }
}
