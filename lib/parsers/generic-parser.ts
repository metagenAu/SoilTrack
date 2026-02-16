/**
 * Generic parser that uses declarative column maps to transform
 * raw parsed rows into database-ready records.
 *
 * Supports two modes:
 * - 'none': direct row mapping (1 source row → 1 DB row)
 * - 'wide-to-long': pivot (1 source row → N DB rows, one per numeric metric column)
 *
 * Also detects unmapped columns so the UI can prompt users to review them.
 */

import { type ColumnMapConfig, type ColumnAlias, getKnownAliases } from './column-maps'

export interface ParseResult {
  /** Rows ready for database insertion (without trial_id — caller adds that) */
  rows: Record<string, any>[]
  /** Original headers from the source file */
  headers: string[]
  /** Columns that didn't match any known alias */
  unmappedColumns: string[]
  /** The column mapping that was applied (for storing in raw_uploads) */
  appliedMap: Record<string, string>
}

/**
 * Given raw parsed rows (from PapaParse or xlsx sheet_to_json) and a column map config,
 * produce database-ready rows.
 *
 * @param rawRows - Array of objects from CSV/Excel parsing (keys = original headers)
 * @param config - The ColumnMapConfig for this data type
 * @param overrides - Optional column mapping overrides from user review
 *                    (e.g. { "my weird col": "sample_no" })
 * @param extraDefaults - Extra default values (e.g. { assay_type: 'soilHealthChemistry' })
 */
export function genericParse(
  rawRows: Record<string, any>[],
  config: ColumnMapConfig,
  overrides?: Record<string, string>,
  extraDefaults?: Record<string, any>
): ParseResult {
  if (rawRows.length === 0) {
    return { rows: [], headers: [], unmappedColumns: [], appliedMap: {} }
  }

  const headers = Object.keys(rawRows[0])
  const knownAliases = getKnownAliases(config)

  // Build the header→dbField resolution map
  const headerMap = resolveHeaders(headers, config, overrides)

  // Find unmapped columns (headers that resolved to nothing)
  const unmappedColumns: string[] = []
  for (const h of headers) {
    const lh = h.toLowerCase().trim()
    if (!headerMap[lh] && !knownAliases.has(lh)) {
      // For pivot modes, non-identity columns become metrics — that's expected.
      // Only flag as unmapped if in 'none' mode (direct mapping).
      if (config.pivotMode === 'none') {
        unmappedColumns.push(h)
      }
    }
  }

  const rows: Record<string, any>[] = []

  if (config.pivotMode === 'none') {
    for (const raw of rawRows) {
      rows.push(mapDirectRow(raw, headers, headerMap, config, extraDefaults))
    }
  } else {
    for (const raw of rawRows) {
      rows.push(...mapPivotRow(raw, headers, headerMap, config, extraDefaults))
    }
  }

  return {
    rows,
    headers,
    unmappedColumns,
    appliedMap: headerMap,
  }
}

/**
 * Resolve file headers to DB field names using the column map + optional overrides.
 * Returns { lowercasedHeader: dbFieldName }
 */
function resolveHeaders(
  headers: string[],
  config: ColumnMapConfig,
  overrides?: Record<string, string>
): Record<string, string> {
  const map: Record<string, string> = {}

  // Apply identity columns
  for (const col of config.identityColumns) {
    for (const h of headers) {
      const lh = h.toLowerCase().trim()
      if (col.aliases.includes(lh)) {
        map[lh] = col.dbField
        break // first match wins
      }
    }
  }

  // Apply value columns (for direct-mode only)
  if (config.valueColumns) {
    for (const col of config.valueColumns) {
      for (const h of headers) {
        const lh = h.toLowerCase().trim()
        if (col.aliases.includes(lh)) {
          map[lh] = col.dbField
          break
        }
      }
    }
  }

  // Apply extra identity aliases (these get flagged as "skip during pivot" but don't map to a db field)
  if (config.extraIdentityAliases) {
    for (const alias of config.extraIdentityAliases) {
      const la = alias.toLowerCase()
      for (const h of headers) {
        if (h.toLowerCase().trim() === la) {
          map[la] = '__skip__'
          break
        }
      }
    }
  }

  // Apply user overrides last (highest priority)
  if (overrides) {
    for (const [sourceCol, targetField] of Object.entries(overrides)) {
      const lh = sourceCol.toLowerCase().trim()
      if (targetField === '__skip__' || targetField === '__metric__') {
        map[lh] = targetField
      } else {
        map[lh] = targetField
      }
    }
  }

  return map
}

/** Direct row mapping: 1 source row → 1 DB row */
function mapDirectRow(
  raw: Record<string, any>,
  headers: string[],
  headerMap: Record<string, string>,
  config: ColumnMapConfig,
  extraDefaults?: Record<string, any>
): Record<string, any> {
  const out: Record<string, any> = { raw_data: raw }

  // Apply extra defaults first (e.g. assay_type)
  if (extraDefaults) {
    Object.assign(out, extraDefaults)
  }

  // Map identity columns
  for (const col of config.identityColumns) {
    out[col.dbField] = resolveValue(raw, headers, headerMap, col)
  }

  // Map value columns
  if (config.valueColumns) {
    for (const col of config.valueColumns) {
      out[col.dbField] = resolveValue(raw, headers, headerMap, col)
    }
  }

  return out
}

/** Wide-to-long pivot: 1 source row → N DB rows (one per numeric metric column) */
function mapPivotRow(
  raw: Record<string, any>,
  headers: string[],
  headerMap: Record<string, string>,
  config: ColumnMapConfig,
  extraDefaults?: Record<string, any>
): Record<string, any>[] {
  // Extract identity values
  const identity: Record<string, any> = {}
  if (extraDefaults) {
    Object.assign(identity, extraDefaults)
  }

  for (const col of config.identityColumns) {
    identity[col.dbField] = resolveValue(raw, headers, headerMap, col)
  }

  // Build the set of all identity/excluded header keys (lowercased)
  const excludedKeys = new Set<string>()
  for (const col of config.identityColumns) {
    for (const alias of col.aliases) {
      excludedKeys.add(alias.toLowerCase())
    }
  }
  if (config.extraIdentityAliases) {
    for (const alias of config.extraIdentityAliases) {
      excludedKeys.add(alias.toLowerCase())
    }
  }

  // Pivot: every remaining column with a numeric value becomes a metric row
  const rows: Record<string, any>[] = []
  const unitPattern = config.unitPattern || /\(([^)]+)\)/

  for (const h of headers) {
    const lh = h.toLowerCase().trim()
    if (excludedKeys.has(lh)) continue

    // Check if this column was overridden to __skip__
    if (headerMap[lh] === '__skip__') continue

    const val = raw[h]
    if (val === undefined || val === null || val === '') continue

    const numVal = parseFloat(String(val))
    if (isNaN(numVal)) continue

    // Extract unit from header name if present
    const unitMatch = h.match(unitPattern)
    const unit = unitMatch ? unitMatch[1] : ''
    const metric = h.replace(/\s*\([^)]+\)\s*/, '').trim()

    rows.push({
      ...identity,
      metric,
      value: numVal,
      unit,
      raw_data: raw,
    })
  }

  return rows
}

/** Resolve a single column value from a raw row, trying aliases in order */
function resolveValue(
  raw: Record<string, any>,
  headers: string[],
  headerMap: Record<string, string>,
  col: ColumnAlias
): any {
  // Find which header maps to this db field
  for (const h of headers) {
    const lh = h.toLowerCase().trim()
    if (headerMap[lh] === col.dbField) {
      const val = raw[h]
      return coerceValue(val, col.type)
    }
  }

  // Fallback: try aliases directly against the raw row keys
  for (const alias of col.aliases) {
    for (const h of headers) {
      if (h.toLowerCase().trim() === alias) {
        const val = raw[h]
        return coerceValue(val, col.type)
      }
    }
  }

  // No match — return type-appropriate default
  return col.type === 'number' ? null : col.type === 'date' ? null : ''
}

function coerceValue(val: any, type: 'string' | 'number' | 'date'): any {
  if (val === undefined || val === null || val === '') {
    return type === 'string' ? '' : null
  }

  if (type === 'number') {
    const n = parseFloat(String(val))
    return isNaN(n) ? null : n
  }

  if (type === 'date') {
    const s = String(val).trim()
    if (!s) return null
    // Try ISO parse
    const d = new Date(s)
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0]
    }
    // Return as-is — the database will validate
    return s
  }

  return String(val).trim()
}
