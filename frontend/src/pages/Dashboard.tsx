import { useEffect, useMemo, useState } from 'react'
import { useMarketStore } from '../store/useMarketStore'
import { MarketGrid } from '../components/market/MarketGrid'
import { MacroContextCard } from '../components/analysis/MacroContextCard'
import { PerformanceLeague } from '../components/market/PerformanceLeague'

const SYMBOL_COUNTRY: Record<string, string> = {
  N225: 'Japan',
  HSI: 'Hong Kong',
  KS11: 'South Korea',
  AXJO: 'Australia',
  NSEI: 'India',
  CNX100: 'India',
  CNX200: 'India',
  CNX500: 'India',
  NSEBANK: 'India',
  FTSE: 'UK',
  GDAXI: 'Germany',
  FCHI: 'France',
  GSPC: 'USA',
  DJI: 'USA',
  NDX: 'USA',
}

const INDIA_SYMBOLS = new Set(['NSEI', 'CNX100', 'CNX200', 'CNX500', 'NSEBANK'])
const DASHBOARD_POLL_MS = 60_000

function SectionHead({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <div>
      <h2 className="text-lg font-extrabold text-text-primary tracking-tight">{title}</h2>
      <p className="text-sm text-text-muted mt-1">{subtitle}</p>
    </div>
  )
}

export function Dashboard() {
  const { indices, indicesLoading, indicesError, fetchIndices, fetchOverview, macro, macroLoading, fetchMacro } =
    useMarketStore()
  const [selectedCountry, setSelectedCountry] = useState<string>('All')

  useEffect(() => {
    fetchIndices()
    fetchOverview()
    if (!macro && !macroLoading) fetchMacro()
  }, [fetchIndices, fetchOverview, macro, macroLoading, fetchMacro])

  useEffect(() => {
    const id = window.setInterval(() => {
      fetchIndices()
      fetchOverview()
    }, DASHBOARD_POLL_MS)
    return () => window.clearInterval(id)
  }, [fetchIndices, fetchOverview])

  const marketStats = useMemo(() => {
    const up = indices.filter((i) => i.change_pct >= 0).length
    const down = indices.length - up
    const avgMove = indices.length
      ? indices.reduce((acc, item) => acc + item.change_pct, 0) / indices.length
      : 0
    return { up, down, avgMove }
  }, [indices])

  // Derive macro risk signal from VIX, crude, DXY, TNX
  const macroRisk = useMemo(() => {
    if (!macro) return null
    const vix   = macro.tickers.find((t) => t.key === 'india_vix')
    const crude = macro.tickers.find((t) => t.key === 'brent')
    const dxy   = macro.tickers.find((t) => t.key === 'dxy')
    const tnx   = macro.tickers.find((t) => t.key === 'us_10y')
    let bear = 0, bull = 0
    if (vix?.value   && vix.value > 20)                bear++
    if (vix?.value   && vix.value < 14)                bull++
    if (crude?.change_1m_pct && crude.change_1m_pct > 8)  bear++
    if (crude?.change_1m_pct && crude.change_1m_pct < -5) bull++
    if (dxy?.direction === 'rising')                   bear++
    if (dxy?.direction === 'falling')                  bull++
    if (tnx?.value && tnx.value > 4.5)                bear++
    if (tnx?.value && tnx.value < 3.5)                bull++
    if (bear > bull + 1) return 'risk-off' as const
    if (bull > bear)     return 'risk-on'  as const
    return 'neutral' as const
  }, [macro])

  if (indicesLoading && indices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-text-muted text-sm">Fetching global market data...</p>
      </div>
    )
  }

  if (indicesError && indices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 rounded-full bg-down/10 flex items-center justify-center">
          <svg className="w-6 h-6 text-down" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <p className="text-down font-medium">{indicesError}</p>
        <button
          onClick={() => fetchIndices()}
          className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent/90 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  const indiaIndices = indices.filter((index) => INDIA_SYMBOLS.has(index.symbol))
  const internationalIndices = indices.filter((index) => !INDIA_SYMBOLS.has(index.symbol))
  const globalCountries = [
    'All',
    ...Array.from(new Set(internationalIndices.map((index) => SYMBOL_COUNTRY[index.symbol] ?? 'Other'))).sort(),
  ]
  const filteredInternational =
    selectedCountry === 'All'
      ? internationalIndices
      : internationalIndices.filter((index) => (SYMBOL_COUNTRY[index.symbol] ?? 'Other') === selectedCountry)

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className={`grid gap-3 ${macroRisk ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'}`}>
        <div className="rounded-xl border border-border bg-surface p-4 flex items-center gap-4">
          <div className="w-8 h-8 rounded-full bg-up/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-up" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-text-muted">Advancing</p>
            <p className="text-2xl font-extrabold text-up leading-none mt-0.5">{marketStats.up}</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 flex items-center gap-4">
          <div className="w-8 h-8 rounded-full bg-down/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-down" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-text-muted">Declining</p>
            <p className="text-2xl font-extrabold text-down leading-none mt-0.5">{marketStats.down}</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 flex items-center gap-4">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${marketStats.avgMove >= 0 ? 'bg-up/10' : 'bg-down/10'}`}>
            <svg className={`w-4 h-4 ${marketStats.avgMove >= 0 ? 'text-up' : 'text-down'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-text-muted">Avg move</p>
            <p className={`text-2xl font-extrabold leading-none mt-0.5 ${marketStats.avgMove >= 0 ? 'text-up' : 'text-down'}`}>
              {marketStats.avgMove >= 0 ? '+' : ''}{marketStats.avgMove.toFixed(2)}%
            </p>
          </div>
        </div>

        {/* Macro risk badge — only shown once macro data loads */}
        {macroRisk && (
          <div className={`rounded-xl border p-4 flex items-center gap-4 ${
            macroRisk === 'risk-on'  ? 'border-up/30 bg-up/5' :
            macroRisk === 'risk-off' ? 'border-down/30 bg-down/5' :
            'border-border bg-surface'
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              macroRisk === 'risk-on' ? 'bg-up/15' : macroRisk === 'risk-off' ? 'bg-down/15' : 'bg-neutral/15'
            }`}>
              <svg className={`w-4 h-4 ${macroRisk === 'risk-on' ? 'text-up' : macroRisk === 'risk-off' ? 'text-down' : 'text-neutral'}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d={macroRisk === 'risk-on'
                    ? 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z'
                    : 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z'
                  }
                />
              </svg>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-text-muted">Macro</p>
              <p className={`text-lg font-extrabold leading-none mt-0.5 ${
                macroRisk === 'risk-on' ? 'text-up' : macroRisk === 'risk-off' ? 'text-down' : 'text-neutral'
              }`}>
                {macroRisk === 'risk-on' ? 'Risk-On' : macroRisk === 'risk-off' ? 'Risk-Off' : 'Neutral'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Global Performance League + Macro Context (side by side on wide screens) */}
      {indices.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:items-start">
          <PerformanceLeague indices={indices} />
          {(macro || macroLoading) && (
            <MacroContextCard data={macro!} loading={macroLoading && !macro} />
          )}
        </div>
      )}

      {/* India Watchlist */}
      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-panel space-y-4">
        <SectionHead title="India Watchlist" subtitle="India indices at a glance." />
        <MarketGrid indices={indiaIndices} />
      </section>

      {/* International Context */}
      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-panel space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionHead
            title="International Context"
            subtitle="Cross-market structure displayed in readable cards with country filtering."
          />
          {internationalIndices.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {globalCountries.map((country) => (
                <button
                  key={country}
                  onClick={() => setSelectedCountry(country)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    selectedCountry === country
                      ? 'bg-accent text-white border-accent'
                      : 'bg-bg border-border text-text-muted hover:border-accent hover:text-text-primary'
                  }`}
                >
                  {country}
                </button>
              ))}
            </div>
          )}
        </div>
        <MarketGrid indices={filteredInternational} />
      </section>

      {indices.length > 0 && (
        <p className="text-xs text-text-muted text-center">
          Data via Yahoo Finance · Current session: {indices[0]?.trade_date} · Auto-refresh every 1 minute
        </p>
      )}
    </div>
  )
}
