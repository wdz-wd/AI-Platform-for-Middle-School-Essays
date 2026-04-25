import { cn } from '../../lib/utils'

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: string
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-3 py-1 text-xs font-semibold',
        tone === 'neutral' && 'bg-stone-50 text-stone-600',
        tone === 'success' && 'bg-emerald-50 text-emerald-600',
        tone === 'info' && 'bg-sky-50 text-sky-600',
        tone === 'warning' && 'bg-amber-50 text-amber-600',
        tone === 'danger' && 'bg-rose-50 text-rose-600',
      )}
    >
      {children}
    </span>
  )
}
