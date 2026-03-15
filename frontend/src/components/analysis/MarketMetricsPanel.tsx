import type { StatisticalMetrics, TechnicalIndicators, MonthlyContribution } from '../../types/market'

interface MarketMetricsPanelProps {
  stats: StatisticalMetrics
  tech: TechnicalIndicators
  currency: string
  lastClose: number
}

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—'
  return v.toFixed(decimals)
}

function pctSign(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

function pctColor(v: number | null | undefined): string {
  if (v == null) return 'text-text-muted'
  return v >= 0 ? 'text-up' : 'text-down'
}

// Intensity-scaled background for ROC cells
function rocCellBg(v: number | null): string {
  if (v == null) return 'bg-bg'
  if (v >= 10) return 'bg-up/25'
  if (v >= 5) return 'bg-up/15'
  if (v >= 1) return 'bg-up/8'
  if (v <= -10) return 'bg-down/25'
  if (v <= -5) return 'bg-down/15'
  if (v <= -1) return 'bg-down/8'
  return 'bg-bg'
}

// ── ROC Table ──────────────────────────────────────────────────────────────────
function ROCTable({ stats }: { stats: StatisticalMetrics }) {
  const cols: { label: string; value: number | null }[] = [
    { label: '1 Week', value: stats.weekly_return_pct },
    { label: '1 Month', value: stats.monthly_return_pct },
    { label: '3 Months', value: stats.roc_3m_pct },
    { label: '6 Months', value: stats.roc_6m_pct },
    { label: 'YTD', value: stats.ytd_return_pct },
  ]

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70 mb-2">
        Rate of Change
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
        {cols.map(({ label, value }) => (
          <div
            key={label}
            className={`rounded-xl px-2 py-2.5 text-center ${rocCellBg(value)} border border-border/50`}
          >
            <p className="text-[9px] text-text-muted font-medium mb-1 truncate">{label}</p>
            <p className={`text-sm font-black font-mono leading-none ${pctColor(value)}`}>
              {pctSign(value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Drawdown Meter ─────────────────────────────────────────────────────────────
function DrawdownMeter({ stats }: { stats: StatisticalMetrics }) {
  const current = stats.current_drawdown_pct
  const maxYtd = stats.max_drawdown_ytd_pct

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70 mb-2">
        Drawdown
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-bg rounded-xl border border-border/50 px-3 py-3">
          <p className="text-[9px] text-text-muted font-medium mb-1">Current (3M Peak)</p>
          <p className={`text-xl font-black font-mono leading-none ${current != null && current < 0 ? 'text-down' : 'text-up'}`}>
            {current != null ? `${current >= 0 ? '+' : ''}${fmt(current)}%` : '—'}
          </p>
          <p className="text-[10px] text-text-muted mt-1">
            {current != null && current < -10
              ? 'Deep correction'
              : current != null && current < -5
              ? 'Moderate pullback'
              : current != null && current < -1
              ? 'Mild pullback'
              : current != null
              ? 'Near recent peak'
              : ''}
          </p>
        </div>
        <div className="bg-bg rounded-xl border border-border/50 px-3 py-3">
          <p className="text-[9px] text-text-muted font-medium mb-1">Max Drawdown YTD</p>
          <p className={`text-xl font-black font-mono leading-none ${maxYtd != null && maxYtd < 0 ? 'text-down' : 'text-up'}`}>
            {maxYtd != null ? `${fmt(maxYtd)}%` : '—'}
          </p>
          <p className="text-[10px] text-text-muted mt-1">
            {maxYtd != null ? 'Worst peak-to-trough this year' : ''}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Directional Bias ───────────────────────────────────────────────────────────
function DirectionalBias({ tech, lastClose }: { tech: TechnicalIndicators; lastClose: number }) {
  const ema20 = tech.ema20
  const ema50 = tech.ema50

  const aboveEma20 = ema20 != null && lastClose > ema20
  const aboveEma50 = ema50 != null && lastClose > ema50

  let biasLabel: string
  let biasDesc: string
  let biasColor: string
  let ema20Arrow: string
  let ema50Arrow: string

  if (ema20 != null && ema50 != null) {
    if (aboveEma20 && aboveEma50) {
      biasLabel = 'Strong Uptrend'
      biasDesc = 'Price above both short and medium-term averages'
      biasColor = 'text-up'
      ema20Arrow = '↑'
      ema50Arrow = '↑'
    } else if (!aboveEma20 && aboveEma50) {
      biasLabel = 'Consolidating'
      biasDesc = 'Pulling back — still above medium-term average'
      biasColor = 'text-accent'
      ema20Arrow = '↓'
      ema50Arrow = '↑'
    } else {
      biasLabel = 'Downtrend'
      biasDesc = 'Price below both short and medium-term averages'
      biasColor = 'text-down'
      ema20Arrow = '↓'
      ema50Arrow = '↓'
    }
  } else {
    biasLabel = '—'
    biasDesc = 'Insufficient data'
    biasColor = 'text-text-muted'
    ema20Arrow = '—'
    ema50Arrow = '—'
  }

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70 mb-2">
        Directional Bias
      </p>
      <div className="bg-bg rounded-xl border border-border/50 px-3 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className={`text-base font-black leading-none mb-1 ${biasColor}`}>{biasLabel}</p>
          <p className="text-[11px] text-text-muted leading-relaxed">{biasDesc}</p>
        </div>
        <div className="flex-shrink-0 flex flex-col gap-1.5 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <span className="text-[9px] text-text-muted font-medium">20-day avg</span>
            <span className={`text-sm font-black w-4 text-center leading-none ${aboveEma20 ? 'text-up' : 'text-down'}`}>
              {ema20Arrow}
            </span>
          </div>
          <div className="flex items-center justify-end gap-1.5">
            <span className="text-[9px] text-text-muted font-medium">50-day avg</span>
            <span className={`text-sm font-black w-4 text-center leading-none ${aboveEma50 ? 'text-up' : 'text-down'}`}>
              {ema50Arrow}
            </span>
          </div>
          {ema50 != null && (
            <p className="text-[9px] text-text-muted font-mono">
              Avg: {ema50.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── ADR / AWR Cards ────────────────────────────────────────────────────────────
function RangeDashboard({ stats, currency }: { stats: StatisticalMetrics; currency: string }) {
  const adrPts = stats.avg_daily_range_pts
  const adrPct = stats.avg_daily_range_pct
  const awrPts = stats.avg_weekly_range_pts
  const awrPct = stats.avg_weekly_range_pct

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70 mb-2">
        Average Range
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-bg rounded-xl border border-border/50 px-3 py-3">
          <p className="text-[9px] text-text-muted font-medium mb-1">Avg Daily Range (20d)</p>
          <p className="text-xl font-black font-mono text-text-primary leading-none">
            {adrPts != null
              ? adrPts.toLocaleString(undefined, { maximumFractionDigits: 1 })
              : '—'}
            <span className="text-xs font-normal text-text-muted ml-1">{currency}</span>
          </p>
          {adrPct != null && (
            <p className="text-[10px] text-text-muted mt-1">
              {fmt(adrPct)}% · typical daily swing
            </p>
          )}
        </div>
        <div className="bg-bg rounded-xl border border-border/50 px-3 py-3">
          <p className="text-[9px] text-text-muted font-medium mb-1">Avg Weekly Range (12w)</p>
          <p className="text-xl font-black font-mono text-text-primary leading-none">
            {awrPts != null
              ? awrPts.toLocaleString(undefined, { maximumFractionDigits: 1 })
              : '—'}
            <span className="text-xs font-normal text-text-muted ml-1">{currency}</span>
          </p>
          {awrPct != null && (
            <p className="text-[10px] text-text-muted mt-1">
              {fmt(awrPct)}% · typical weekly swing
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Overnight vs Intraday ──────────────────────────────────────────────────────
function OvernightIntradayTable({ data }: { data: MonthlyContribution[] }) {
  if (!data || data.length === 0) return null

  // Determine which component dominates each month (for regime insight)
  const lastMonth = data[data.length - 1]
  const overnightDominates = Math.abs(lastMonth.overnight_pct) > Math.abs(lastMonth.intraday_pct)

  const maxAbs = Math.max(...data.flatMap((d) => [Math.abs(d.overnight_pct), Math.abs(d.intraday_pct)]), 1)

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70">
          Overnight vs Intraday Returns
        </p>
        <p className="text-[9px] text-text-muted">
          {overnightDominates ? 'Gap-driven recently' : 'Intraday-driven recently'}
        </p>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mb-2 text-[9px] text-text-muted">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-accent/70 inline-block" />
          Overnight (gap)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-text-muted/40 inline-block" />
          Intraday
        </span>
      </div>

      <div className="space-y-1.5">
        {data.map((m) => {
          const onBarW = Math.min(100, (Math.abs(m.overnight_pct) / maxAbs) * 100)
          const idBarW = Math.min(100, (Math.abs(m.intraday_pct) / maxAbs) * 100)
          const onColor = m.overnight_pct >= 0 ? 'bg-accent/70' : 'bg-down/60'
          const idColor = m.intraday_pct >= 0 ? 'bg-up/50' : 'bg-down/40'
          const total = m.overnight_pct + m.intraday_pct

          return (
            <div key={`${m.year}-${m.month}`} className="grid grid-cols-[36px_1fr_1fr_44px] gap-2 items-center">
              <span className="text-[10px] text-text-muted font-medium">{m.month}</span>

              {/* Overnight bar */}
              <div className="flex items-center gap-1">
                <div className="flex-1 h-3 bg-border/30 rounded-sm overflow-hidden">
                  <div
                    className={`h-full rounded-sm transition-all duration-500 ${onColor}`}
                    style={{ width: `${onBarW}%` }}
                  />
                </div>
                <span className={`text-[9px] font-mono w-10 text-right ${m.overnight_pct >= 0 ? 'text-accent' : 'text-down'}`}>
                  {pctSign(m.overnight_pct)}
                </span>
              </div>

              {/* Intraday bar */}
              <div className="flex items-center gap-1">
                <div className="flex-1 h-3 bg-border/30 rounded-sm overflow-hidden">
                  <div
                    className={`h-full rounded-sm transition-all duration-500 ${idColor}`}
                    style={{ width: `${idBarW}%` }}
                  />
                </div>
                <span className={`text-[9px] font-mono w-10 text-right ${m.intraday_pct >= 0 ? 'text-up' : 'text-down'}`}>
                  {pctSign(m.intraday_pct)}
                </span>
              </div>

              {/* Month total */}
              <span className={`text-[9px] font-mono text-right font-bold ${total >= 0 ? 'text-up' : 'text-down'}`}>
                {pctSign(total)}
              </span>
            </div>
          )
        })}
      </div>

      <p className="text-[9px] text-text-muted mt-2 leading-relaxed">
        Overnight = open minus previous close. Intraday = close minus open.
        When gaps dominate, playing opening momentum has more edge; when intraday dominates, range strategies apply.
      </p>
    </div>
  )
}

// ── Main Panel ─────────────────────────────────────────────────────────────────
export function MarketMetricsPanel({ stats, tech, currency, lastClose }: MarketMetricsPanelProps) {
  const hasOvernightData = stats.overnight_intraday && stats.overnight_intraday.length > 0

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-text-primary">Weekly Market Metrics</h3>
        <span className="text-[9px] text-text-muted font-medium uppercase tracking-widest">
          Key indicators to track
        </span>
      </div>

      {/* ROC Table */}
      <ROCTable stats={stats} />

      {/* Drawdown + Directional Bias side-by-side on wider screens */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DrawdownMeter stats={stats} />
        <DirectionalBias tech={tech} lastClose={lastClose} />
      </div>

      {/* ADR / AWR */}
      <RangeDashboard stats={stats} currency={currency} />

      {/* Overnight vs Intraday */}
      {hasOvernightData && (
        <>
          <div className="border-t border-border" />
          <OvernightIntradayTable data={stats.overnight_intraday!} />
        </>
      )}
    </div>
  )
}
