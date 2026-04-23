import * as React from 'react'
import { cn } from '../../lib/utils'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60',
          variant === 'primary' &&
            'bg-accent text-white shadow-panel hover:bg-teal-700',
          variant === 'secondary' &&
            'border border-stone-300 bg-white text-ink hover:bg-stone-50',
          variant === 'ghost' && 'text-ink hover:bg-stone-100',
          variant === 'danger' && 'bg-rose-600 text-white hover:bg-rose-700',
          className,
        )}
        {...props}
      />
    )
  },
)

Button.displayName = 'Button'
