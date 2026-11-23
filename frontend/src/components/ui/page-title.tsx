import type { ReactNode } from 'react'

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-3xl font-black tracking-tight text-ink [overflow-wrap:anywhere]">{children}</h1>
}
