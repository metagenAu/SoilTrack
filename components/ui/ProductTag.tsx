import { cn } from '@/lib/utils'

const productStyles: Record<string, string> = {
  Digestor: 'bg-green-lush/8 text-green-rich border-green-lush/15',
  Transit: 'bg-meta-blue/8 text-meta-rich-blue border-meta-blue/15',
  CPD: 'bg-meta-true-blue/8 text-meta-rich-blue border-meta-true-blue/15',
  Control: 'bg-brand-grey-3 text-brand-black/50 border-brand-grey-2',
  'Digestor + Transit': 'bg-green-eco/8 text-green-rich border-green-eco/15',
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
