export type FileClassification =
  | 'trialSummary'
  | 'soilHealth'
  | 'soilChemistry'
  | 'plotData'
  | 'tissueChemistry'
  | 'sampleMetadata'
  | 'photo'
  | 'unknown'

export function classifyFile(filename: string): FileClassification {
  const lower = filename.toLowerCase()

  if (lower.includes('start here') || lower.includes('trial summary')) {
    return 'trialSummary'
  }
  if (lower.includes('soil health')) {
    return 'soilHealth'
  }
  if (lower.includes('soil chemistry')) {
    return 'soilChemistry'
  }
  if (lower.includes('plot data')) {
    return 'plotData'
  }
  if (lower.includes('tissue chemistry')) {
    return 'tissueChemistry'
  }
  if (lower.includes('sample metadata') || lower.includes('assay data') || lower.includes('metadata')) {
    return 'sampleMetadata'
  }
  if (/\.(jpg|jpeg|png|webp)$/i.test(lower)) {
    return 'photo'
  }
  return 'unknown'
}
