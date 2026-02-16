export function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ')
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function getProductColor(product: string): string {
  const colors: Record<string, string> = {
    Digestor: '#00BB7E',
    Transit: '#008BCE',
    CPD: '#006AC6',
    Control: '#B9BCBF',
    'Digestor + Transit': '#009775',
  }
  return colors[product] || '#B9BCBF'
}

export function getStatusColor(status: string): { bg: string; text: string } {
  const colors: Record<string, { bg: string; text: string }> = {
    active: { bg: '#00BB7E', text: '#FFFFFF' },
    completed: { bg: '#008BCE', text: '#FFFFFF' },
    paused: { bg: '#e67e22', text: '#FFFFFF' },
  }
  return colors[status] || { bg: '#B9BCBF', text: '#FFFFFF' }
}
