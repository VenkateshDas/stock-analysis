import type { ValuationMetrics } from '../../types/market'

// ── Helpers ───────────────────────────────────────────────────────────────────

const SIGNAL_META: Record<ValuationMetrics['pe_signal'], { label: string; text: string; bg: string; border: string }> = {
  cheap:       { label: 'Undervalued',  text: 'text-up',        bg: 'bg-up/10',       border: 'border-up/30' },
  fair:        { label: 'Fair Value',   text: 'text-neutral',   bg: 'bg-neutral/10',  border: 'border-neutral/30' },
  stretched:   { label: 'Stretched',   text: 'text-accent',    bg: 'bg-accent/10',   border: 'border-accent/30' },
  expensive:   { label: 'Expensive',   text: 'text-down',      bg: 'bg-down/10',     border: 'border-down/30' },
  unavailable: { label: 'No Data',     text: 'text-text-muted', bg: 'bg-border/20',  border: 'border-border' },
}

function fmt(n: number | null, decimals = 1): string {
  return n != null ? n.toFixed(decimals) : '—'
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  data: ValuationMetrics
  loading?: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ValuationPanel({ data, loading }: Props) {
  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70 mb-3">
          Valuation
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-border/30 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const sig = SIGNAL_META[data.pe_signal]

  // Gauge: position of current PE vs history average
  const gaugeWidth = (() => {
    if (!data.trailing_pe || !data.historical_pe_avg) return 50
    const ratio = data.trailing_pe / data.historical_pe_avg
    // Map 0.5x → 1.5x range to 0% → 100% gauge
    return Math.max(0, Math.min(100, (ratio - 0.5) / 1.0 * 100))
  })()

  const rows: [string, string][] = [
    ['Price / Earnings (trailing)', fmt(data.trailing_pe) + 'x'],
    ['Price / Earnings (forward)',  fmt(data.forward_pe) + 'x'],
    ['Price / Book',                fmt(data.price_to_book, 2) + 'x'],
    ['Dividend Yield',              data.dividend_yield != null ? fmt(data.dividend_yield, 2) + '%' : '—'],
    ['Earnings Yield',              data.earnings_yield != null ? fmt(data.earnings_yield, 2) + '%' : '—'],
    ['Equity Risk Premium',         data.equity_risk_premium != null
      ? (data.equity_risk_premium >= 0 ? '+' : '') + fmt(data.equity_risk_premium, 2) + '%'
      : '—'],
  ]

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">

      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-border flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-text-primary">Valuation</p>
          <p className="text-[11px] text-text-muted mt-0.5">
            {data.data_source}
          </p>
        </div>
        <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${sig.text} ${sig.bg} ${sig.border}`}>
          {sig.label}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">

        {/* Left: multiples table */}
        <div className="px-5 py-4 space-y-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-[11px] text-text-muted">{label}</span>
              <span className="text-xs font-mono font-semibold text-text-primary">{value}</span>
            </div>
          ))}
        </div>

        {/* Right: visual gauge + context */}
        <div className="px-5 py-4 space-y-4">

          {/* PE vs historical average gauge */}
          {data.trailing_pe && data.historical_pe_avg ? (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70">
                PE vs Long-Run Average
              </p>
              <div className="relative h-3 bg-border/40 rounded-full overflow-hidden">
                {/* Zones */}
                <div className="absolute inset-0 flex">
                  <div className="h-full bg-up/20"    style={{ width: '35%' }} />
                  <div className="h-full bg-neutral/15" style={{ width: '30%' }} />
                  <div className="h-full bg-accent/20" style={{ width: '20%' }} />
                  <div className="h-full bg-down/20"  style={{ width: '15%' }} />
                </div>
                {/* Marker */}
                <div
                  className="absolute top-0.5 w-2 h-2 rounded-full bg-text-primary border border-surface shadow-sm"
                  style={{ left: `calc(${gaugeWidth}% - 4px)` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-text-muted/60">
                <span>Cheap</span>
                <span>Fair</span>
                <span>Stretched</span>
                <span>Expensive</span>
              </div>

              <div className="pt-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-text-muted">Current PE</span>
                  <span className="text-xs font-mono font-bold text-text-primary">
                    {fmt(data.trailing_pe)}x
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-text-muted">Historical avg PE</span>
                  <span className="text-xs font-mono text-text-muted">
                    {fmt(data.historical_pe_avg)}x
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-text-muted">Premium / Discount</span>
                  <span className={`text-xs font-mono font-semibold ${
                    data.trailing_pe > data.historical_pe_avg ? 'text-down' : 'text-up'
                  }`}>
                    {((data.trailing_pe / data.historical_pe_avg - 1) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-text-muted italic">Gauge unavailable</p>
          )}

          {/* ERP context */}
          {data.equity_risk_premium != null && (
            <div className="pt-3 border-t border-border space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70">
                Equity Risk Premium
              </p>
              <p className={`text-lg font-black font-mono ${
                data.equity_risk_premium >= 2 ? 'text-up' :
                data.equity_risk_premium < 0  ? 'text-down' : 'text-neutral'
              }`}>
                {data.equity_risk_premium >= 0 ? '+' : ''}{data.equity_risk_premium.toFixed(2)}%
              </p>
              <p className="text-[10px] text-text-muted leading-snug">
                {data.equity_risk_premium >= 2
                  ? 'Equities offer meaningful yield premium over bonds — historically supportive.'
                  : data.equity_risk_premium >= 0
                  ? 'Thin premium over bonds — valuation support is limited.'
                  : 'Bonds yield more than equities — historically a headwind for PE multiples.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
