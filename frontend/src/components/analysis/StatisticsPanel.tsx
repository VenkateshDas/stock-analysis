import type { StatisticalMetrics } from '../../types/market'

interface StatisticsPanelProps {
  data: StatisticalMetrics
  currency: string
  lastClose: number
}

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—'
  return v.toFixed(decimals)
}


export function StatisticsPanel({ data, currency, lastClose }: StatisticsPanelProps) {
  const w52Range =
    data.week52_high != null && data.week52_low != null
      ? data.week52_high - data.week52_low
      : null
  const w52Position =
    w52Range && data.week52_low != null
      ? ((lastClose - data.week52_low) / w52Range) * 100
      : null

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
      <h3 className="text-sm font-semibold text-text-primary">Statistical Metrics</h3>

      {/* 52-week range */}
      <div>
        <p className="text-xs text-text-muted font-medium uppercase tracking-wider mb-2">
          52-Week Range
        </p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-bg rounded-lg p-3">
            <p className="text-xs text-text-muted mb-1">52W High</p>
            <p className="text-sm font-mono text-text-primary font-bold">
              {data.week52_high?.toLocaleString() ?? '—'}
            </p>
            {data.pct_from_52w_high != null && (
              <p className="text-xs text-down">{fmt(data.pct_from_52w_high)}% from high</p>
            )}
          </div>
          <div className="bg-bg rounded-lg p-3">
            <p className="text-xs text-text-muted mb-1">52W Low</p>
            <p className="text-sm font-mono text-text-primary font-bold">
              {data.week52_low?.toLocaleString() ?? '—'}
            </p>
            {data.pct_from_52w_low != null && (
              <p className="text-xs text-up">+{fmt(data.pct_from_52w_low)}% from low</p>
            )}
          </div>
        </div>

        {/* Range bar */}
        {w52Position != null && (
          <div>
            <div className="flex justify-between text-xs text-text-muted mb-1">
              <span>52W Low</span>
              <span className="text-accent">{w52Position.toFixed(1)}% of range</span>
              <span>52W High</span>
            </div>
            <div className="h-2 bg-bg rounded-full overflow-hidden relative border border-border">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, w52Position))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Volatility & Range */}
      <div>
        <p className="text-xs text-text-muted font-medium uppercase tracking-wider mb-2">
          Volatility & Range
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-bg rounded-lg p-3">
            <p className="text-xs text-text-muted mb-1">20D Annualised Vol</p>
            <p className="text-sm font-mono text-text-primary font-bold">
              {data.volatility_20d != null ? `${fmt(data.volatility_20d)}%` : '—'}
            </p>
          </div>
          <div className="bg-bg rounded-lg p-3">
            <p className="text-xs text-text-muted mb-1">Daily Range</p>
            <p className="text-sm font-mono text-text-primary font-bold">
              {data.daily_range?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '—'}{' '}
              <span className="text-xs font-normal text-text-muted">{currency}</span>
            </p>
            {data.daily_range_pct != null && (
              <p className="text-xs text-text-muted">{fmt(data.daily_range_pct)}% of prev close</p>
            )}
          </div>
          {data.atr_ratio != null && (
            <div className="bg-bg rounded-lg p-3 col-span-2">
              <p className="text-xs text-text-muted mb-1">Range / ATR ratio</p>
              <p className="text-sm font-mono text-text-primary font-bold">{fmt(data.atr_ratio)}x</p>
              <p className="text-xs text-text-muted">
                {data.atr_ratio > 1.2 ? 'Above-average range day' : data.atr_ratio < 0.8 ? 'Low range day' : 'Normal range'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
