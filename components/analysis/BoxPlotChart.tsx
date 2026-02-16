'use client'

/**
 * Box plot chart built using Recharts composable shapes.
 * Shows median, Q1-Q3 box, and min-max whiskers for each group.
 */

import {
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Scatter,
  ZAxis,
} from 'recharts'

const CHART_COLORS = [
  '#008BCE', '#00BB7E', '#006AC6', '#009775', '#004C97',
  '#e67e22', '#99F0FA', '#B9EFA3', '#161F28', '#B9BCBF',
]

interface GroupStats {
  label: string
  mean: number
  stdError: number
  stdDev: number
  min: number
  q1: number
  median: number
  q3: number
  max: number
  n: number
  values: number[]
}

interface MetricStats {
  metric: string
  unit: string
  groups: GroupStats[]
}

// Custom box plot shape for Recharts Scatter
function BoxPlotShape(props: any) {
  const { cx, cy, payload } = props
  if (!payload || !cx) return null

  const { q1, q3, median, min, max } = payload
  const yScale = props.yAxis
  if (!yScale || !yScale.scale) return null

  const scale = yScale.scale
  const boxWidth = 40

  const yMin = scale(min)
  const yQ1 = scale(q1)
  const yMedian = scale(median)
  const yQ3 = scale(q3)
  const yMax = scale(max)

  const color = CHART_COLORS[payload.index % CHART_COLORS.length]

  return (
    <g>
      {/* Whisker line (min to max) */}
      <line x1={cx} x2={cx} y1={yMin} y2={yMax} stroke="#161F28" strokeWidth={1} />

      {/* Min cap */}
      <line x1={cx - boxWidth / 4} x2={cx + boxWidth / 4} y1={yMin} y2={yMin} stroke="#161F28" strokeWidth={1.5} />

      {/* Max cap */}
      <line x1={cx - boxWidth / 4} x2={cx + boxWidth / 4} y1={yMax} y2={yMax} stroke="#161F28" strokeWidth={1.5} />

      {/* Box (Q1 to Q3) */}
      <rect
        x={cx - boxWidth / 2}
        y={yQ3}
        width={boxWidth}
        height={yQ1 - yQ3}
        fill={color}
        fillOpacity={0.3}
        stroke={color}
        strokeWidth={1.5}
        rx={2}
      />

      {/* Median line */}
      <line
        x1={cx - boxWidth / 2}
        x2={cx + boxWidth / 2}
        y1={yMedian}
        y2={yMedian}
        stroke={color}
        strokeWidth={2.5}
      />
    </g>
  )
}

export default function BoxPlotChart({ metric }: { metric: MetricStats }) {
  const data = metric.groups.map((g, i) => ({
    name: g.label,
    // We use median as the y value for scatter positioning
    y: g.median,
    min: g.min,
    q1: g.q1,
    median: g.median,
    q3: g.q3,
    max: g.max,
    mean: g.mean,
    n: g.n,
    index: i,
    // x position (index-based, 1-indexed)
    x: i + 1,
  }))

  const allValues = metric.groups.flatMap(g => g.values)
  const yMin = allValues.length > 0 ? Math.min(...allValues) : 0
  const yMax = allValues.length > 0 ? Math.max(...allValues) : 1
  const padding = (yMax - yMin) * 0.1 || 1

  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <ComposedChart
          data={data}
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#DCDDDF" />
          <XAxis
            dataKey="name"
            type="category"
            tick={{ fontSize: 11, fill: '#161F28' }}
            tickLine={false}
            axisLine={{ stroke: '#DCDDDF' }}
            allowDuplicatedCategory={false}
          />
          <YAxis
            domain={[yMin - padding, yMax + padding]}
            tick={{ fontSize: 11, fill: '#B9BCBF' }}
            tickLine={false}
            axisLine={false}
            label={{
              value: metric.unit || metric.metric,
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: 11, fill: '#B9BCBF' },
            }}
          />
          <ZAxis range={[0, 0]} />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: '1px solid #DCDDDF',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
            formatter={(_: any, _name: any, props: any) => {
              const d = props.payload
              return [
                `n=${d.n} | Min: ${d.min.toFixed(2)} | Q1: ${d.q1.toFixed(2)} | Med: ${d.median.toFixed(2)} | Q3: ${d.q3.toFixed(2)} | Max: ${d.max.toFixed(2)}`,
                d.name,
              ]
            }}
          />
          <Scatter
            dataKey="y"
            shape={<BoxPlotShape />}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
