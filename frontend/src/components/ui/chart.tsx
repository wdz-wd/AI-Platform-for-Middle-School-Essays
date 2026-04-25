import * as React from 'react'
import { cn } from '../../lib/utils'

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode
    color?: string
  }
>

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null)

export function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error('useChart must be used within a <ChartContainer />')
  }

  return context
}

export function ChartContainer({
  id,
  className,
  children,
  config,
}: React.ComponentProps<'div'> & {
  config: ChartConfig
  children: React.ReactNode
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        className={cn(
          'flex aspect-video w-full items-center justify-center text-xs',
          className,
        )}
      >
        <style
          dangerouslySetInnerHTML={{
            __html: Object.entries(config)
              .filter(([, value]) => value.color)
              .map(
                ([key, value]) =>
                  `[data-chart=${chartId}] { --color-${key}: ${value.color}; }`,
              )
              .join('\n'),
          }}
        />
        {children}
      </div>
    </ChartContext.Provider>
  )
}
