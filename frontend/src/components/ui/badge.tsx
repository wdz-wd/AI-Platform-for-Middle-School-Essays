import { cn } from '../../lib/utils'

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: string
  tone?: 'neutral' | 'success' | 'warning' | 'danger'
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-3 py-1 text-xs font-semibold',
        tone === 'neutral' && 'bg-stone-100 text-stone-700',
        tone === 'success' && 'bg-emerald-100 text-emerald-700',
        tone === 'warning' && 'bg-amber-100 text-amber-700',
        tone === 'danger' && 'bg-rose-100 text-rose-700',
      )}
    >
      {children}
    </span>
  )
}
