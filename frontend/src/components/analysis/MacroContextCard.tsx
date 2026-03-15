import type { MacroSnapshot, MacroTicker } from '../../types/market'

// ── Helpers ───────────────────────────────────────────────────────────────────

const dirArrow = (dir: MacroTicker['direction']) =>
  dir === 'rising' ? '↑' : dir === 'falling' ? '↓' : '→'

const dirColor = (dir: MacroTicker['direction'], key: string) => {
  // For fear gauges (VIX), rising = bearish signal
  const invertedKeys = ['india_vix']
  const negative = invertedKeys.includes(key) ? dir === 'rising' : dir === 'falling'
  const positive = invertedKeys.includes(key) ? dir === 'falling' : dir === 'rising'
  if (positive) return 'text-up'
  if (negative) return 'text-down'
  return 'text-neutral'
}

function fmtValue(key: string, value: number | null): string {
  if (value === null) return '—'
  if (key === 'usd_inr') return value.toFixed(2)
  if (key === 'india_vix' || key === 'us_10y') return value.toFixed(2)
  if (key === 'gold') return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (key === 'brent') return value.toFixed(2)
  return value.toFixed(2)
}

function fmtUnit(key: string): string {
  if (key === 'us_10y') return '%'
  if (key === 'gold') return 'USD/oz'
  if (key === 'brent') return 'USD/bbl'
  if (key === 'usd_inr') return '₹'
  return ''
}

// ── Tile ──────────────────────────────────────────────────────────────────────

function MacroTile({ t }: { t: MacroTicker }) {
  const chg = t.change_1m_pct
  const color = dirColor(t.direction, t.key)

  return (
    <div className="bg-bg/60 border border-border rounded-xl px-4 py-3 space-y-1.5 flex flex-col h-full justify-between">
      {/* Label + arrow */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70">
          {t.label}
        </p>
        <span className={`text-sm font-bold ${color}`}>{dirArrow(t.direction)}</span>
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-1.5">
        <p className="text-xl font-black font-mono text-text-primary leading-none">
          {fmtValue(t.key, t.value)}
        </p>
        {fmtUnit(t.key) && (
          <span className="text-[10px] text-text-muted">{fmtUnit(t.key)}</span>
        )}
      </div>

      {/* 1M change */}
      {chg !== null && (
        <p className={`text-[11px] font-semibold font-mono ${chg >= 0 ? 'text-up' : 'text-down'}`}>
          {chg >= 0 ? '+' : ''}{chg.toFixed(1)}% past month
        </p>
      )}

      {/* Context */}
      <p className="text-[10px] text-text-muted leading-snug">{t.context}</p>
    </div>
  )
}

// ── Props / Component ─────────────────────────────────────────────────────────

interface Props {
  data: MacroSnapshot
  loading?: boolean
}

export function MacroContextCard({ data, loading }: Props) {
  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col h-full">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70 mb-3 flex-shrink-0">
          Macro Context
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1 grid-rows-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-xl bg-border/30 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">Macro Context</p>
          <p className="text-[11px] text-text-muted mt-0.5">
            Global forces shaping market conditions
          </p>
        </div>
        <span className="text-[10px] text-text-muted/50">{data.trade_date}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1 grid-rows-2">
        {data.tickers.map((t) => (
          <MacroTile key={t.key} t={t} />
        ))}
      </div>
    </div>
  )
}
