import type { MultiTimeframeTrend, TimeframeTrend } from '../../types/market'

interface TrendPanelProps {
  trend: MultiTimeframeTrend | null
  loading: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function directionArrow(label: TimeframeTrend['trend_label']) {
  switch (label) {
    case 'strong_uptrend':   return '↑↑'
    case 'uptrend':          return '↑'
    case 'weak_uptrend':     return '↗'
    case 'flat':             return '→'
    case 'weak_downtrend':   return '↘'
    case 'downtrend':        return '↓'
    case 'strong_downtrend': return '↓↓'
    default:                 return '→'
  }
}

function directionColor(direction: TimeframeTrend['direction']) {
  if (direction === 'up')   return 'text-up'
  if (direction === 'down') return 'text-down'
  return 'text-neutral'
}

function directionBg(direction: TimeframeTrend['direction']) {
  if (direction === 'up')   return 'bg-up/10 border-up/20'
  if (direction === 'down') return 'bg-down/10 border-down/20'
  return 'bg-neutral/10 border-neutral/20'
}

function trendLabelText(label: TimeframeTrend['trend_label']) {
  return label.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function scoreBar(score: number) {
  // score is -1 to +1; map to 0–100% for bar width
  const pct = Math.round(((score + 1) / 2) * 100)
  const color = score > 0.1 ? 'bg-up' : score < -0.1 ? 'bg-down' : 'bg-neutral'
  return { pct, color }
}

function fmt(n: number | null | undefined, decimals = 2, suffix = '') {
  if (n == null) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(decimals)}${suffix}`
}

function pct(n: number | null | undefined) {
  return fmt(n, 2, '%')
}

function reliabilityColor(r: string) {
  if (r === 'high')     return 'text-up'
  if (r === 'moderate') return 'text-neutral'
  if (r === 'low')      return 'text-down/70'
  return 'text-text-muted'
}

function persistenceLabel(p: string | null) {
  if (!p) return null
  if (p === 'trending')       return { text: 'Persistent trend', color: 'text-up' }
  if (p === 'mean_reverting') return { text: 'Mean-reverting', color: 'text-down' }
  return { text: 'Random walk', color: 'text-neutral' }
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 animate-pulse space-y-3">
      <div className="h-4 bg-border rounded w-1/3" />
      <div className="h-10 bg-border rounded w-1/2" />
      <div className="h-3 bg-border rounded w-full" />
      <div className="h-3 bg-border rounded w-4/5" />
      <div className="h-3 bg-border rounded w-3/5" />
    </div>
  )
}

function TimeframeCard({ data }: { data: TimeframeTrend }) {
  const arrow   = directionArrow(data.trend_label)
  const txtCol  = directionColor(data.direction)
  const bgBdr   = directionBg(data.direction)
  const bar     = scoreBar(data.trend_score)
  const persist = persistenceLabel(data.persistence)

  const timeframeLabels: Record<string, string> = {
    daily:   'Daily Trend',
    weekly:  'Weekly Trend',
    monthly: 'Monthly Trend',
    yearly:  'Yearly Trend',
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-3 border-b ${bgBdr} flex items-center justify-between`}>
        <div>
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider">
            {timeframeLabels[data.timeframe] ?? data.timeframe}
          </p>
          <p className="text-xs text-text-muted/60 mt-0.5">{data.window_label}</p>
        </div>
        <span className={`text-3xl font-black leading-none ${txtCol}`}>{arrow}</span>
      </div>

      {/* Trend label + score bar */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className={`text-sm font-bold ${txtCol}`}>
            {trendLabelText(data.trend_label)}
          </span>
          <span className="text-xs text-text-muted font-mono">
            {data.trend_score > 0 ? '+' : ''}{data.trend_score.toFixed(2)}
          </span>
        </div>
        {/* Score bar: left=bearish, center=flat, right=bullish */}
        <div className="relative h-2 bg-border rounded-full overflow-hidden">
          <div
            className="absolute top-0 h-full rounded-full transition-all duration-500"
            style={{
              left: data.trend_score >= 0
                ? '50%'
                : `${(0.5 + data.trend_score / 2) * 100}%`,
              width: `${Math.abs(data.trend_score) * 50}%`,
            }}
          >
            <div className={`h-full w-full ${bar.color}`} />
          </div>
          {/* Center marker */}
          <div className="absolute top-0 left-1/2 w-px h-full bg-border/60" />
        </div>
      </div>

      {/* Metrics grid */}
      <div className="px-4 pb-4 space-y-2 pt-2">
        {/* Total return */}
        <div className="flex justify-between text-xs">
          <span className="text-text-muted">Period return</span>
          <span className={`font-mono font-medium ${(data.total_return_pct ?? 0) >= 0 ? 'text-up' : 'text-down'}`}>
            {pct(data.total_return_pct)}
          </span>
        </div>

        {/* Slope */}
        {data.slope_pct_per_bar != null && (
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Slope / bar</span>
            <span className="font-mono text-text-primary">{pct(data.slope_pct_per_bar)}</span>
          </div>
        )}

        {/* R² */}
        {data.r_squared != null && (
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Trend consistency (R²)</span>
            <span className="font-mono text-text-primary">{(data.r_squared * 100).toFixed(0)}%</span>
          </div>
        )}

        {/* Mann-Kendall significance */}
        <div className="flex justify-between text-xs">
          <span className="text-text-muted">Statistically significant</span>
          <span className={data.trend_significant ? 'text-up font-medium' : 'text-text-muted'}>
            {data.trend_significant ? `Yes (p=${data.mk_pvalue?.toFixed(3)})` : `No (p=${data.mk_pvalue?.toFixed(3) ?? '—'})`}
          </span>
        </div>

        {/* Hurst / persistence (yearly only) */}
        {data.hurst_exponent != null && persist && (
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Hurst exponent</span>
            <span className={`font-mono font-medium ${persist.color}`}>
              {data.hurst_exponent.toFixed(2)} — {persist.text}
            </span>
          </div>
        )}

        {/* Forecast */}
        {data.next_period_forecast != null && data.forecast_reliability !== 'unavailable' && (
          <div className="pt-2 mt-1 border-t border-border">
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Next period forecast</span>
              <span className={`font-mono font-medium ${(data.forecast_change_pct ?? 0) >= 0 ? 'text-up' : 'text-down'}`}>
                {data.next_period_forecast.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                {' '}({pct(data.forecast_change_pct)})
              </span>
            </div>
            <div className="flex justify-end mt-0.5">
              <span className={`text-xs ${reliabilityColor(data.forecast_reliability)}`}>
                {data.forecast_reliability} reliability
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function TrendPanel({ trend, loading }: TrendPanelProps) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      {/* Panel header */}
      <div className="flex items-center gap-2 mb-5">
        <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Multi-Timeframe Trend Analysis</h3>
          <p className="text-xs text-text-muted">
            Theil-Sen regression · Mann-Kendall significance · Holt-ES forecast
          </p>
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {!loading && !trend && (
        <p className="text-sm text-text-muted italic text-center py-8">
          Trend analysis unavailable.
        </p>
      )}

      {!loading && trend && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TimeframeCard data={trend.daily} />
            <TimeframeCard data={trend.weekly} />
            <TimeframeCard data={trend.monthly} />
            <TimeframeCard data={trend.yearly} />
          </div>

          <p className="text-xs text-text-muted/50 mt-4 text-center">
            Robust slope (Theil-Sen) · Non-parametric significance (Mann-Kendall)
            · Trend persistence (Hurst, yearly) · as of {trend.trade_date}
          </p>
        </>
      )}
    </div>
  )
}
