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
          'inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60',
          variant === 'primary' &&
            'bg-accent text-white hover:bg-blue-700',
          variant === 'secondary' &&
            'border border-stone-200 bg-white text-ink hover:bg-stone-50',
          variant === 'ghost' && 'text-stone-600 hover:bg-stone-100 hover:text-ink',
          variant === 'danger' && 'bg-rose-600 text-white hover:bg-rose-700',
          className,
        )}
        {...props}
      />
    )
  },
)

Button.displayName = 'Button'
