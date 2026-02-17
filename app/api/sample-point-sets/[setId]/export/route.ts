import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// GET /api/sample-point-sets/[setId]/export?format=csv|geojson
export async function GET(
  request: NextRequest,
  { params }: { params: { setId: string } }
) {
  const supabase = createServerSupabaseClient()
  const format = request.nextUrl.searchParams.get('format') || 'csv'

  // Fetch set with points and data layers + values
  const { data: set, error } = await supabase
    .from('sample_point_sets')
    .select(`
      *,
      sample_points(*),
      point_data_layers(
        *,
        point_data_values(*)
      )
    `)
    .eq('id', params.setId)
    .order('sort_order', { referencedTable: 'sample_points' })
    .single()

  if (error || !set) {
    return NextResponse.json({ error: 'Set not found' }, { status: 404 })
  }

  const points = set.sample_points || []
  const layers = set.point_data_layers || []

  if (format === 'geojson') {
    // Build GeoJSON FeatureCollection
    const features = points.map((p: any) => {
      const props: Record<string, any> = {
        label: p.label,
        notes: p.notes || '',
        ...p.properties,
      }

      // Add data layer values
      for (const layer of layers) {
        const val = (layer.point_data_values || []).find((v: any) => v.point_id === p.id)
        if (val) {
          props[layer.name] = val.value ?? val.text_value ?? null
        }
      }

      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [parseFloat(p.longitude), parseFloat(p.latitude)],
        },
        properties: props,
      }
    })

    const geojson = {
      type: 'FeatureCollection' as const,
      features,
    }

    return new NextResponse(JSON.stringify(geojson, null, 2), {
      headers: {
        'Content-Type': 'application/geo+json',
        'Content-Disposition': `attachment; filename="${set.name.replace(/[^a-zA-Z0-9-_ ]/g, '')}.geojson"`,
      },
    })
  }

  // CSV format
  // Build header: label, latitude, longitude, notes, ...data_layer_names
  const csvEscape = (v: any): string => {
    const s = String(v ?? '')
    return `"${s.replace(/"/g, '""')}"`
  }

  const layerNames = layers.map((l: any) => l.name)
  const header = ['label', 'latitude', 'longitude', 'notes', ...layerNames]

  const rows = points.map((p: any) => {
    const row: any[] = [
      p.label,
      p.latitude,
      p.longitude,
      p.notes || '',
    ]

    for (const layer of layers) {
      const val = (layer.point_data_values || []).find((v: any) => v.point_id === p.id)
      row.push(val ? (val.value ?? val.text_value ?? '') : '')
    }

    return row.map(csvEscape).join(',')
  })

  const csv = [header.map(csvEscape).join(','), ...rows].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${set.name.replace(/[^a-zA-Z0-9-_ ]/g, '')}.csv"`,
    },
  })
}
