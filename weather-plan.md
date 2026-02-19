# Open-Meteo Weather Integration Plan

## Overview

Add a **Weather** tab to both the Trial detail and Field detail pages, pulling historical weather data from the Open-Meteo Archive API. Users select a date range, frequency (daily/hourly), and weather parameters, then view results as interactive charts and a data table with CSV export.

---

## Architecture

```
User clicks "Weather" tab
  → WeatherTab (client component, shared by trial + field)
    → fetches /api/weather?lat=...&lon=...&start=...&end=...&frequency=daily&variables=...
      → API route proxies to Open-Meteo Archive API (server-side, with in-memory cache)
    → renders WeatherChart (Recharts line + bar combo chart)
    → renders WeatherTable (standard table with CSV export)
```

**Key decisions:**
- Server-side proxy via `/api/weather` keeps external calls off the client and enables caching (15-min TTL to avoid re-hitting Open-Meteo for identical queries)
- Single shared `<WeatherTab>` component used by both trial and field pages — just needs `latitude`, `longitude`, and optional default date range
- For trials: parse the `gps` text field (same as `parseGPS()` in TrialMap.tsx)
- For fields: compute centroid from `boundary` GeoJSON polygon; fall back to first linked trial's GPS if no boundary
- No database changes — weather data is fetched on-demand, not stored
- No new npm dependencies — Recharts already installed, native `fetch` for API calls

---

## Open-Meteo Parameters

### Daily variables (default selection)

| Label | API key | Unit |
|---|---|---|
| Max Temperature | `temperature_2m_max` | °C |
| Min Temperature | `temperature_2m_min` | °C |
| Mean Temperature | `temperature_2m_mean` | °C |
| Precipitation | `precipitation_sum` | mm |
| Rain | `rain_sum` | mm |
| ET₀ (Reference Evapotranspiration) | `et0_fao_evapotranspiration` | mm |
| Max Wind Speed | `wind_speed_10m_max` | km/h |
| Solar Radiation | `shortwave_radiation_sum` | MJ/m² |
| Mean Relative Humidity | `relative_humidity_2m_mean` | % |

### Hourly variables (when hourly frequency selected)

| Label | API key | Unit |
|---|---|---|
| Temperature | `temperature_2m` | °C |
| Precipitation | `precipitation` | mm |
| Relative Humidity | `relative_humidity_2m` | % |
| Wind Speed | `wind_speed_10m` | km/h |
| Soil Temperature (0 cm) | `soil_temperature_0cm` | °C |
| Soil Moisture (0–1 cm) | `soil_moisture_0_to_1cm` | m³/m³ |
| ET₀ | `et0_fao_evapotranspiration` | mm |
| Solar Radiation | `shortwave_radiation` | W/m² |

---

## New Files

### 1. `lib/weather.ts` — Types and constants

- `WeatherVariable` type: `{ key: string; label: string; unit: string; color: string; chartType: 'line' | 'bar' }`
- `DAILY_VARIABLES` and `HOURLY_VARIABLES` constant arrays (from the tables above)
- `WeatherResponse` interface matching the normalized API response shape
- `parseGPS(gps: string | null): [number, number] | null` — extract from TrialMap.tsx into a shared utility
- `getFieldCentroid(boundary: GeoJSON.FeatureCollection): [number, number] | null` — average of all polygon coordinates

### 2. `app/api/weather/route.ts` — API proxy route

- `GET` handler with query params: `lat`, `lon`, `start_date`, `end_date`, `frequency` (daily|hourly), `variables` (comma-separated)
- Validate params (lat/lon range, date format, max range of 2 years to keep responses manageable)
- Build Open-Meteo archive URL: `https://archive-api.open-meteo.com/v1/archive?latitude=...&longitude=...&start_date=...&end_date=...&daily=...&timezone=auto`
- Fetch with error handling (timeout, non-200 status)
- In-memory cache: `Map<string, { data: any; expires: number }>` keyed on full query string, 15-min TTL
- Auth via `requireAuth()`
- Return normalized JSON: `{ frequency, variables: [...], data: [{ time, var1, var2, ... }] }`

### 3. `components/weather/WeatherChart.tsx` — Time-series chart

- Recharts `ComposedChart` inside `ResponsiveContainer` (height: 400)
- `Line` series for temperature, humidity, wind, radiation, ET₀ (smooth monotone curves)
- `Bar` series for precipitation/rain (stacked at bottom)
- Dual Y-axis: left for temperature (°C), right for precipitation (mm)
- Colors from the `WeatherVariable` definitions (reusing brand palette)
- Custom tooltip matching existing app style (borderRadius 8, brand-grey-2 border)
- XAxis formatted as date strings (daily: "Jan 15", hourly: "Jan 15 14:00")
- Legend with toggle to show/hide individual series

### 4. `components/weather/WeatherTable.tsx` — Data table with export

- Standard `<table>` matching existing app pattern: `table-header` class, alternating `bg-brand-grey-3` rows, `font-mono` for numbers
- Columns: Date/Time + one column per selected variable (header shows label + unit)
- Numbers rounded to 1 decimal place
- Pagination: 50 rows per page with prev/next buttons (hourly data for a year = 8,760 rows)
- CSV download button: generates blob from current data, triggers `<a download>` click
- Filename pattern: `weather_{lat}_{lon}_{start}_{end}.csv`

### 5. `components/weather/WeatherTab.tsx` — Main tab component

- Props: `{ latitude: number | null; longitude: number | null; defaultStartDate?: string; defaultEndDate?: string; locationLabel?: string }`
- **Controls bar** (inside a `.card`):
  - Location display: "📍 -29.05, 151.29" (read-only, shows where data is being pulled from)
  - Date range: two `<input type="date">` fields (start / end)
    - Default for trials: `planting_date` → `harvest_date` (or last 12 months if missing)
    - Default for fields: last 12 months
  - Frequency toggle: two buttons "Daily" / "Hourly" (styled like the existing tab pattern)
  - Parameter checkboxes grouped by category:
    - **Temperature**: Max Temp, Min Temp, Mean Temp
    - **Water**: Precipitation, Rain, ET₀
    - **Atmosphere**: Wind Speed, Solar Radiation, Humidity
    - **Soil** (hourly only): Soil Temperature, Soil Moisture
  - "Fetch Weather" button (primary style) — triggers the API call
- **Loading state**: skeleton pulse animation over chart + table area
- **Error state**: if no GPS/coordinates → card with message "No GPS coordinates available for this trial/field. Add GPS data to view weather information."
- **Results** (below controls):
  - `<WeatherChart>` in a `.card`
  - `<WeatherTable>` in a `.card`

---

## Modified Files

### 6. `app/(dashboard)/trials/[id]/TrialDetailTabs.tsx`

- Add `'Weather'` to the `tabs` array (between `'Map'` and `'Management'`)
- Import `WeatherTab` from `@/components/weather/WeatherTab`
- Add conditional render block:
  ```tsx
  {activeTab === 'Weather' && (
    <WeatherTab
      latitude={parsedGps?.[0] ?? null}
      longitude={parsedGps?.[1] ?? null}
      defaultStartDate={trial.planting_date}
      defaultEndDate={trial.harvest_date}
      locationLabel={trial.location}
    />
  )}
  ```
- Parse GPS at component top level using the shared `parseGPS()` from `lib/weather.ts`

### 7. `components/fields/FieldDetailTabs.tsx`

- Add `{ key: 'weather', label: 'Weather', icon: CloudSun }` to the tabs array
- Import `CloudSun` from lucide-react, `WeatherTab` from `@/components/weather/WeatherTab`
- Import `getFieldCentroid` from `@/lib/weather`
- Compute coordinates: centroid from `field.boundary`, or fall back to first linked trial's GPS
- Add conditional render block:
  ```tsx
  {activeTab === 'weather' && (
    <WeatherTab
      latitude={coords?.[0] ?? null}
      longitude={coords?.[1] ?? null}
      locationLabel={field.name}
    />
  )}
  ```
- Need to pass `fieldTrials` GPS data down so the fallback works — the trial objects from `field_trials` join already include `trials(*)` which has `gps`

---

## UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Summary │ Treatments │ ... │ Map │ Weather │ Management      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ card ─────────────────────────────────────────────────┐ │
│  │ WEATHER DATA                   📍 -29.05, 151.29      │ │
│  │                                                        │ │
│  │ Start date  [2024-01-01]    End date [2024-12-31]     │ │
│  │                                                        │ │
│  │ Frequency:  [● Daily]  [○ Hourly]                     │ │
│  │                                                        │ │
│  │ Parameters:                                            │ │
│  │  Temperature   ☑ Max  ☑ Min  ☑ Mean                   │ │
│  │  Water         ☑ Precipitation  ☐ Rain  ☑ ET₀         │ │
│  │  Atmosphere    ☐ Wind  ☐ Solar Radiation  ☐ Humidity  │ │
│  │                                                        │ │
│  │                          [ Fetch Weather Data ]        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ card ─────────────────────────────────────────────────┐ │
│  │  40°C ─┐                              ┌─ 30mm         │ │
│  │        │  ╱╲    ╱╲                    │               │ │
│  │  20°C ─│╱    ╲╱    ╲╱╲              ▐│               │ │
│  │        │              ╲        ▐▐  ▐▐│               │ │
│  │   0°C ─┤    ▐  ▐▐      ╲─  ▐▐▐▐▐▐▐▐▐│─ 0mm         │ │
│  │        Jan  Feb  Mar ... Oct  Nov  Dec                │ │
│  │                                                        │ │
│  │  ── Max Temp  ── Min Temp  ■ Precipitation  ── ET₀    │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ card ─────────────────────────────────────────────────┐ │
│  │  Date       │ Max °C │ Min °C │ Precip mm │ ET₀ mm    │ │
│  │─────────────┼────────┼────────┼───────────┼───────     │ │
│  │  2024-01-01 │  32.4  │  18.1  │    0.0    │  5.2      │ │
│  │  2024-01-02 │  34.1  │  19.3  │    2.4    │  4.8      │ │
│  │  ...        │  ...   │  ...   │    ...    │  ...      │ │
│  │                                                        │ │
│  │  Page 1 of 8    [← Prev]  [Next →]    [Download CSV]  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Order

| Step | File(s) | Description |
|---|---|---|
| 1 | `lib/weather.ts` | Types, constants, parseGPS, getFieldCentroid |
| 2 | `app/api/weather/route.ts` | API proxy with cache |
| 3 | `components/weather/WeatherTable.tsx` | Data table with pagination + CSV export |
| 4 | `components/weather/WeatherChart.tsx` | Recharts time-series chart |
| 5 | `components/weather/WeatherTab.tsx` | Main tab component with controls |
| 6 | `TrialDetailTabs.tsx` | Add Weather tab to trials |
| 7 | `FieldDetailTabs.tsx` | Add Weather tab to fields |

---

## Considerations

- **No database changes** — weather data is fetched on-demand, not persisted
- **No new npm packages** — Recharts is already installed; `fetch` is native
- **Open-Meteo rate limit** — 10,000 calls/day free; server-side cache mitigates repeated queries
- **GPS availability** — graceful empty state when no coordinates exist
- **Timezone** — pass `timezone=auto` to Open-Meteo so data aligns with local time at the field/trial location
- **Max query range** — cap at 2 years per request to keep response sizes reasonable (Open-Meteo can return 80+ years but that would be huge)
- **Hourly soil params** — only shown in the checkbox UI when "Hourly" frequency is selected (not available in daily mode from Open-Meteo)
