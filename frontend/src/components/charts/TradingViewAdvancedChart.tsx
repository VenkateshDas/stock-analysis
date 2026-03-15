import { useEffect, useMemo, useRef } from 'react'

interface TradingViewAdvancedChartProps {
  symbol: string
  interval?: string
  height?: number
}

export function TradingViewAdvancedChart({
  symbol,
  interval = '15',
  height = 620,
}: TradingViewAdvancedChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const containerId = useMemo(
    () => `tv-advanced-chart-${symbol.replace(/[^a-zA-Z0-9]/g, '-')}`,
    [symbol],
  )

  useEffect(() => {
    const host = containerRef.current
    if (!host || !symbol) return

    host.innerHTML = ''
    const widgetRoot = document.createElement('div')
    widgetRoot.id = containerId
    widgetRoot.style.height = '100%'
    host.appendChild(widgetRoot)

    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.type = 'text/javascript'
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      theme: 'light',
      style: '1',
      locale: 'en',
      backgroundColor: '#ffffff',
      gridColor: 'rgba(24,33,27,0.08)',
      hide_side_toolbar: false,
      allow_symbol_change: true,
      withdateranges: true,
      details: true,
      calendar: false,
      hotlist: false,
      studies: ['Volume@tv-basicstudies'],
      container_id: containerId,
      support_host: 'https://www.tradingview.com',
    })

    host.appendChild(script)
  }, [containerId, interval, symbol])

  return (
    <div className="rounded-2xl border border-border bg-surface p-3 shadow-panel">
      <div className="flex items-center justify-between gap-2 px-1 pb-3">
        <div>
          <h3 className="text-sm font-bold text-text-primary">Interactive Chart</h3>
          <p className="text-xs text-text-muted">
            Use built-in tools for drawings, indicators, and timeframe changes.
          </p>
        </div>
      </div>
      <div
        ref={containerRef}
        className="w-full rounded-xl overflow-hidden border border-border/90 bg-white"
        style={{ height }}
      />
    </div>
  )
}
