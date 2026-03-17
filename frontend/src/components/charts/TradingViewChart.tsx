import { useEffect, useRef } from 'react'

// Extend Window to include TradingView widget constructor
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TradingView?: { widget: new (config: Record<string, unknown>) => any }
  }
}

type ChartInterval = '1d' | '1h' | '15m' | '5m'

function toTVInterval(interval: ChartInterval): string {
  switch (interval) {
    case '5m':  return '5'
    case '15m': return '15'
    case '1h':  return '60'
    case '1d':  return 'D'
  }
}

/**
 * Extract TradingView symbol from a TradingView chart URL.
 * e.g. "https://www.tradingview.com/chart/?symbol=NSE:NIFTY50" → "NSE:NIFTY50"
 */
export function extractTVSymbol(tradingviewUrl: string): string {
  if (!tradingviewUrl) return ''
  try {
    const url = new URL(tradingviewUrl)
    return url.searchParams.get('symbol') ?? ''
  } catch {
    return ''
  }
}

/**
 * Derive a TradingView symbol from a Yahoo Finance ticker when no
 * tradingview_url is provided.
 *
 * - RELIANCE.NS  → NSE:RELIANCE
 * - HDFC.BO      → BSE:HDFC
 * - ^NSEI        → NSE:NIFTY50   (known index override handled externally)
 * - AAPL         → NASDAQ:AAPL
 */
export function yfinanceToTVSymbol(ticker: string): string {
  if (!ticker) return ''
  if (ticker.endsWith('.NS')) return `NSE:${ticker.slice(0, -3)}`
  if (ticker.endsWith('.BO')) return `BSE:${ticker.slice(0, -3)}`
  // Strip ^ prefix for Yahoo index tickers
  const t = ticker.startsWith('^') ? ticker.slice(1) : ticker
  // Assume US-listed for bare tickers
  return t
}

// Counter to generate unique container IDs across mounts
let _idSeq = 0

// Track whether the TradingView script has been injected
let _scriptPromise: Promise<void> | null = null

function loadTVScript(): Promise<void> {
  if (typeof window.TradingView !== 'undefined') return Promise.resolve()
  if (_scriptPromise) return _scriptPromise

  _scriptPromise = new Promise((resolve) => {
    if (document.getElementById('tv-script')) {
      // Script tag exists but TradingView hasn't initialised yet — poll briefly
      const t = window.setInterval(() => {
        if (typeof window.TradingView !== 'undefined') {
          window.clearInterval(t)
          resolve()
        }
      }, 50)
      return
    }
    const script = document.createElement('script')
    script.id = 'tv-script'
    script.src = 'https://s3.tradingview.com/tv.js'
    script.async = true
    script.onload = () => resolve()
    document.head.appendChild(script)
  })

  return _scriptPromise
}

/**
 * Returns true if the TradingView symbol is freely accessible in the embedded
 * widget without a TradingView subscription.
 *
 * NSE and BSE India data require a paid "NSE" plan on TradingView, so
 * symbols starting with "NSE:" or "BSE:" are NOT available in free embeds.
 */
export function isTVSymbolFree(tvSymbol: string): boolean {
  if (!tvSymbol) return false
  const restricted = ['NSE:', 'BSE:']
  return !restricted.some((prefix) => tvSymbol.startsWith(prefix))
}

interface TradingViewChartProps {
  /** TradingView symbol, e.g. "NSE:NIFTY50" or "TVC:SPX" */
  symbol: string
  interval?: ChartInterval
  height?: number
  /** IANA timezone string. Defaults to 'exchange' (TV's own market timezone). */
  timezone?: string
}

export function TradingViewChart({
  symbol,
  interval = '1d',
  height = 500,
  timezone,
}: TradingViewChartProps) {
  // Stable unique ID for the widget container — one per component instance
  const containerId = useRef(`tv_chart_${++_idSeq}`).current

  useEffect(() => {
    if (!symbol) return

    let cancelled = false

    loadTVScript().then(() => {
      if (cancelled || typeof window.TradingView === 'undefined') return

      // Clear any previous widget markup (React doesn't always remount the div)
      const container = document.getElementById(containerId)
      if (container) container.innerHTML = ''

      new window.TradingView.widget({
        autosize: true,
        symbol,
        interval: toTVInterval(interval),
        timezone: timezone ?? 'exchange',
        theme: 'light',
        style: '1',         // Candlestick
        locale: 'en',
        enable_publishing: false,
        allow_symbol_change: false,
        container_id: containerId,
        withdateranges: true,
        save_image: false,
        hide_side_toolbar: false,
        // Pre-load volume indicator so users see it by default
        studies: ['STD;Volume'],
      })
    })

    return () => {
      cancelled = true
      // Clean up widget markup so next mount starts fresh
      const container = document.getElementById(containerId)
      if (container) container.innerHTML = ''
    }
  }, [symbol, interval, containerId, timezone])

  if (!symbol) {
    return (
      <div
        className="bg-surface border border-border rounded-xl flex items-center justify-center text-text-muted text-sm"
        style={{ height }}
      >
        Chart symbol not available
      </div>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden border border-border" style={{ height }}>
      <div id={containerId} style={{ height: '100%' }} />
    </div>
  )
}
