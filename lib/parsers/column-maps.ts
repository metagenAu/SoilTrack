/**
 * Declarative column mapping configuration.
 *
 * Each data type defines:
 * - identityColumns: columns that identify the row (sample_no, date, etc.)
 *   Each maps a DB field name → array of possible CSV/Excel header aliases.
 * - pivotMode: 'none' for direct row mapping, 'wide-to-long' for metric pivoting
 * - valueColumns (pivotMode='none' only): fixed measurement columns with aliases
 * - metadataExclusions (pivotMode='wide-to-long' only): column names to skip during pivot
 * - tableName: target Supabase table
 * - fileType: value for trial_data_files tracking
 *
 * To support a new column name from a different lab or format,
 * add the alias to the relevant array — no parser code changes needed.
 */

export interface ColumnAlias {
  dbField: string
  aliases: string[]
  type: 'string' | 'number' | 'date'
}

export interface ColumnMapConfig {
  tableName: string
  fileType: string
  pivotMode: 'none' | 'wide-to-long'
  identityColumns: ColumnAlias[]
  /** For pivotMode='none': fixed value columns that map 1:1 to DB columns */
  valueColumns?: ColumnAlias[]
  /** For pivotMode='wide-to-long': extra identity-like columns to exclude from pivoting */
  extraIdentityAliases?: string[]
  /** Unit extraction regex for pivot columns — matches e.g. "pH (1:5)" */
  unitPattern?: RegExp
}

export const COLUMN_MAPS: Record<string, ColumnMapConfig> = {
  soilHealth: {
    tableName: 'soil_health_samples',
    fileType: 'soilHealth',
    pivotMode: 'none',
    identityColumns: [
      { dbField: 'sample_no', aliases: ['sampleno', 'sample_no', 'sample no', 'sample', 'sample id', 'sampleid'], type: 'string' },
      { dbField: 'date', aliases: ['date', 'sample_date', 'collection_date', 'sampling_date'], type: 'date' },
      { dbField: 'property', aliases: ['property', 'farm', 'site', 'paddock'], type: 'string' },
      { dbField: 'block', aliases: ['block', 'paddock', 'zone'], type: 'string' },
      { dbField: 'barcode', aliases: ['barcode', 'bar_code', 'bar code'], type: 'string' },
      { dbField: 'latitude', aliases: ['latitude', 'lat'], type: 'number' },
      { dbField: 'longitude', aliases: ['longitude', 'lng', 'lon', 'long'], type: 'number' },
    ],
    valueColumns: [],
  },

  soilChemistry: {
    tableName: 'soil_chemistry',
    fileType: 'soilChemistry',
    pivotMode: 'wide-to-long',
    identityColumns: [
      { dbField: 'sample_no', aliases: ['sampleno', 'sample_no', 'sample no', 'sample', 'sample id', 'sampleid'], type: 'string' },
      { dbField: 'date', aliases: ['date', 'sample_date', 'collection_date', 'sampling_date'], type: 'date' },
      { dbField: 'block', aliases: ['block', 'property', 'paddock', 'zone'], type: 'string' },
    ],
    extraIdentityAliases: ['barcode', 'bar_code', 'bar code'],
    unitPattern: /\(([^)]+)\)/,
  },

  plotData: {
    tableName: 'plot_data',
    fileType: 'plotData',
    pivotMode: 'none',
    identityColumns: [
      { dbField: 'plot', aliases: ['plot', 'plot no', 'plot_no', 'plotno', 'plot number'], type: 'string' },
      { dbField: 'trt_number', aliases: ['trt', 'treatment', 'trt_number', 'trt_no', 'treatment_number', 'treatment number'], type: 'number' },
      { dbField: 'rep', aliases: ['rep', 'replicate', 'rep_no', 'replication'], type: 'number' },
    ],
    valueColumns: [
      { dbField: 'yield_t_ha', aliases: ['yield', 'yield_t_ha', 'yield t/ha', 'yield_tha', 'yield (t/ha)'], type: 'number' },
      { dbField: 'plant_count', aliases: ['plant_count', 'plant count', 'plants', 'plantcount', 'plant_no', 'plant no'], type: 'number' },
      { dbField: 'vigour', aliases: ['vigour', 'vigor', 'vigour_score', 'vigor_score'], type: 'number' },
      { dbField: 'disease_score', aliases: ['disease', 'disease_score', 'disease score', 'diseasescore'], type: 'number' },
    ],
  },

  tissueChemistry: {
    tableName: 'tissue_chemistry',
    fileType: 'tissueChemistry',
    pivotMode: 'wide-to-long',
    identityColumns: [
      { dbField: 'sample_no', aliases: ['sampleno', 'sample_no', 'sample no', 'sample', 'sample id', 'sampleid'], type: 'string' },
      { dbField: 'date', aliases: ['date', 'sample_date', 'collection_date', 'sampling_date'], type: 'date' },
      { dbField: 'tissue_type', aliases: ['tissue', 'tissue_type', 'tissue type', 'tissuetype', 'plant_part', 'plant part'], type: 'string' },
    ],
    extraIdentityAliases: [],
    unitPattern: /\(([^)]+)\)/,
  },

  sampleMetadata: {
    tableName: 'sample_metadata',
    fileType: 'sampleMetadata',
    pivotMode: 'wide-to-long',
    identityColumns: [
      { dbField: 'sample_no', aliases: ['sampleno', 'sample_no', 'sample no', 'sample', 'sample id', 'sampleid'], type: 'string' },
      { dbField: 'date', aliases: ['date', 'sample_date', 'collection_date', 'sampling_date'], type: 'date' },
      { dbField: 'block', aliases: ['block', 'property', 'paddock', 'zone'], type: 'string' },
      { dbField: 'treatment', aliases: ['treatment', 'trt', 'trt_number', 'trt_no'], type: 'number' },
      { dbField: 'assay_type', aliases: ['assay_type', 'assay', 'assaytype', 'assay type'], type: 'string' },
    ],
    extraIdentityAliases: ['barcode', 'bar_code', 'bar code', 'rep', 'replicate'],
    unitPattern: /\(([^)]+)\)/,
  },
}

/**
 * Build a lookup of all known aliases (lowercased) across all identity + value + extra columns.
 * Used by the generic parser to determine which headers are "known" vs "unmapped".
 */
export function getKnownAliases(config: ColumnMapConfig): Set<string> {
  const known = new Set<string>()
  for (const col of config.identityColumns) {
    for (const alias of col.aliases) {
      known.add(alias.toLowerCase())
    }
  }
  if (config.valueColumns) {
    for (const col of config.valueColumns) {
      for (const alias of col.aliases) {
        known.add(alias.toLowerCase())
      }
    }
  }
  if (config.extraIdentityAliases) {
    for (const alias of config.extraIdentityAliases) {
      known.add(alias.toLowerCase())
    }
  }
  return known
}
