import { cn } from '@/lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        variant === 'primary' && 'bg-meta-blue text-white hover:bg-meta-true-blue',
        variant === 'secondary' && 'bg-white text-brand-black border border-brand-grey-2 hover:bg-brand-grey-3',
        variant === 'ghost' && 'text-brand-black/70 hover:bg-brand-grey-3 hover:text-brand-black',
        size === 'sm' && 'px-3 py-1.5 text-xs',
        size === 'md' && 'px-4 py-2 text-sm',
        size === 'lg' && 'px-5 py-2.5 text-base',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
