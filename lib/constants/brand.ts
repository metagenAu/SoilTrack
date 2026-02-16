export const COLORS = {
  metaBlue: '#008BCE',
  electricBlue: '#99F0FA',
  trueBlue: '#006AC6',
  richBlue: '#004C97',
  deepBlue: '#002E5D',
  lushGreen: '#00BB7E',
  lightGreen: '#B9EFA3',
  ecoGreen: '#009775',
  richGreen: '#00664F',
  richBlack: '#161F28',
  white: '#FFFFFF',
  grey1: '#B9BCBF',
  grey2: '#DCDDDF',
  grey3: '#F3F4F4',
} as const

export const PRODUCT_COLORS: Record<string, string> = {
  Digestor: '#00BB7E',
  Transit: '#008BCE',
  CPD: '#006AC6',
  Control: '#B9BCBF',
  'Digestor + Transit': '#009775',
}

export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: '#00BB7E', text: '#FFFFFF' },
  completed: { bg: '#008BCE', text: '#FFFFFF' },
  paused: { bg: '#e67e22', text: '#FFFFFF' },
}

export const PRODUCT_LIST = ['Digestor', 'Transit', 'CPD', 'Control', 'Digestor + Transit'] as const
