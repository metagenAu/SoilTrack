import { cn } from '@/lib/utils'

const productStyles: Record<string, string> = {
  Digestor: 'bg-green-lush/15 text-green-lush border-green-lush/30',
  Transit: 'bg-meta-blue/15 text-meta-blue border-meta-blue/30',
  CPD: 'bg-meta-true-blue/15 text-meta-true-blue border-meta-true-blue/30',
  Control: 'bg-brand-grey-1/15 text-brand-grey-1 border-brand-grey-1/30',
  'Digestor + Transit': 'bg-green-eco/15 text-green-eco border-green-eco/30',
}

interface ProductTagProps {
  product: string
  className?: string
}

export default function ProductTag({ product, className }: ProductTagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
        productStyles[product] || 'bg-brand-grey-3 text-brand-black border-brand-grey-2',
        className
      )}
    >
      {product}
    </span>
  )
}
