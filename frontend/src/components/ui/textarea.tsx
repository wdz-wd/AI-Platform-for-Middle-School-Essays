import * as React from 'react'
import { cn } from '../../lib/utils'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        'min-h-32 w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-stone-400 focus:border-accent focus:ring-2 focus:ring-teal-100',
        className,
      )}
      {...props}
    />
  )
})

Textarea.displayName = 'Textarea'
