'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ErrorBar,
  Cell,
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
  values?: number[]
}

interface MetricStats {
  metric: string
  unit: string
  groups: GroupStats[]
}

export default function BarChartWithSE({ metric }: { metric: MetricStats }) {
  const data = metric.groups.map(g => ({
    name: g.label,
    mean: parseFloat(g.mean.toFixed(3)),
    errorBar: parseFloat(g.stdError.toFixed(3)),
    n: g.n,
  }))

  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#DCDDDF" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#161F28' }}
            tickLine={false}
            axisLine={{ stroke: '#DCDDDF' }}
          />
          <YAxis
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
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: '1px solid #DCDDDF',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
            formatter={(value: any, name: any) => {
              if (name === 'mean') return [Number(value).toFixed(3), 'Mean']
              return [value, name]
            }}
            labelStyle={{ fontWeight: 600 }}
          />
          <Bar dataKey="mean" radius={[4, 4, 0, 0]} maxBarSize={60}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
            <ErrorBar
              dataKey="errorBar"
              width={8}
              strokeWidth={1.5}
              stroke="#161F28"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
