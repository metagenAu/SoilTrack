import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const ALLOWED_TABLES = [
  'trials',
  'treatments',
  'soil_health_samples',
  'soil_chemistry',
  'plot_data',
  'tissue_chemistry',
  'clients',
  'management_log',
]

const PAGE_SIZE = 1000

function escapeCSVValue(val: unknown): string {
  if (val === null || val === undefined) return ''
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val)
  return str.includes(',') || str.includes('"') || str.includes('\n')
    ? `"${str.replace(/"/g, '""')}"`
    : str
}

/**
 * GET /api/export?table=trials
 * Streams CSV export with server-side pagination to avoid loading entire tables into memory.
 */
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const table = request.nextUrl.searchParams.get('table')

  if (!table || !ALLOWED_TABLES.includes(table)) {
    return NextResponse.json({ error: 'Invalid table name' }, { status: 400 })
  }

  // Verify the user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch first page to get headers
  const { data: firstPage, error } = await supabase
    .from(table)
    .select('*')
    .range(0, PAGE_SIZE - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!firstPage || firstPage.length === 0) {
    return new NextResponse('', {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${table}_export.csv"`,
      },
    })
  }

  const headers = Object.keys(firstPage[0])
  const csvParts: string[] = [headers.join(',')]

  // Add first page rows
  for (const row of firstPage) {
    csvParts.push(headers.map(h => escapeCSVValue(row[h])).join(','))
  }

  // Fetch remaining pages if needed
  if (firstPage.length === PAGE_SIZE) {
    let offset = PAGE_SIZE
    let hasMore = true

    while (hasMore) {
      const { data: page, error: pageError } = await supabase
        .from(table)
        .select('*')
        .range(offset, offset + PAGE_SIZE - 1)

      if (pageError || !page || page.length === 0) {
        hasMore = false
        break
      }

      for (const row of page) {
        csvParts.push(headers.map(h => escapeCSVValue(row[h])).join(','))
      }

      if (page.length < PAGE_SIZE) {
        hasMore = false
      } else {
        offset += PAGE_SIZE
      }
    }
  }

  const csv = csvParts.join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${table}_export.csv"`,
    },
  })
}
