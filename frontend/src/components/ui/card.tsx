import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function Card({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-stone-200 bg-white p-5 shadow-panel',
        className,
      )}
    >
      {children}
    </div>
  )
}
