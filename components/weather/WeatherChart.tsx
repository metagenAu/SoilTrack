'use client'

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { WeatherVariable, WeatherDataRow } from '@/lib/weather'

interface WeatherChartProps {
  data: WeatherDataRow[]
  variables: WeatherVariable[]
  frequency: 'daily' | 'hourly'
}

function formatXAxis(time: string, frequency: 'daily' | 'hourly'): string {
  const d = new Date(time)
  if (frequency === 'hourly') {
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) +
      ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

// Determine which Y-axis a variable should use
function getYAxisId(v: WeatherVariable): string {
  if (v.unit === 'mm') return 'right'
  return 'left'
}

export default function WeatherChart({ data, variables, frequency }: WeatherChartProps) {
  const hasLeft = variables.some((v) => getYAxisId(v) === 'left')
  const hasRight = variables.some((v) => getYAxisId(v) === 'right')

  // Calculate appropriate tick interval to avoid label crowding
  const tickInterval = data.length > 60 ? Math.floor(data.length / 15) : undefined

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
        <XAxis
          dataKey="time"
          tickFormatter={(t) => formatXAxis(t, frequency)}
          tick={{ fontSize: 11 }}
          interval={tickInterval}
          angle={-30}
          textAnchor="end"
          height={60}
        />
        {hasLeft && (
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11 }}
            label={{ value: '°C / units', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }}
          />
        )}
        {hasRight && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11 }}
            label={{ value: 'mm', angle: 90, position: 'insideRight', style: { fontSize: 11 } }}
          />
        )}
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: '1px solid #DCDDDF',
            fontSize: 12,
          }}
          labelFormatter={(t) => formatXAxis(t as string, frequency)}
          formatter={(value: number | undefined, name: string | undefined) => {
            const v = variables.find((vr) => vr.label === name)
            return [value != null ? value.toFixed(1) : '\u2014', `${name ?? ''}${v ? ` (${v.unit})` : ''}`]
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />

        {variables.map((v) =>
          v.chartType === 'bar' ? (
            <Bar
              key={v.key}
              dataKey={v.key}
              name={v.label}
              yAxisId={getYAxisId(v)}
              fill={v.color}
              opacity={0.7}
              barSize={data.length > 90 ? 2 : data.length > 30 ? 4 : 8}
            />
          ) : (
            <Line
              key={v.key}
              dataKey={v.key}
              name={v.label}
              yAxisId={getYAxisId(v)}
              stroke={v.color}
              strokeWidth={1.5}
              dot={false}
              type="monotone"
              connectNulls
            />
          )
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
