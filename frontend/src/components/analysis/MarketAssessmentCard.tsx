import type { AnalysisResult, MultiTimeframeTrend, CPRBar, TimeframeTrend, ValuationMetrics } from '../../types/market'

// ── Helpers ───────────────────────────────────────────────────────────────────

type Bias = 'bullish' | 'bearish' | 'neutral'

function dirToBias(dir: 'up' | 'down' | 'flat'): Bias {
  return dir === 'up' ? 'bullish' : dir === 'down' ? 'bearish' : 'neutral'
}

const TREND_LABELS: Record<TimeframeTrend['trend_label'], string> = {
  strong_uptrend:    'Strong Uptrend',
  uptrend:           'Uptrend',
  weak_uptrend:      'Weak Uptrend',
  flat:              'Sideways',
  weak_downtrend:    'Weak Downtrend',
  downtrend:         'Downtrend',
  strong_downtrend:  'Strong Downtrend',
}

const biasClasses: Record<Bias, { text: string; bg: string; border: string }> = {
  bullish: { text: 'text-up',      bg: 'bg-up/10',      border: 'border-up/30' },
  bearish: { text: 'text-down',    bg: 'bg-down/10',    border: 'border-down/30' },
  neutral: { text: 'text-neutral', bg: 'bg-neutral/10', border: 'border-neutral/30' },
}

function SignalDot({ bias }: { bias: Bias | 'unknown' }) {
  if (bias === 'bullish') return <span className="w-2 h-2 rounded-full bg-up flex-shrink-0 inline-block" />
  if (bias === 'bearish') return <span className="w-2 h-2 rounded-full bg-down flex-shrink-0 inline-block" />
  if (bias === 'neutral') return <span className="w-2 h-2 rounded-full bg-text-muted/40 flex-shrink-0 inline-block" />
  return <span className="w-2 h-2 rounded-full bg-border flex-shrink-0 inline-block" />
}

import type { MacroSnapshot } from '../../types/market'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  analysis: AnalysisResult
  trend: MultiTimeframeTrend
  cpr: (CPRBar | null)[]
  macro?: MacroSnapshot | null
  valuation?: ValuationMetrics | null
  pctAboveSma200?: number | null  // breadth: % of stocks above 200-day SMA
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MarketAssessmentCard({ analysis, trend, cpr, macro, valuation, pctAboveSma200 }: Props) {
  const { technical: tech, regime, overall_sentiment, sentiment_score, currency } = analysis

  // ── Direction: 5-signal vote ──────────────────────────────────────────────
  const emaAboveCount = [
    tech.price_vs_sma20 === 'above',
    tech.price_vs_sma50 === 'above',
    tech.price_vs_sma200 === 'above',
  ].filter(Boolean).length
  const emaSignal: Bias =
    emaAboveCount === 3 ? 'bullish' : emaAboveCount === 0 ? 'bearish' : 'neutral'

  const votes: Bias[] = [
    overall_sentiment,
    dirToBias(trend.daily.direction),
    dirToBias(trend.weekly.direction),
    dirToBias(trend.monthly.direction),
    tech.ema_cross === 'neutral' ? 'neutral' : tech.ema_cross,
  ]
  const bullishVotes = votes.filter((v) => v === 'bullish').length
  const bearishVotes = votes.filter((v) => v === 'bearish').length
  const dominantBias: Bias =
    bullishVotes > bearishVotes ? 'bullish' :
    bearishVotes > bullishVotes ? 'bearish' : 'neutral'
  const agreementCount = Math.max(bullishVotes, bearishVotes)

  // ── Confluence signals ────────────────────────────────────────────────────
  const techSignal: Bias =
    sentiment_score > 0.25 ? 'bullish' : sentiment_score < -0.25 ? 'bearish' : 'neutral'

  const trendAligned =
    trend.daily.direction === trend.monthly.direction &&
    trend.weekly.direction === trend.monthly.direction
  const trendSignal: Bias = trendAligned ? dirToBias(trend.monthly.direction) : 'neutral'

  // ── Macro signal: risk-off if VIX elevated + crude surging + dollar rising ──
  const macroSignal: Bias | 'unknown' = (() => {
    if (!macro) return 'unknown'
    const vix   = macro.tickers.find((t) => t.key === 'india_vix')
    const crude = macro.tickers.find((t) => t.key === 'brent')
    const dxy   = macro.tickers.find((t) => t.key === 'dxy')
    const tnx   = macro.tickers.find((t) => t.key === 'us_10y')
    let bearPoints = 0
    let bullPoints = 0
    if (vix?.value   && vix.value > 20)          bearPoints++
    if (vix?.value   && vix.value < 14)           bullPoints++
    if (crude?.change_1m_pct && crude.change_1m_pct > 8)  bearPoints++
    if (crude?.change_1m_pct && crude.change_1m_pct < -5) bullPoints++
    if (dxy?.direction === 'rising')              bearPoints++
    if (dxy?.direction === 'falling')             bullPoints++
    if (tnx?.value && tnx.value > 4.5)           bearPoints++
    if (tnx?.value && tnx.value < 3.5)           bullPoints++
    if (bearPoints > bullPoints + 1) return 'bearish'
    if (bullPoints > bearPoints)     return 'bullish'
    return 'neutral'
  })()

  // ── Latest CPR for level targets ──────────────────────────────────────────
  const latestCpr = [...cpr].reverse().find((c): c is CPRBar => c !== null) ?? null

  // ── Colours ───────────────────────────────────────────────────────────────
  const bc = biasClasses[dominantBias]
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  const biasLabel =
    dominantBias === 'bullish' ? '↑ Bullish' :
    dominantBias === 'bearish' ? '↓ Bearish' : '→ Mixed'

  // ── Vote rows ─────────────────────────────────────────────────────────────
  const voteRows: [string, Bias][] = [
    ['Technical score',    techSignal],
    ['Daily trend',        dirToBias(trend.daily.direction)],
    ['Weekly trend',       dirToBias(trend.weekly.direction)],
    ['Monthly trend',      dirToBias(trend.monthly.direction)],
    ['Moving averages',    emaSignal],
  ]

  // ── Timeframe rows ────────────────────────────────────────────────────────
  const timeframeRows: [string, string, TimeframeTrend][] = [
    ['Short-term',   '1–5 days',   trend.daily],
    ['Medium-term',  '1–4 weeks',  trend.weekly],
    ['Longer-term',  '1–3 months', trend.monthly],
  ]

  // ── Breadth signal from % above 200-day SMA ──────────────────────────────
  const breadthSignal: Bias | 'unknown' = (() => {
    if (pctAboveSma200 == null) return 'unknown'
    if (pctAboveSma200 >= 60) return 'bullish'
    if (pctAboveSma200 <= 40) return 'bearish'
    return 'neutral'
  })()

  // ── Valuation signal from pe_signal ──────────────────────────────────────
  const valuationSignal: Bias | 'unknown' = (() => {
    if (!valuation) return 'unknown'
    if (valuation.pe_signal === 'cheap') return 'bullish'
    if (valuation.pe_signal === 'expensive') return 'bearish'
    if (valuation.pe_signal === 'stretched') return 'bearish'
    if (valuation.pe_signal === 'fair') return 'neutral'
    return 'unknown'
  })()

  // ── Confluence items ──────────────────────────────────────────────────────
  const confluenceItems: [string, Bias | 'unknown'][] = [
    ['Technical Score',   techSignal],
    ['Trend Alignment',   trendSignal],
    ['Price vs Averages', emaSignal],
    ['Valuation',         valuationSignal],
    ['Macro Context',     macroSignal],
    ['Market Breadth',    breadthSignal],
  ]

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">

      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-border flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-text-primary">Market Assessment</p>
          <p className="text-[11px] text-text-muted mt-0.5">
            Direction · Extent · Timeframe
          </p>
        </div>
        <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${bc.text} ${bc.bg} ${bc.border}`}>
          {biasLabel}
        </span>
      </div>

      {/* 3-column body */}
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">

        {/* ── Column 1: Direction ── */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70">Direction</p>

          <div className="flex items-baseline gap-2">
            <p className={`text-lg font-black leading-none ${bc.text}`}>{biasLabel}</p>
            <p className="text-xs text-text-muted">{agreementCount}/5 signals</p>
          </div>

          <div className="space-y-1.5">
            {voteRows.map(([label, sig]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-[11px] text-text-muted">{label}</span>
                <div className="flex items-center gap-1.5">
                  <SignalDot bias={sig} />
                  <span className={`text-[10px] font-semibold capitalize ${
                    sig === 'bullish' ? 'text-up' :
                    sig === 'bearish' ? 'text-down' : 'text-text-muted'
                  }`}>{sig}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Column 2: Extent ── */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70">Extent</p>

          {latestCpr ? (
            <div className="space-y-3">
              {/* Upside */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-text-muted/70 uppercase tracking-wide">
                  Upside Targets ({currency})
                </p>
                {([['R1', latestCpr.r1], ['R2', latestCpr.r2], ['R3', latestCpr.r3]] as const).map(([lbl, val]) => (
                  <div key={lbl} className="flex items-center justify-between">
                    <span className="text-[11px] text-text-muted">{lbl}</span>
                    <span className="text-xs font-mono font-semibold text-up">{fmt(val)}</span>
                  </div>
                ))}
              </div>

              {/* Downside */}
              <div className="pt-2 border-t border-border space-y-1.5">
                <p className="text-[10px] font-semibold text-text-muted/70 uppercase tracking-wide">
                  Downside Risk ({currency})
                </p>
                {([['S1', latestCpr.s1], ['S2', latestCpr.s2]] as const).map(([lbl, val]) => (
                  <div key={lbl} className="flex items-center justify-between">
                    <span className="text-[11px] text-text-muted">{lbl}</span>
                    <span className="text-xs font-mono font-semibold text-down">{fmt(val)}</span>
                  </div>
                ))}
                {regime?.key_support && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-text-muted">Key support</span>
                    <span className="text-xs font-mono font-semibold text-down">{fmt(regime.key_support)}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-text-muted italic">Pivot data unavailable</p>
          )}
        </div>

        {/* ── Column 3: Timeframe ── */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70">Timeframe</p>

          <div className="space-y-3">
            {timeframeRows.map(([horizon, window, tf]) => {
              const dir = dirToBias(tf.direction)
              return (
                <div key={horizon} className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold text-text-primary">{horizon}</p>
                    <p className="text-[10px] text-text-muted">{window}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-semibold ${
                      dir === 'bullish' ? 'text-up' :
                      dir === 'bearish' ? 'text-down' : 'text-neutral'
                    }`}>
                      {TREND_LABELS[tf.trend_label]}
                    </p>
                    {tf.forecast_change_pct != null && (
                      <p className="text-[10px] text-text-muted font-mono">
                        {tf.forecast_change_pct >= 0 ? '+' : ''}{tf.forecast_change_pct.toFixed(1)}% est.
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Regime context */}
          {regime && (
            <div className="pt-3 border-t border-border space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-text-muted">Market phase</span>
                <span className="text-[11px] font-semibold text-accent capitalize">
                  {regime.phase} · {regime.regime.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-text-muted">Suggested approach</span>
                <span className="text-[11px] font-semibold text-text-primary capitalize">
                  {regime.action_bias.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confluence bar */}
      <div className="px-5 py-3 border-t border-border bg-bg/40">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/60 flex-shrink-0">
            Confluence
          </p>
          {confluenceItems.map(([label, sig]) => (
            <div key={label} className="flex items-center gap-1.5">
              <SignalDot bias={sig} />
              <span className="text-[11px] text-text-muted">{label}</span>
              {sig === 'unknown' && (
                <span className="text-[10px] text-text-muted/40 italic">—</span>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
