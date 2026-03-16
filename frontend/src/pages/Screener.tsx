import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createChart, type IChartApi, type Time, ColorType, LineStyle } from 'lightweight-charts'
import { useScreenerStore } from '../store/useScreenerStore'
import { usePaperTradeStore } from '../store/usePaperTradeStore'
import { api } from '../services/api'
import type { AvailableField, ConditionOp, ScreenerCondition, ScreenerPreset, ScreenerRow } from '../types/screener'

// ── Constants ────────────────────────────────────────────────────────────────

const INDIA_INDICES = [
  { value: 'CNX500',  label: 'Nifty 500' },
  { value: 'NSEBANK', label: 'Bank Nifty' },
]

const US_INDICES = [
  { value: 'SP500',  label: 'S&P 500' },
  { value: 'NDX100', label: 'NASDAQ 100' },
  { value: 'DJI30',  label: 'Dow Jones 30' },
]

const US_INDEX_SET = new Set(US_INDICES.map((i) => i.value))

const OPERATORS: { id: ConditionOp; symbol: string; label: string }[] = [
  { id: 'gt',  symbol: '>',  label: 'greater than' },
  { id: 'lt',  symbol: '<',  label: 'less than' },
  { id: 'gte', symbol: '≥',  label: 'greater than or equal to' },
  { id: 'lte', symbol: '≤',  label: 'less than or equal to' },
  { id: 'eq',  symbol: '=',  label: 'equal to' },
]

// ── Custom preset storage ─────────────────────────────────────────────────────

const CUSTOM_PRESETS_KEY = 'screener_custom_presets'

function loadCustomPresets(): ScreenerPreset[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_PRESETS_KEY) ?? '[]') }
  catch { return [] }
}

function persistCustomPresets(presets: ScreenerPreset[]) {
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets))
}

// ── Strategy education ────────────────────────────────────────────────────────

const PRESET_EDUCATION: Record<string, { what: string; logic: string[]; tips: string[]; winRate?: string; bestRegime?: string }> = {
  swing_pullback: {
    what: 'Pullback in Uptrend finds stocks in a confirmed long-term uptrend that have temporarily dipped — giving you a lower-risk entry point with the broader trend still on your side.',
    logic: [
      'Price above long-term average (200-day): confirms the stock is in an established uptrend',
      'Medium average above long-term average (50 > 200-day): medium-term momentum is also pointing up',
      'Trend direction positive: short-term buying conviction despite the dip',
      'Momentum between 40–58: not too weak (which signals real trouble) and not too strong (meaning the pullback has happened)',
      'Market cap above ₹5,000 Cr: filters for liquid, institutionally-followed companies',
    ],
    tips: [
      'Enter near the 20-day or 50-day moving average for the best entry price',
      'Set your stop below the most recent swing low or below the 50-day average',
      'Exit half the position at 1× your risk, then trail the rest with a 20-day average stop',
    ],
    winRate: '45–55%',
    bestRegime: 'Sustained uptrend with occasional pullbacks',
  },
  intraday_momentum: {
    what: 'Day Trade Momentum identifies stocks surging on the day with strong volume and a confirmed upward direction — ideal for capturing same-day moves.',
    logic: [
      'Momentum between 60–75: strong buying pressure, but not at an extreme where a reversal is likely',
      'Trend direction positive: confirms the short-term direction is up',
      'Relative volume above 1.5×: at least 50% more market participants than on a normal day',
      'Trend strength above 20: the move is a genuine directional trend, not random noise',
    ],
    tips: [
      'This preset auto-selects the 15-minute timeframe — confirm your entry on a shorter chart',
      'Enter on the first pause or small pullback after the opening move, not a chase at highs',
      'Keep stops tight (0.5–1% below entry) and always exit before market close',
    ],
    winRate: '40–50%',
    bestRegime: 'Directional market days with sector leadership',
  },
  swing_uptrend: {
    what: 'Swing Uptrend finds stocks where the shorter-term trend has crossed above the medium-term trend and price is holding above key levels — a classic 1–4 week swing setup.',
    logic: [
      'Short average above medium average (20 > 50-day): recent momentum has turned bullish',
      'Momentum between 55–75: bullish but not dangerously stretched — there is room to run',
      'Trend direction positive: buying conviction is confirmed',
      'Price above 50-day average: the stock is holding above medium-term support',
    ],
    tips: [
      'Wait for a 1–2 day pause before entering to get a better price',
      'Set stop below the 20-day moving average',
      'Target 1.5–2.5× your risk as the initial profit goal',
    ],
    winRate: '40–48%',
    bestRegime: 'Sustained directional markets',
  },
  power_breakout: {
    what: 'Power Breakout targets stocks in a strong uptrend that are accelerating — the combination of moving average alignment, high momentum, and positive trend direction signals a stock building breakout energy.',
    logic: [
      'Short average above medium average (20 > 50-day): confirmed uptrend structure',
      'Momentum above 60: strong buying, not a fading rally',
      'Trend direction positive: buying conviction confirmed across timeframes',
      'Market cap above ₹5,000 Cr: large enough to attract institutional participation on the breakout',
    ],
    tips: [
      'Enter on a breakout above a resistance level or consolidation range — not in the middle of a move',
      'Use a slightly wider stop (1.5–2% below entry) as breakout stocks can be volatile early',
      'Scale out: take partial profits at 2× risk, then trail the remainder',
    ],
    winRate: '40–55%',
    bestRegime: 'Bull markets with sector tailwinds',
  },
  medium_growth: {
    what: 'Medium-Term Growth screens for stocks in structural uptrends suitable for 3–12 month position trades — where you hold through normal pullbacks and let the trend work for you.',
    logic: [
      'Price above long-term average (200-day): the macro trend is up',
      'Momentum between 50–70: trending higher with room still left to move',
      'Trend direction positive: medium-term buying continues',
      'Trend strength above 20: the move is directional, not sideways chop',
    ],
    tips: [
      'Use weekly charts to identify key support levels for stop placement',
      'Size for a 5–8% stop below entry to comfortably ride normal pullbacks',
      'Review every 4 weeks — only exit if the trend structure itself breaks',
    ],
    winRate: '45–55%',
    bestRegime: 'Sustained 3–12 month bull markets',
  },
  long_compounder: {
    what: 'Quality Compounder finds fundamentally strong stocks with sustained long-term outperformance — suitable for multi-year holding as part of a core portfolio.',
    logic: [
      'Price above long-term average (200-day): the uptrend is intact at the macro level',
      'Short average above medium average (20 > 50-day): medium-term momentum also positive',
      'Momentum between 40–65: not at an extreme — the stock is not being chased',
      '1-year return above 15%: demonstrating sustained outperformance vs. the broader market',
    ],
    tips: [
      'Look for strong business fundamentals: growing revenue, low debt, high promoter holding',
      'Build your position gradually on dips to the 20-week or 50-week average',
      'Hold through 15–25% corrections — selling quality compounders too early is the most common long-term investing mistake',
    ],
    winRate: '45–55%',
    bestRegime: 'Any regime — long-term horizon smooths volatility',
  },

  // ── Trend Following — new ──────────────────────────────────────────────────
  trend_golden_cross: {
    what: 'Golden Cross Uptrend identifies stocks where the 50-day average has crossed above the 200-day average — the most widely watched long-term bullish signal used by institutional fund managers.',
    logic: [
      '50-day average above 200-day average: the classic "Golden Cross" signal — medium-term trend stronger than long-term trend',
      'Price above 200-day average: confirms the stock is in a macroscopic uptrend, not just bouncing',
      'Trend strength above 22: the directional move has real conviction, not just sideways drift',
      'Momentum between 50–70: in the bullish zone with room to move, not overbought',
      'Relative volume above 1.2×: institutional money is participating — the move has breadth',
    ],
    tips: [
      'Golden Cross signals are lagging — the best entry is 2–3 weeks after the cross when the stock pulls back to the 50-day average',
      'Verify the cross is not a "fake" by checking that price spent significant time below the 200-day before crossing',
      'Set your stop at the 200-day average — if that breaks, the signal is invalidated',
    ],
    winRate: '40–48%',
    bestRegime: 'Transitioning from bear to bull market; sustained directional trends',
  },
  trend_52w_breakout: {
    what: 'Near 52-Week High finds stocks within 2% of their annual high — these are breakout candidates where institutional buyers have pushed price to new ground, often leading to further gains.',
    logic: [
      'Within 2% of 52-week high: at the frontier of price discovery — a decisive close above creates a new high and can trigger a sustained move',
      'Relative volume above 1.5×: breakouts on low volume often fail; high volume confirms institutional participation',
      'Momentum between 50–68: strong buying pressure but not yet at extreme levels that invite sellers',
      'Trend strength above 18: confirms this is a directional move, not random price action',
    ],
    tips: [
      'Buy the first close above the 52-week high — this is the "3-day rule" confirmation entry',
      'Set a stop 1.5× the Average True Range below the breakout level',
      'Target the width of the prior consolidation range added to the breakout point',
    ],
    winRate: '40–55%',
    bestRegime: 'Bull markets; sector-specific tailwinds',
  },
  trend_momentum_12m: {
    what: '12-Month Momentum screens for stocks that have outperformed over the past year and remain above their long-term average — the academic momentum premium (Jegadeesh & Titman, 1993) with a 6–12% annual alpha historically.',
    logic: [
      '12-month return above 15%: stock has sustainably outperformed the market — positive time-series momentum',
      'Price above long-term average (200-day): the macro trend supports continuation, not a dead-cat bounce',
      'Momentum between 45–72: in the bullish zone — not at an extreme that invites a reversal',
      'Trend strength above 15: the outperformance has directional structure',
      'Relative volume at least average: sufficient institutional liquidity',
    ],
    tips: [
      'Rebalance monthly — momentum is a ranking signal, not a forever hold',
      'Skip the most recent month when ranking (avoids very short-term reversals)',
      'Avoid holding through earnings — post-earnings drift can help or hurt suddenly',
    ],
    winRate: '45–55%',
    bestRegime: 'Post-bear-market recoveries; sustained sector rotation cycles',
  },

  // ── Mean Reversion — new ──────────────────────────────────────────────────
  mr_rsi_oversold: {
    what: 'Oversold Bounce Setup finds stocks that have been sold to extreme levels while the long-term uptrend remains intact — statistically, oversold conditions in uptrends resolve upward within 1–3 weeks.',
    logic: [
      'Momentum (14-day) below 30: deeply oversold — sellers have dominated recent sessions and exhaustion is likely near',
      'Price above long-term average (200-day): the overall uptrend is still intact — this is a pullback, not a trend reversal',
      'Trend strength below 25: low trend strength means there is no strong directional force driving prices lower',
      'Bollinger Band position below 0.2: price is near or below the lower statistical boundary — a rare extreme',
    ],
    tips: [
      'Do not buy immediately — wait for a reversal candle (green close higher than open) before entering',
      'Set stop below the most recent swing low or below the lower Bollinger Band',
      'Target the middle Bollinger Band (20-day average) as the first exit — that is where most oversold bounces end',
    ],
    winRate: '65–80%',
    bestRegime: 'Range-bound or mildly uptrending markets; low ADX environments',
  },
  mr_bb_lower_touch: {
    what: 'Bollinger Band Reversal identifies stocks that have touched the lower statistical boundary (Bollinger Band) in a non-trending environment — prices statistically revert to the 20-day average after these touches.',
    logic: [
      'Price at or below lower Bollinger Band: the stock is trading below 2 standard deviations of recent prices — a statistically rare event',
      'Trend strength below 22: low trend strength is essential — mean reversion fails in strong trends',
      'Momentum (14-day) below 40: confirms oversold but not yet at extreme reversal territory',
      'Relative volume below 1×: low volume during a selloff often signals lack of conviction — sellers are not panicking, price is coiling',
    ],
    tips: [
      'The safest entry is when the next day\'s open is higher than the Bollinger Band touch candle\'s close',
      'Target the middle Bollinger Band (20-day average) — that is the statistical "mean" prices revert to',
      'Exit immediately if price closes below the lower band by more than 1% — the trend may have taken over',
    ],
    winRate: '55–68%',
    bestRegime: 'Range-bound, choppy markets; India VIX below 18',
  },
  mr_consecutive_reversal: {
    what: 'Multi-Day Pullback Reversal finds stocks after 3 or more consecutive down days within a longer uptrend — one of the simplest and most statistically robust mean reversion patterns with a high historical win rate.',
    logic: [
      '3+ consecutive red candles: after 3 straight down days, the probability of an up-day increases significantly as short-term sellers are exhausted',
      'Price above long-term average (200-day): ensures this is a short-term pullback within a broader uptrend, not a structural breakdown',
      'Trend strength below 25: the pullback is happening in a non-trending environment — reversion is more likely than trend continuation',
      'Momentum (14-day) below 45: confirms the stock has genuinely pulled back and offers a reset entry',
    ],
    tips: [
      'Enter on the open the day after the third consecutive red candle — the simplest, most direct entry',
      'Keep your holding period short: 1–3 days maximum; this is not a "hold forever" setup',
      'Avoid stocks with earnings in the next 2 days — overnight gaps can override the statistical pattern',
    ],
    winRate: '60–70%',
    bestRegime: 'Liquid large-cap stocks (Nifty 50 / Nifty Next 50) in moderate-volatility environments',
  },

  // ── Hybrid ─────────────────────────────────────────────────────────────────
  hybrid_breakout_retest: {
    what: 'Breakout Retest Entry combines trend following direction with mean reversion timing — it finds stocks that have already broken out and are now pulling back to test support, giving you a higher win-rate entry than chasing the initial breakout.',
    logic: [
      'Short average above medium average (20 > 50-day): the uptrend structure is intact after the breakout',
      'Price above 50-day average: the stock is holding above key support — the breakout is being defended',
      'Momentum between 45–65: has pulled back from the breakout\'s overbought reading — this is the retest',
      'Trend direction positive: short-term buying conviction remains even during the pullback',
    ],
    tips: [
      'Identify the prior breakout level (horizontal resistance that was breached) — that level should now be acting as support',
      'Enter when price touches that former resistance level with a reversal candle',
      'Stop goes below the retest low — much tighter than the original breakout entry',
    ],
    winRate: '50–62%',
    bestRegime: 'Post-breakout consolidations in bull markets',
  },
}

// ── Trade thesis templates (pre-fills the "Why this trade?" field) ────────────

const PRESET_TRADE_THESIS: Record<string, string> = {
  swing_pullback:          'Pattern: Pullback in Uptrend\nEntry zone: Near 20-day average\nThis trade is invalid if: ',
  swing_uptrend:           'Pattern: Swing Uptrend (20-day crossed above 50-day)\nEntry zone: On pullback to support\nThis trade is invalid if: ',
  power_breakout:          'Pattern: Power Breakout\nEntry zone: Near breakout / consolidation level\nThis trade is invalid if: ',
  trend_golden_cross:      'Pattern: Golden Cross\nEntry zone: Pullback to 50-day average after cross\nThis trade is invalid if: ',
  trend_52w_breakout:      'Pattern: 52-Week High Breakout\nEntry zone: First close above prior 52W high\nThis trade is invalid if: ',
  trend_momentum_12m:      'Pattern: 12-Month Momentum\nEntry zone: On market-wide dip\nThis trade is invalid if: ',
  mr_rsi_oversold:         'Pattern: Oversold Bounce\nEntry zone: After reversal candle (green close)\nThis trade is invalid if: ',
  mr_bb_lower_touch:       'Pattern: Bollinger Band Reversal\nEntry zone: Gap up open after band touch\nThis trade is invalid if: ',
  mr_consecutive_reversal: 'Pattern: Multi-Day Pullback (3+ red days)\nEntry zone: Open on day after 3rd red candle\nThis trade is invalid if: ',
  intraday_momentum:       'Pattern: Day Trade Momentum\nEntry zone: First pause after opening surge\nThis trade is invalid if: ',
  medium_growth:           'Pattern: Medium-Term Growth\nEntry zone: Pullback to 50-day average\nThis trade is invalid if: ',
  long_compounder:         'Pattern: Quality Compounder\nEntry zone: Dip to 20-week average\nThis trade is invalid if: ',
  hybrid_breakout_retest:  'Pattern: Breakout Retest\nEntry zone: Former resistance now acting as support\nThis trade is invalid if: ',
}

// ── Signal label → plain English ──────────────────────────────────────────────

function signalToPlainEnglish(signal: string): string {
  if (/Close Price.*EMA \(200\)/i.test(signal))           return 'Trading above long-term trend (200-day average)'
  if (/EMA \(50\).*EMA \(200\)/i.test(signal))            return 'Medium-term trend above long-term (Golden Cross structure)'
  if (/EMA \(20\).*EMA \(50\)/i.test(signal))             return 'Short-term average above medium-term (20 > 50-day)'
  if (/Close Price.*EMA \(50\)/i.test(signal))            return 'Price above medium-term trend (50-day average)'
  if (/Close Price.*EMA \(20\)/i.test(signal))            return 'Price above short-term average (20-day)'
  if (/RSI.*[<≤].*30/i.test(signal))                      return 'Deeply oversold — sellers may be near exhaustion'
  if (/RSI.*[<≤].*4[05]/i.test(signal))                   return 'Momentum reset — pulled back from overbought'
  if (/RSI.*[>≥].*6[05]/i.test(signal))                   return 'Strong buying momentum confirmed'
  if (/RSI.*[>≥].*50/i.test(signal))                      return 'Momentum in bullish territory'
  if (/Relative Volume.*[>≥]/i.test(signal))              return 'Volume above normal — more participants today'
  if (/ADX.*[>≥]/i.test(signal))                          return 'Trend has conviction and direction'
  if (/ADX.*[<≤]/i.test(signal))                          return 'Low trend strength — pullback / reversion likely'
  if (/\+DI.*[>≥]/i.test(signal))                         return 'Buyers have edge over sellers (directional)'
  if (/BB %B.*[<≤]/i.test(signal))                        return 'Price near lower statistical boundary — rare extreme'
  if (/BB Lower/i.test(signal))                           return 'Touched Bollinger lower band (statistically oversold)'
  if (/Consecutive Down Days/i.test(signal))              return '3+ red days in a row — short-term sellers may be done'
  if (/MACD.*[>≥]/i.test(signal))                        return 'Momentum indicator turning positive'
  if (/1Y Return/i.test(signal))                          return 'Outperforming market over the past year'
  if (/Market Cap.*[>≥]/i.test(signal))                   return 'Large enough for institutional participation'
  if (/Distance from 52W High.*[<≤]/i.test(signal))       return 'Near 52-week high — breakout territory'
  return signal
}

// ── Category metadata ─────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { icon: string; description: string; color: string; winRate: string; philosophy: string }> = {
  'Trend Following': {
    icon: '↗',
    color: 'text-blue-400',
    description: 'Ride directional price moves as long as they last. Low win rate (35–55%) but large winners compensate for the losses.',
    winRate: '35–55%',
    philosophy: '"Cut losses short, let profits run." — Trade in the direction of momentum and hold until a reversal signal confirms. Best in sustained directional markets.',
  },
  'Mean Reversion': {
    icon: '↔',
    color: 'text-amber-400',
    description: 'Extremes don\'t last — prices snap back to their average. High win rate (55–80%) but small per-trade profit.',
    winRate: '55–80%',
    philosophy: '"The rubber band always snaps back." — Buy oversold, sell overbought. Best in range-bound, choppy markets with low trend strength (ADX < 20).',
  },
  'Hybrid': {
    icon: '⊕',
    color: 'text-purple-400',
    description: 'Combine trend following direction with mean reversion timing for higher win rates than pure trend following.',
    winRate: '50–62%',
    philosophy: 'Use trend to know the direction, use mean reversion to time the entry. The result: tighter stops, higher win rates, and larger reward-to-risk.',
  },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function conditionChipLabel(
  cond: ScreenerCondition,
  fieldMap: Record<string, AvailableField>,
): string {
  const lhsLabel = fieldMap[cond.lhs]?.label ?? cond.lhs
  const opSym    = OPERATORS.find((o) => o.id === cond.op)?.symbol ?? cond.op
  if (cond.rhs_field) {
    const rhsLabel = fieldMap[cond.rhs_field]?.label ?? cond.rhs_field
    return `${lhsLabel} ${opSym} ${rhsLabel}`
  }
  if (cond.rhs_value !== null) {
    return `${lhsLabel} ${opSym} ${cond.rhs_value.toLocaleString()}`
  }
  return `${lhsLabel} ${opSym} ?`
}

function fmtVol(v: number | null): string {
  if (v == null) return '—'
  if (v >= 1e7)  return `${(v / 1e7).toFixed(1)}Cr`
  if (v >= 1e5)  return `${(v / 1e5).toFixed(1)}L`
  if (v >= 1e3)  return `${(v / 1e3).toFixed(0)}K`
  return v.toFixed(0)
}

function fmtMcap(v: number | null): string {
  if (v == null) return '—'
  if (v >= 1e5)  return `${(v / 1e5).toFixed(1)}L`
  if (v >= 1e3)  return `${(v / 1e3).toFixed(1)}K`
  return v.toFixed(0)
}

function fmtNum(v: number | null, dec = 2): string {
  if (v == null) return '—'
  return v.toFixed(dec)
}

// ── Add/Edit Condition Modal ─────────────────────────────────────────────────

interface ConditionModalProps {
  fields: AvailableField[]
  fieldMap: Record<string, AvailableField>
  initial?: ScreenerCondition
  onSave: (c: Omit<ScreenerCondition, 'id'>) => void
  onClose: () => void
}

function ConditionModal({ fields, fieldMap, initial, onSave, onClose }: ConditionModalProps) {
  const groups = fields.reduce<Record<string, AvailableField[]>>((acc, f) => {
    ;(acc[f.group] ??= []).push(f)
    return acc
  }, {})

  const [lhs, setLhs]     = useState(initial?.lhs ?? 'rsi')
  const [op, setOp]       = useState<ConditionOp>(initial?.op ?? 'gte')
  const [rhsMode, setRhsMode] = useState<'value' | 'field'>(
    initial?.rhs_field ? 'field' : 'value',
  )
  const [rhsValue, setRhsValue] = useState<string>(
    initial?.rhs_value != null ? String(initial.rhs_value) : '',
  )
  const [rhsField, setRhsField] = useState(initial?.rhs_field ?? '')

  const lhsMeta   = fieldMap[lhs]
  const isPriceLike = lhsMeta?.price_like ?? false
  const priceFields = fields.filter((f) => f.price_like && f.id !== lhs)

  // If lhs changes to non-price-like, force value mode
  useEffect(() => {
    if (!isPriceLike && rhsMode === 'field') setRhsMode('value')
  }, [lhs, isPriceLike, rhsMode])

  const preview = conditionChipLabel(
    {
      id: '',
      lhs,
      op,
      rhs_value: rhsMode === 'value' && rhsValue !== '' ? Number(rhsValue) : null,
      rhs_field: rhsMode === 'field' && rhsField ? rhsField : null,
    },
    fieldMap,
  )

  function handleSave() {
    const cond: Omit<ScreenerCondition, 'id'> = {
      lhs,
      op,
      rhs_value: rhsMode === 'value' && rhsValue !== '' ? Number(rhsValue) : null,
      rhs_field: rhsMode === 'field' && rhsField ? rhsField : null,
    }
    if (cond.rhs_value == null && !cond.rhs_field) return // incomplete
    onSave(cond)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-md p-5 z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-text-primary">
            {initial ? 'Edit Condition' : 'Add Condition'}
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg leading-none">×</button>
        </div>

        {/* Live preview chip */}
        <div className="mb-4 px-3 py-2 rounded-lg bg-accent/10 border border-accent/30">
          <p className="text-xs text-text-muted mb-0.5">Preview</p>
          <p className="text-sm font-semibold text-accent">{preview}</p>
        </div>

        {/* Row: LHS | OP | RHS */}
        <div className="flex items-start gap-2 mb-4">
          {/* Left side */}
          <div className="flex-1">
            <label className="block text-xs text-text-muted mb-1">Indicator</label>
            <select
              value={lhs}
              onChange={(e) => setLhs(e.target.value)}
              className="w-full text-sm bg-bg border border-border rounded-lg px-2 py-2 text-text-primary focus:outline-none focus:border-accent"
            >
              {Object.entries(groups).map(([group, gFields]) => (
                <optgroup key={group} label={group}>
                  {gFields.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Operator */}
          <div className="w-20 shrink-0">
            <label className="block text-xs text-text-muted mb-1">Operator</label>
            <select
              value={op}
              onChange={(e) => setOp(e.target.value as ConditionOp)}
              className="w-full text-sm bg-bg border border-border rounded-lg px-2 py-2 text-text-primary focus:outline-none focus:border-accent"
            >
              {OPERATORS.map((o) => (
                <option key={o.id} value={o.id}>{o.symbol}</option>
              ))}
            </select>
          </div>

          {/* Right side */}
          <div className="flex-1">
            <label className="block text-xs text-text-muted mb-1">Compare to</label>
            {isPriceLike && (
              <div className="flex gap-1 mb-1.5">
                {(['value', 'field'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setRhsMode(m)}
                    className={`flex-1 text-xs py-0.5 rounded border transition-colors ${
                      rhsMode === m
                        ? 'bg-accent text-white border-accent'
                        : 'border-border text-text-muted hover:border-accent/50'
                    }`}
                  >
                    {m === 'value' ? 'Value' : 'Indicator'}
                  </button>
                ))}
              </div>
            )}
            {rhsMode === 'value' ? (
              <input
                type="number"
                value={rhsValue}
                onChange={(e) => setRhsValue(e.target.value)}
                placeholder="Enter value"
                className="w-full text-sm bg-bg border border-border rounded-lg px-2 py-2 text-text-primary focus:outline-none focus:border-accent"
              />
            ) : (
              <select
                value={rhsField}
                onChange={(e) => setRhsField(e.target.value)}
                className="w-full text-sm bg-bg border border-border rounded-lg px-2 py-2 text-text-primary focus:outline-none focus:border-accent"
              >
                <option value="">Select indicator</option>
                {priceFields.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary border border-border rounded-lg hover:border-accent/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-semibold bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
          >
            {initial ? 'Save' : 'Add Condition'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Save Preset Modal ─────────────────────────────────────────────────────────

interface SavePresetModalProps {
  conditions: ScreenerCondition[]
  fieldMap: Record<string, AvailableField>
  existingCustom: ScreenerPreset[]
  initialOverwriteId?: string
  onSave: (preset: ScreenerPreset) => void
  onClose: () => void
}

function SavePresetModal({ conditions, fieldMap, existingCustom, initialOverwriteId, onSave, onClose }: SavePresetModalProps) {
  const initPreset = existingCustom.find((p) => p.id === initialOverwriteId)
  const [name, setName]             = useState(initPreset?.name ?? '')
  const [timeframe, setTimeframe]   = useState<ScreenerPreset['timeframe']>(initPreset?.timeframe ?? 'swing')
  const [description, setDescription] = useState(initPreset?.description ?? '')
  const [overwriteId, setOverwriteId] = useState(initialOverwriteId ?? '')

  const targetPreset = existingCustom.find((p) => p.id === overwriteId)

  function handleOverwriteChange(id: string) {
    setOverwriteId(id)
    const p = existingCustom.find((p) => p.id === id)
    if (p) { setName(p.name); setTimeframe(p.timeframe); setDescription(p.description ?? '') }
    else { setName(''); setTimeframe('swing'); setDescription('') }
  }

  function handleSave() {
    const resolvedName = name.trim() || targetPreset?.name || ''
    if (!resolvedName && !overwriteId) return
    const chips = conditions.map((c) => conditionChipLabel(c, fieldMap))
    const preset: ScreenerPreset = overwriteId && targetPreset
      ? { ...targetPreset, name: resolvedName || targetPreset.name, conditions, filter_chips: chips, timeframe, description: description || targetPreset.description }
      : { id: `custom_${Date.now()}`, name: resolvedName, timeframe, description, conditions, filter_chips: chips }
    onSave(preset)
  }

  const canSave = !!(name.trim() || overwriteId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-sm p-5 z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-text-primary">{overwriteId ? 'Update Preset' : 'Save as Preset'}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg leading-none">×</button>
        </div>

        {existingCustom.length > 0 && (
          <div className="mb-3">
            <label className="block text-xs text-text-muted mb-1">Save to</label>
            <select
              value={overwriteId}
              onChange={(e) => handleOverwriteChange(e.target.value)}
              className="w-full text-sm bg-bg border border-border rounded-lg px-2 py-2 text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="">Create new preset</option>
              {existingCustom.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}

        <div className="mb-3">
          <label className="block text-xs text-text-muted mb-1">
            Name {overwriteId && <span className="font-normal opacity-60">(leave blank to keep existing)</span>}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={targetPreset?.name ?? 'My Strategy'}
            autoFocus
            className="w-full text-sm bg-bg border border-border rounded-lg px-2 py-2 text-text-primary focus:outline-none focus:border-accent"
          />
        </div>

        <div className="mb-3">
          <label className="block text-xs text-text-muted mb-1">Timeframe</label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as ScreenerPreset['timeframe'])}
            className="w-full text-sm bg-bg border border-border rounded-lg px-2 py-2 text-text-primary focus:outline-none focus:border-accent"
          >
            <option value="intraday">Intraday</option>
            <option value="swing">Swing (1–4 weeks)</option>
            <option value="medium">Medium (3–12 months)</option>
            <option value="long">Long-term</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-xs text-text-muted mb-1">
            Description <span className="font-normal opacity-60">(optional)</span>
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={targetPreset?.description ?? 'Describe your strategy…'}
            className="w-full text-sm bg-bg border border-border rounded-lg px-2 py-2 text-text-primary focus:outline-none focus:border-accent"
          />
        </div>

        <p className="text-xs text-text-muted mb-4">
          {conditions.length} condition{conditions.length !== 1 ? 's' : ''} will be saved.
        </p>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary border border-border rounded-lg hover:border-accent/50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={!canSave}
            className="px-4 py-2 text-sm font-semibold bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {overwriteId ? 'Update Preset' : 'Save Preset'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Condition chip ────────────────────────────────────────────────────────────

function ConditionChip({
  cond,
  fieldMap,
  onEdit,
  onRemove,
}: {
  cond: ScreenerCondition
  fieldMap: Record<string, AvailableField>
  onEdit: () => void
  onRemove: () => void
}) {
  const label = conditionChipLabel(cond, fieldMap)
  return (
    <div className="inline-flex items-center gap-0 border border-accent/50 bg-accent/8 rounded-full overflow-hidden shrink-0">
      <button
        onClick={onEdit}
        className="text-xs font-medium text-accent px-2.5 py-1 hover:bg-accent/15 transition-colors"
        title="Click to edit"
      >
        {label}
      </button>
      <button
        onClick={onRemove}
        className="pr-2 pl-0.5 py-1 text-accent/60 hover:text-accent hover:bg-accent/15 transition-colors text-sm leading-none"
        title="Remove"
      >
        ×
      </button>
    </div>
  )
}

// ── Confidence ────────────────────────────────────────────────────────────────

function computeConfidence(
  row: ScreenerRow,
  isChasing: boolean,
): { score: number; level: 'HIGH' | 'MEDIUM' | 'LOW'; reasons: string[] } {
  let s = 0
  const reasons: string[] = []

  // Base: screener match ratio (0–40 pts)
  if (row.total_conditions > 0) s += (row.score / row.total_conditions) * 40

  // Quality grade (0–15)
  if (row.quality === 'A') { s += 15; reasons.push('Strong setup quality — grade A') }
  else if (row.quality === 'B') s += 8
  else s += 2

  // EMA alignment (0–20)
  if (row.price != null && row.ema20 != null && row.ema50 != null) {
    if (row.price > row.ema20 && row.ema20 > row.ema50) {
      s += 20; reasons.push('Price above both moving averages — uptrend intact')
    } else if (row.price > row.ema50) {
      s += 10; reasons.push('Above long-term moving average')
    } else {
      s -= 5
    }
  }

  // RSI (0–15)
  if (row.rsi != null) {
    if (row.rsi >= 50 && row.rsi <= 65)      { s += 15; reasons.push('Momentum in healthy zone — not overbought') }
    else if (row.rsi >= 40 && row.rsi < 50)  s += 8
    else if (row.rsi > 65 && row.rsi <= 70)  s += 5
    else if (row.rsi > 70)                   { s -= 8; reasons.push('Overbought — risk of short-term pullback') }
    else if (row.rsi < 40)                   s -= 5
  }

  // ADX trend strength (0–10)
  if (row.adx != null) {
    if (row.adx >= 30)      { s += 10; reasons.push('Strong directional trend') }
    else if (row.adx >= 20) s += 5
  }

  // Chase penalty
  if (isChasing) { s -= 12; reasons.push('Chasing a large move today — elevated entry risk') }

  s = Math.max(10, Math.min(95, Math.round(s)))
  const level = s >= 72 ? 'HIGH' : s >= 52 ? 'MEDIUM' : 'LOW'
  return { score: s, level, reasons }
}

// ── Trade Chart Panel ─────────────────────────────────────────────────────────

function TradeChartPanel({
  row, entryN, stopN, targetN, isChasing,
}: {
  row: ScreenerRow; entryN: number; stopN: number; targetN: number; isChasing: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartApiRef  = useRef<IChartApi | null>(null)
  const [loading, setLoading]       = useState(true)
  const [fetchError, setFetchError] = useState('')

  const { score, level, reasons } = computeConfidence(row, isChasing)

  const levelCls =
    level === 'HIGH'   ? 'text-green-400 bg-green-500/10 border-green-500/30' :
    level === 'MEDIUM' ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' :
                         'text-red-400 bg-red-500/10 border-red-500/30'
  const barCls =
    level === 'HIGH'   ? 'bg-green-500' :
    level === 'MEDIUM' ? 'bg-yellow-400' : 'bg-red-400'

  // Build & tear down chart when symbol / levels change
  useEffect(() => {
    if (!containerRef.current) return
    setLoading(true)
    setFetchError('')

    let cancelled = false

    Promise.all([
      api.getStockHistory(row.symbol, '1d'),
      api.getTradeProjection(row.symbol, entryN, stopN, targetN).catch(() => null),
    ]).then(([data, proj]) => {
      if (cancelled || !containerRef.current) return
      setLoading(false)

      const container = containerRef.current
      const bars = data.bars.slice(-60)
      const lastBar   = bars[bars.length - 1]
      const lastBarTs = (lastBar.timestamp / 1000) as Time

      const chart = createChart(container, {
        width:  container.offsetWidth  || 360,
        height: container.offsetHeight || 260,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: 'rgba(148,163,184,0.65)',
          fontSize: 10,
        },
        grid: {
          vertLines: { color: 'rgba(148,163,184,0.05)' },
          horzLines: { color: 'rgba(148,163,184,0.07)' },
        },
        rightPriceScale: {
          borderColor: 'rgba(148,163,184,0.1)',
          scaleMargins: { top: 0.06, bottom: 0.12 },
        },
        timeScale: { borderColor: 'rgba(148,163,184,0.1)', timeVisible: false },
        crosshair: { mode: 1 },
        handleScroll: false,
        handleScale:  false,
      })
      chartApiRef.current = chart

      // ── Candlesticks ──────────────────────────────────────────────────
      const candle = chart.addCandlestickSeries({
        upColor: '#22c55e', downColor: '#ef4444',
        borderUpColor: '#22c55e', borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',   wickDownColor: '#ef4444',
      })
      candle.setData(bars.map(b => ({
        time: (b.timestamp / 1000) as Time,
        open: b.open, high: b.high, low: b.low, close: b.close,
      })))

      // ── SMA20 ─────────────────────────────────────────────────────────
      const sma20s = chart.addLineSeries({
        color: 'rgba(99,179,237,0.65)', lineWidth: 1,
        priceLineVisible: false, lastValueVisible: false,
      })
      const sma20Arr = data.sma20.slice(-60)
      sma20s.setData(
        bars.map((b, i) => ({ time: (b.timestamp / 1000) as Time, value: sma20Arr[i] }))
          .filter((d): d is { time: Time; value: number } => d.value != null)
      )

      // ── SMA50 ─────────────────────────────────────────────────────────
      const sma50s = chart.addLineSeries({
        color: 'rgba(251,146,60,0.65)', lineWidth: 1,
        priceLineVisible: false, lastValueVisible: false,
      })
      const sma50Arr = data.sma50.slice(-60)
      sma50s.setData(
        bars.map((b, i) => ({ time: (b.timestamp / 1000) as Time, value: sma50Arr[i] }))
          .filter((d): d is { time: Time; value: number } => d.value != null)
      )

      // ── Entry / Stop / Target price lines ─────────────────────────────
      candle.createPriceLine({ price: entryN,  color: '#818cf8', lineWidth: 1, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: 'Entry'  })
      candle.createPriceLine({ price: stopN,   color: '#ef4444', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Stop'   })
      candle.createPriceLine({ price: targetN, color: '#22c55e', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Target' })

      // ── GBM projection cone ───────────────────────────────────────────
      // Snap the cone's anchor to the last historical bar for visual continuity
      if (proj && proj.projection.length > 1) {
        const snapProj = proj.projection.map((p, i) => ({
          ...p, time: i === 0 ? lastBarTs : (p.time as Time),
        }))
        const midLine = chart.addLineSeries({ color: 'rgba(129,140,248,0.75)', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false })
        midLine.setData(snapProj.map(p => ({ time: p.time as Time, value: p.mid })))
        const upperLine = chart.addLineSeries({ color: 'rgba(34,197,94,0.40)', lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false })
        upperLine.setData(snapProj.map(p => ({ time: p.time as Time, value: p.upper })))
        const lowerLine = chart.addLineSeries({ color: 'rgba(239,68,68,0.40)', lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false })
        lowerLine.setData(snapProj.map(p => ({ time: p.time as Time, value: p.lower })))
      } else {
        // Fallback: ATR-based linear cone if backend projection unavailable
        const atr      = row.atr ?? (row.price * 0.015)
        const lastClose = lastBar.close
        const DAY_MS   = 86_400_000
        const DAYS     = 15
        const projMid:   { time: Time; value: number }[] = [{ time: lastBarTs, value: lastClose }]
        const projUpper: { time: Time; value: number }[] = [{ time: lastBarTs, value: lastClose }]
        const projLower: { time: Time; value: number }[] = [{ time: lastBarTs, value: lastClose }]
        for (let d = 1; d <= DAYS; d++) {
          const t    = ((lastBar.timestamp + d * DAY_MS) / 1000) as Time
          const pct  = d / DAYS
          const mid  = lastClose + pct * (targetN - lastClose)
          const band = atr * Math.sqrt(d) * 0.55
          projMid.push({ time: t, value: mid })
          projUpper.push({ time: t, value: Math.min(mid + band, targetN * 1.06) })
          projLower.push({ time: t, value: Math.max(mid - band, stopN * 0.96) })
        }
        const midLine = chart.addLineSeries({ color: 'rgba(129,140,248,0.75)', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false })
        midLine.setData(projMid)
        const upperLine = chart.addLineSeries({ color: 'rgba(34,197,94,0.45)', lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false })
        upperLine.setData(projUpper)
        const lowerLine = chart.addLineSeries({ color: 'rgba(239,68,68,0.45)', lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false })
        lowerLine.setData(projLower)
      }

      chart.timeScale().fitContent()

    }).catch(() => {
      if (!cancelled) { setFetchError('Could not load chart data'); setLoading(false) }
    })

    return () => {
      cancelled = true
      chartApiRef.current?.remove()
      chartApiRef.current = null
    }
  }, [row.symbol, row.atr, row.price, entryN, stopN, targetN])

  // Resize observer
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(() => {
      if (chartApiRef.current) {
        chartApiRef.current.applyOptions({ width: el.offsetWidth, height: el.offsetHeight })
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div className="flex flex-col h-full px-4 py-4 gap-3 border-l border-border/50">

      {/* Confidence badge + score bar */}
      <div className="shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Setup confidence</p>
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${levelCls}`}>{level}</span>
        </div>
        <div className="h-1.5 bg-bg rounded-full overflow-hidden border border-border/40 mb-2">
          <div className={`h-full rounded-full transition-all duration-700 ${barCls}`} style={{ width: `${score}%` }} />
        </div>
        <div className="space-y-1">
          {reasons.slice(0, 3).map((r, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-green-400 text-[10px] shrink-0 mt-px">✓</span>
              <span className="text-[10px] text-text-secondary leading-relaxed">{r}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Chart container */}
      <div className="flex-1 min-h-0 rounded-xl border border-border/40 overflow-hidden bg-bg relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <svg className="w-5 h-5 animate-spin text-accent/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
        )}
        {fetchError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-text-muted">{fetchError}</p>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* Legend */}
      <div className="shrink-0 flex flex-wrap gap-x-3 gap-y-1">
        {[
          { color: 'bg-[#818cf8]',       label: 'Entry' },
          { color: 'bg-red-500',          label: 'Stop' },
          { color: 'bg-green-500',        label: 'Target' },
          { color: 'bg-[#63b3ed]',        label: '20-day avg' },
          { color: 'bg-orange-400',       label: '50-day avg' },
          { color: 'bg-[#818cf8]/50',     label: 'Projection path' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <div className={`w-2.5 h-0.5 rounded-full ${color}`} />
            <span className="text-[9px] text-text-muted/60">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Add Paper Trade Modal ────────────────────────────────────────────────────

interface AddTradeModalProps {
  row: ScreenerRow
  virtualCapital: number
  presetId?: string
  onClose: () => void
  onSaved: () => void
}

function AddTradeModal({ row, virtualCapital, presetId, onClose, onSaved }: AddTradeModalProps) {
  const atr = row.atr ?? (row.price * 0.015)
  const defaultStop   = parseFloat((row.price - 1.5 * atr).toFixed(2))
  const defaultTarget = parseFloat((row.price + 2.5 * (row.price - defaultStop)).toFixed(2))

  // Default capital = 1% rule auto-calc at the initial price/stop
  const initStopDist  = row.price - defaultStop
  const initShares1pct = initStopDist > 0 ? Math.max(1, Math.floor((virtualCapital * 0.01) / initStopDist)) : 1
  const initCapital    = Math.round(initShares1pct * row.price)

  const [entry,        setEntry]        = useState(row.price.toFixed(2))
  const [stop,         setStop]         = useState(defaultStop.toFixed(2))
  const [target,       setTarget]       = useState(defaultTarget.toFixed(2))
  const [tradeCapital, setTradeCapital] = useState(String(initCapital))
  const [notes,        setNotes]        = useState(presetId ? (PRESET_TRADE_THESIS[presetId] ?? '') : '')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const [monitorsOpen, setMonitorsOpen] = useState(false)
  const [planOpen,     setPlanOpen]     = useState(false)

  const { createTrade, trades } = usePaperTradeStore()

  // ── Chase check: if stock already up >2.5% today, warn about chasing ──────
  const todayChangePct = row.change_pct ?? 0
  const isChasing = todayChangePct > 2.5

  // ── Portfolio impact ──────────────────────────────────────────────────────
  const openTrades = trades.filter(t => t.trade.status === 'OPEN')
  const deployedCapital = openTrades.reduce((sum, t) => sum + t.trade.shares * t.trade.entry_price, 0)
  const deployedPct = virtualCapital > 0 ? (deployedCapital / virtualCapital) * 100 : 0
  // Sector concentration: count open trades in same sector
  const sameSectorCount = openTrades.filter(t => t.trade.sector && t.trade.sector === row.sector).length

  const entryN         = parseFloat(entry)         || 0
  const stopN          = parseFloat(stop)           || 0
  const targetN        = parseFloat(target)         || 0
  const tradeCapitalN  = parseFloat(tradeCapital)   || 0

  const stopDist     = entryN - stopN
  const targetDist   = targetN - entryN
  const totalRange   = targetN - stopN
  const rr           = stopDist > 0 ? targetDist / stopDist : 0

  // Fractional shares: invest exact capital (matches how Kite / Smallcase allocate by amount)
  const shares       = entryN > 0 && tradeCapitalN > 0 ? tradeCapitalN / entryN : 0
  const capNeeded    = tradeCapitalN   // exact rupee amount invested
  const maxLoss      = shares * stopDist    // = capital × (stopDist / entry)
  const maxGain      = shares * targetDist  // = capital × (targetDist / entry)
  const capPct       = virtualCapital > 0 ? (capNeeded / virtualCapital) * 100 : 0
  const halfShares   = shares / 2
  const remainShares = shares / 2
  // Helper: format shares — show decimals only when fractional
  const fmtShares = (n: number) => Number.isInteger(Math.round(n * 100) / 100) ? n.toFixed(0) : n.toFixed(2)
  const partialPrice = entryN + targetDist * 0.5
  const halfGain     = halfShares * (partialPrice - entryN)
  const remainGain   = remainShares * targetDist

  // bar proportions
  const entryBarPct   = totalRange > 0 ? ((entryN - stopN) / totalRange) * 100 : 33
  const partialBarPct = totalRange > 0 ? ((partialPrice - stopN) / totalRange) * 100 : 66

  const rrColor = rr >= 2 ? 'text-green-400' : rr >= 1.5 ? 'text-yellow-400' : 'text-red-400'
  const qualityDot =
    row.quality === 'A' ? 'bg-green-400'
    : row.quality === 'B' ? 'bg-yellow-400'
    : 'bg-text-muted/40'

  async function handleSave() {
    if (stopN >= entryN)  { setError('Stop must be below entry price'); return }
    if (targetN <= entryN) { setError('Target must be above entry price'); return }
    if (rr < 1.5)         { setError('Risk:Reward too low — minimum 1.5:1 recommended'); return }
    setSaving(true); setError('')
    try {
      await createTrade({
        symbol: row.symbol, company_name: row.name, sector: row.sector,
        strategy: 'pullback', entry_price: entryN, stop_price: stopN,
        target_price: targetN, atr: row.atr ?? atr,
        notes: notes || undefined, virtual_capital: virtualCapital, capital_deployed: tradeCapitalN,
      })
      onSaved()
    } catch {
      setError('Failed to save. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-[1100px] z-10 flex flex-col" style={{ maxHeight: 'min(96vh, 760px)' }}>

        {/* ── Header ── */}
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-border/50 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-base font-black text-text-primary tracking-tight shrink-0">
                {row.symbol.replace('.NS', '')}
              </span>
              <span className={`w-2 h-2 rounded-full shrink-0 ${qualityDot}`} title={`Grade ${row.quality}`} />
              <span className="text-sm text-text-muted truncate">{row.name}</span>
              {row.sector && <span className="text-[11px] text-text-muted/50 shrink-0 hidden sm:inline">· {row.sector}</span>}
              {row.matched && row.matched.length > 0 && (
                <span className="text-[11px] text-accent font-medium shrink-0">
                  · {row.matched.length} signal{row.matched.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-bg text-text-muted hover:text-text-primary transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* ── Two-column body ── */}
        <div className="flex flex-col md:flex-row flex-1 overflow-auto md:overflow-hidden">

          {/* ── Left column: levels + sizing ── */}
          <div className="flex flex-col gap-4 p-4 sm:p-5 w-full md:w-[30%] shrink-0 border-b md:border-b-0 md:border-r border-border/50">

            {/* Price inputs */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-red-400/70 uppercase tracking-wide mb-1">Stop</label>
                <input type="number" value={stop} step="0.5" onChange={e => setStop(e.target.value)}
                  className="w-full text-sm font-mono font-bold bg-red-500/5 border border-red-500/20 rounded-lg px-2 py-2 text-red-400 focus:outline-none focus:border-red-400/50" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-text-muted/70 uppercase tracking-wide mb-1">Entry</label>
                <input type="number" value={entry} step="0.5" onChange={e => setEntry(e.target.value)}
                  className="w-full text-sm font-mono font-bold bg-bg border border-border rounded-lg px-2 py-2 text-text-primary focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-green-400/70 uppercase tracking-wide mb-1">Target</label>
                <input type="number" value={target} step="0.5" onChange={e => setTarget(e.target.value)}
                  className="w-full text-sm font-mono font-bold bg-green-500/5 border border-green-500/20 rounded-lg px-2 py-2 text-green-400 focus:outline-none focus:border-green-400/50" />
              </div>
            </div>

            {/* Visual price bar */}
            <div>
              <div className="flex h-2 rounded-full overflow-hidden">
                <div className="bg-red-400/40 rounded-l-full" style={{ width: `${entryBarPct}%` }} />
                <div className="bg-yellow-400/35" style={{ width: `${partialBarPct - entryBarPct}%` }} />
                <div className="bg-green-400/45 rounded-r-full flex-1" />
              </div>
              <div className="relative h-1.5 -mt-1.5 pointer-events-none">
                <div className="absolute w-2 h-2 rounded-full bg-red-400 border-2 border-surface -translate-x-1/2 top-0" style={{ left: `${entryBarPct}%` }} />
                <div className="absolute w-1.5 h-1.5 rounded-full bg-yellow-400/70 border-2 border-surface -translate-x-1/2 top-0.5" style={{ left: `${partialBarPct}%` }} />
              </div>
              <div className="relative mt-2.5 h-8">
                <div className="absolute left-0">
                  <div className="text-[9px] font-bold text-red-400">STOP</div>
                  <div className="text-[10px] text-text-muted font-mono">₹{stopN.toFixed(0)}</div>
                </div>
                <div className="absolute -translate-x-1/2 text-center" style={{ left: `${entryBarPct}%` }}>
                  <div className="text-[9px] font-bold text-text-secondary">ENTRY</div>
                  <div className="text-[10px] text-text-muted font-mono">₹{entryN.toFixed(0)}</div>
                </div>
                <div className="absolute -translate-x-1/2 text-center" style={{ left: `${Math.min(partialBarPct, 85)}%` }}>
                  <div className="text-[9px] font-bold text-yellow-400">½ EXIT</div>
                  <div className="text-[10px] text-text-muted font-mono">₹{partialPrice.toFixed(0)}</div>
                </div>
                <div className="absolute right-0 text-right">
                  <div className="text-[9px] font-bold text-green-400">TARGET</div>
                  <div className="text-[10px] text-text-muted font-mono">₹{targetN.toFixed(0)}</div>
                </div>
              </div>
            </div>

            {/* Chase check warning */}
            {isChasing && (
              <div className="flex items-start gap-2 rounded-xl bg-yellow-500/8 border border-yellow-500/25 px-3 py-2.5">
                <span className="text-sm shrink-0">⚠️</span>
                <div>
                  <p className="text-[11px] font-semibold text-yellow-400">Possible chase — up {todayChangePct.toFixed(1)}% today</p>
                  <p className="text-[10px] text-text-muted mt-0.5">Entering after a big day-move increases risk. Consider waiting for a 1–2 day pullback before entering.</p>
                </div>
              </div>
            )}

            {/* Capital input */}
            <div>
              <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">Capital for this trade</label>
              <div className="flex items-center gap-1.5 bg-bg border border-border rounded-lg px-3 py-2 focus-within:border-accent transition-colors">
                <span className="text-sm font-semibold text-text-muted shrink-0">₹</span>
                <input
                  type="number"
                  value={tradeCapital}
                  onChange={e => setTradeCapital(e.target.value)}
                  className="flex-1 text-sm font-mono font-bold bg-transparent outline-none text-text-primary min-w-0"
                  step="1000"
                  min="1"
                />
              </div>
              <p className="text-[10px] text-text-muted/60 mt-1">{fmtShares(shares)} shares at ₹{entryN.toFixed(2)} each</p>
            </div>

            {/* Risk vs Reward */}
            <div className="rounded-xl bg-bg border border-border/60 overflow-hidden mt-auto">
              <div className="flex">
                <div className="flex-1 px-3 py-2.5 border-r border-border/50">
                  <p className="text-[10px] text-text-muted uppercase tracking-wide font-semibold">At risk</p>
                  <p className="text-lg font-black text-red-400 mt-0.5 leading-none">
                    ₹{maxLoss.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-[10px] text-text-muted/60 mt-1">{capPct.toFixed(0)}% of portfolio</p>
                </div>
                <div className="flex flex-col items-center justify-center px-2.5 gap-0.5">
                  <span className={`text-base font-black leading-none ${rrColor}`}>{rr.toFixed(1)}×</span>
                  <span className="text-[9px] text-text-muted uppercase">ratio</span>
                </div>
                <div className="flex-1 px-3 py-2.5 border-l border-border/50 text-right">
                  <p className="text-[10px] text-text-muted uppercase tracking-wide font-semibold">Potential</p>
                  <p className="text-lg font-black text-green-400 mt-0.5 leading-none">
                    ₹{maxGain.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-[10px] text-text-muted/60 mt-1">{fmtShares(shares)} shares</p>
                </div>
              </div>
            </div>

          </div>

          {/* ── Chart column ── */}
          <div className="flex-1 min-w-0 min-h-[260px] md:min-h-0">
            <TradeChartPanel
              row={row}
              entryN={entryN}
              stopN={stopN}
              targetN={targetN}
              isChasing={isChasing}
            />
          </div>

          {/* ── Plan column (collapsible, hidden on mobile) ── */}
          <div className={`hidden md:block shrink-0 overflow-hidden transition-[width] duration-200 border-l border-border/50 ${planOpen ? 'w-[28%]' : 'w-0'}`}>
          <div className="flex flex-col gap-3 p-5 w-[28vw] max-w-[320px] h-full overflow-y-auto">

            {/* ── Signal breakdown ── */}
            {row.matched.length > 0 && (
              <div className="shrink-0">
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2">Why the screener flagged this stock</p>
                <div className="space-y-1.5">
                  {row.matched.map((signal, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-green-400 text-[11px] mt-px shrink-0">✓</span>
                      <span className="text-[11px] text-text-secondary leading-relaxed">{signalToPlainEnglish(signal)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Scenarios */}
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest shrink-0">Play out the scenarios</p>

            <div className="flex items-stretch rounded-xl overflow-hidden border border-red-500/20 shrink-0">
              <div className="w-1 bg-red-400 shrink-0" />
              <div className="flex-1 bg-red-500/5 px-3 py-2.5">
                <p className="text-xs font-bold text-red-400">If wrong</p>
                <p className="text-[11px] text-text-muted mt-1 leading-relaxed">
                  Stop hits ₹{stopN.toFixed(2)} — exit all {fmtShares(shares)} shares.
                  Lose <span className="text-red-400 font-semibold">₹{maxLoss.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>. Defined, done.
                </p>
              </div>
            </div>

            <div className="flex items-stretch rounded-xl overflow-hidden border border-yellow-500/20 shrink-0">
              <div className="w-1 bg-yellow-400 shrink-0" />
              <div className="flex-1 bg-yellow-500/5 px-3 py-2.5">
                <p className="text-xs font-bold text-yellow-400">Halfway — harvest early</p>
                <p className="text-[11px] text-text-muted mt-1 leading-relaxed">
                  At ₹{partialPrice.toFixed(2)}, sell {fmtShares(halfShares)} shares → lock{' '}
                  <span className="text-yellow-400 font-semibold">+₹{halfGain.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>.
                  Move stop to entry. Remaining {fmtShares(remainShares)} shares are <strong className="text-text-secondary">risk-free</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-stretch rounded-xl overflow-hidden border border-green-500/20 shrink-0">
              <div className="w-1 bg-green-400 shrink-0" />
              <div className="flex-1 bg-green-500/5 px-3 py-2.5">
                <p className="text-xs font-bold text-green-400">Full target hit</p>
                <p className="text-[11px] text-text-muted mt-1 leading-relaxed">
                  Exit {fmtShares(remainShares)} shares at ₹{targetN.toFixed(2)}.
                  Total: <span className="text-green-400 font-semibold">+₹{(halfGain + remainGain).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  {' '}— <strong className="text-text-secondary">{rr.toFixed(1)}×</strong> your risk.
                </p>
              </div>
            </div>

            {/* ── Portfolio impact ── */}
            <div className="rounded-xl bg-bg border border-border/50 px-3 py-2.5 shrink-0">
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-1.5">Your portfolio after this trade</p>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[11px] text-text-secondary">
                  <span className="font-semibold text-text-primary">{openTrades.length + 1}</span> open positions
                </span>
                <span className="text-text-muted/30 text-xs">·</span>
                <span className="text-[11px] text-text-secondary">
                  <span className={`font-semibold ${deployedPct > 60 ? 'text-yellow-400' : 'text-text-primary'}`}>
                    {deployedPct.toFixed(0)}%
                  </span> capital deployed
                </span>
                {sameSectorCount > 0 && (
                  <>
                    <span className="text-text-muted/30 text-xs">·</span>
                    <span className="text-[11px] text-yellow-400 font-semibold">
                      {sameSectorCount + 1} in {row.sector}
                    </span>
                  </>
                )}
              </div>
              {deployedPct > 60 && (
                <p className="text-[10px] text-yellow-400/80 mt-1.5">High concentration — consider sizing smaller or waiting for an existing trade to close.</p>
              )}
            </div>

            {/* Exit monitors */}
            <div className="rounded-xl border border-border/60 overflow-hidden shrink-0">
              <button type="button" onClick={() => setMonitorsOpen(o => !o)}
                className="w-full flex items-center justify-between px-3 py-2 bg-bg hover:bg-accent/5 transition-colors text-left">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Exit monitors</span>
                <span className="text-[10px] text-text-muted">{monitorsOpen ? '▲' : '▼'}</span>
              </button>
              {monitorsOpen && (
                <div className="px-3 py-2.5 border-t border-border/40 bg-bg space-y-2">
                  {[
                    { color: 'bg-yellow-400', title: 'Momentum fading', body: 'Price closes below 20-day average for 2 days — stall, exit' },
                    { color: 'bg-red-400',    title: 'Trend reversal',  body: '20-day crosses below 50-day average — setup broken, exit all' },
                    { color: 'bg-border',     title: 'Day 20 time stop', body: 'Still open, no progress at day 20 — free the capital' },
                  ].map(({ color, title, body }) => (
                    <div key={title} className="flex items-start gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full mt-0.5 shrink-0 ${color}`} />
                      <div>
                        <p className="text-[11px] font-semibold text-text-secondary">{title}</p>
                        <p className="text-[10px] text-text-muted">{body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Trade thesis */}
            <div className="flex-1 flex flex-col min-h-0">
              <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">
                Trade thesis <span className="normal-case font-normal text-text-muted/50">— complete the "invalid if" line</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={'Pattern: describe what you see\nEntry zone: key level or average\nThis trade is invalid if: '}
                className="flex-1 text-sm bg-bg border border-border rounded-xl px-3 py-2.5 text-text-primary placeholder:text-text-muted/40 focus:outline-none focus:border-accent resize-none min-h-[80px] font-mono"
              />
              <p className="text-[10px] text-text-muted/50 mt-1">Tip: Finishing the "invalid if" line forces you to define your exit before you enter.</p>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 shrink-0">{error}</p>
            )}

          </div>
          </div>

        </div>

        {/* ── Footer ── */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-2.5 border-t border-border/50 shrink-0">
          <button onClick={onClose}
            className="w-20 sm:w-24 shrink-0 py-2.5 text-sm text-text-secondary border border-border rounded-xl hover:border-accent/40 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => setPlanOpen(o => !o)}
            className={`hidden md:block shrink-0 py-2.5 px-4 text-sm border rounded-xl transition-colors ${planOpen ? 'border-accent/50 text-accent bg-accent/8' : 'border-border text-text-muted hover:border-accent/40 hover:text-accent'}`}
            title="Toggle trade plan"
          >
            {planOpen ? '◀ Plan' : 'Plan ▶'}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 text-sm font-bold bg-accent text-white rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? 'Saving…' : 'Track Trade →'}
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Results table row ─────────────────────────────────────────────────────────

function QualityBadge({ q }: { q: 'A' | 'B' | 'C' }) {
  const cls =
    q === 'A' ? 'bg-green-500/15 text-green-400 border-green-500/30'
    : q === 'B' ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
    : 'bg-border/50 text-text-muted border-border'
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold border ${cls}`}>
      {q}
    </span>
  )
}

type SortKey = keyof ScreenerRow | null
type SortDir = 'asc' | 'desc'

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={`ml-1 text-[9px] ${active ? 'text-accent' : 'text-text-muted/40'}`}>
      {dir === 'asc' && active ? '▲' : '▼'}
    </span>
  )
}

function ResultRow({
  row, onClick, onTrack,
}: { row: ScreenerRow; onClick: () => void; onTrack: (row: ScreenerRow) => void }) {
  const [tip, setTip] = useState(false)
  const pos = (row.change_pct ?? 0) >= 0
  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}
      className="border-b border-border/30 hover:bg-accent/5 cursor-pointer transition-colors relative"
    >
      <td className="py-2.5 pl-4 pr-2">
        <div>
          <span className="text-sm font-bold text-text-primary">{row.symbol.replace('.NS', '')}</span>
          <span className="ml-1.5 text-[10px] font-semibold text-text-muted bg-border/40 px-1.5 py-0.5 rounded uppercase">
            {row.symbol.endsWith('.NS') ? 'NSE' : 'US'}
          </span>
        </div>
        <div className="text-xs text-text-muted truncate max-w-[140px]" title={row.name}>{row.name}</div>
      </td>
      <td className="py-2.5 px-3 text-right text-sm font-mono font-semibold text-text-primary">
        {row.symbol.endsWith('.NS')
          ? row.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })
          : row.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
      </td>
      <td className={`py-2.5 px-3 text-right text-sm font-mono ${pos ? 'text-green-400' : 'text-red-400'}`}>
        {row.change != null ? (pos ? '+' : '') + row.change.toFixed(2) : '—'}
      </td>
      <td className={`py-2.5 px-3 text-right text-sm font-medium ${pos ? 'text-green-400' : 'text-red-400'}`}>
        {row.change_pct != null ? (pos ? '+' : '') + row.change_pct.toFixed(2) + '%' : '—'}
      </td>
      <td className="py-2.5 px-3 text-right text-sm font-mono text-text-secondary">{fmtVol(row.volume)}</td>
      <td className="py-2.5 px-3 text-right text-sm font-mono text-text-secondary">
        {row.market_cap_b != null
          ? `$${row.market_cap_b >= 1000 ? (row.market_cap_b / 1000).toFixed(1) + 'T' : row.market_cap_b.toFixed(0) + 'B'}`
          : fmtMcap(row.market_cap_cr)}
      </td>
      <td className="py-2.5 px-3 text-right text-sm font-mono text-text-secondary">{fmtNum(row.ema20, 0)}</td>
      <td className="py-2.5 px-3 text-right text-sm font-mono text-text-secondary">{fmtNum(row.ema50, 0)}</td>
      <td className="py-2.5 px-3 text-right text-sm font-mono text-text-secondary">{fmtNum(row.rsi, 1)}</td>
      <td className="py-2.5 px-3 text-right text-sm font-mono text-text-secondary">{fmtNum(row.adx, 1)}</td>
      <td className="py-2.5 px-3 text-center"><QualityBadge q={row.quality} /></td>
      <td className="py-2.5 px-2 text-center">
        <button
          onClick={(e) => { e.stopPropagation(); onTrack(row) }}
          className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-accent/40 text-accent hover:bg-accent/10 transition-colors whitespace-nowrap"
          title="Add to paper trade tracker"
        >
          Track →
        </button>
      </td>

      {/* Matched tooltip */}
      {tip && row.matched.length > 0 && (
        <td
          className="absolute left-0 top-full mt-0.5 z-40 min-w-[280px] bg-surface border border-border rounded-xl p-3 shadow-2xl pointer-events-none"
          style={{ whiteSpace: 'normal' }}
        >
          <p className="text-xs font-semibold text-text-primary mb-1.5">Conditions matched ({row.score}/{row.total_conditions}):</p>
          <ul className="space-y-1">
            {row.matched.map((m, i) => (
              <li key={i} className="flex gap-1.5 text-xs text-text-secondary">
                <span className="text-green-400 shrink-0 mt-px">✓</span>{m}
              </li>
            ))}
          </ul>
        </td>
      )}
    </tr>
  )
}

// ── Main Screener page ────────────────────────────────────────────────────────

export function Screener() {
  const navigate  = useNavigate()
  const [searchParams] = useSearchParams()
  const {
    presets, fields, fieldMap,
    indexSymbol, activePresetId, conditions, interval,
    results, isScanning, scanError, lastScanAt, fromCache,
    loadMeta, setIndex, applyPreset, clearPreset,
    addCondition, updateCondition, removeCondition, clearConditions,
    setInterval, runScan,
  } = useScreenerStore()
  const { virtualCapital, loadSettings } = usePaperTradeStore()

  // Modal state
  const [modalOpen, setModalOpen]        = useState(false)
  const [editingCond, setEditingCond]    = useState<ScreenerCondition | null>(null)

  // Save preset modal
  const [savePresetOpen, setSavePresetOpen] = useState(false)
  const [customPresets, setCustomPresets]   = useState<ScreenerPreset[]>(loadCustomPresets)

  // Education panel
  const [eduOpen, setEduOpen] = useState(false)

  // Market tab (India / US)
  const [market, setMarket] = useState<'india' | 'us'>(
    US_INDEX_SET.has(indexSymbol) ? 'us' : 'india'
  )
  const isUS = market === 'us'

  // Trade modal state
  const [tradeRow, setTradeRow]          = useState<ScreenerRow | null>(null)
  const [tradeSaved, setTradeSaved]      = useState(false)

  // Sort state
  const [sortKey, setSortKey]  = useState<SortKey>('score')
  const [sortDir, setSortDir]  = useState<SortDir>('desc')

  function handleSavePreset(preset: ScreenerPreset) {
    setCustomPresets((prev) => {
      const updated = prev.some((p) => p.id === preset.id)
        ? prev.map((p) => p.id === preset.id ? preset : p)
        : [...prev, preset]
      persistCustomPresets(updated)
      return updated
    })
    applyPreset(preset)
    setSavePresetOpen(false)
  }

  function handleDeleteCustomPreset(id: string) {
    setCustomPresets((prev) => {
      const updated = prev.filter((p) => p.id !== id)
      persistCustomPresets(updated)
      return updated
    })
    if (activePresetId === id) clearPreset()
  }

  // Pre-select index from query param on first load
  const indexInit = useRef(false)
  useEffect(() => {
    if (indexInit.current) return
    indexInit.current = true
    const idx = searchParams.get('index')
    if (idx && INDIA_INDICES.some((i) => i.value === idx)) setIndex(idx)
  }, [searchParams, setIndex])

  useEffect(() => { loadMeta() }, [loadMeta])
  useEffect(() => { loadSettings() }, [loadSettings])

  // Sorted rows
  const sortedRows = results
    ? [...results.rows].sort((a, b) => {
        if (!sortKey) return 0
        const av = a[sortKey]
        const bv = b[sortKey]
        if (av == null && bv == null) return 0
        if (av == null) return 1
        if (bv == null) return -1
        const diff = (av as number) < (bv as number) ? -1 : av === bv ? 0 : 1
        return sortDir === 'asc' ? diff : -diff
      })
    : []

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  function openAdd() { setEditingCond(null); setModalOpen(true) }
  function openEdit(cond: ScreenerCondition) { setEditingCond(cond); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditingCond(null) }

  function handleSaveCondition(partial: Omit<ScreenerCondition, 'id'>) {
    if (editingCond) updateCondition(editingCond.id, partial)
    else addCondition(partial)
    closeModal()
  }

  function exportCSV() {
    if (!results) return
    const mcapHeader = isUS ? 'MCap(USD B)' : 'MCap(Cr)'
    const header = `Symbol,Name,Sector,Price,Change,Change%,Volume,${mcapHeader},EMA20,EMA50,RSI,ADX,Quality`
    const rows = sortedRows.map((r) =>
      [
        r.symbol.replace('.NS', ''), `"${r.name}"`, `"${r.sector}"`,
        r.price, r.change ?? '', r.change_pct ?? '',
        r.volume ?? '', isUS ? (r.market_cap_b ?? '') : (r.market_cap_cr ?? ''),
        r.ema20 ?? '', r.ema50 ?? '', r.rsi ?? '', r.adx ?? '', r.quality,
      ].join(',')
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `screener-${indexSymbol}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Th helper
  function Th({ k, label }: { k: SortKey; label: string }) {
    return (
      <th
        className="py-2.5 px-3 text-right text-[11px] font-semibold text-text-muted uppercase tracking-wide cursor-pointer hover:text-text-primary select-none whitespace-nowrap"
        onClick={() => toggleSort(k)}
      >
        {label}<SortArrow active={sortKey === k} dir={sortDir} />
      </th>
    )
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5">

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-xl font-extrabold text-text-primary tracking-tight shrink-0">Stock Screener</h1>

        {/* Market tab toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
          {(['india', 'us'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMarket(m)
                const defaultIdx = m === 'india' ? 'CNX500' : 'SP500'
                setIndex(defaultIdx)
              }}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                market === m
                  ? 'bg-accent text-white'
                  : 'bg-surface text-text-muted hover:text-text-primary'
              }`}
            >
              {m === 'india' ? '🇮🇳 India' : '🇺🇸 US'}
            </button>
          ))}
        </div>

        {/* Index picker */}
        <select
          value={indexSymbol}
          onChange={(e) => setIndex(e.target.value)}
          className="text-sm font-semibold bg-surface border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-accent"
        >
          {(isUS ? US_INDICES : INDIA_INDICES).map((i) => (
            <option key={i.value} value={i.value}>{i.label}</option>
          ))}
        </select>

        {/* Timeframe picker */}
        <select
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          className="text-sm font-semibold bg-surface border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-accent"
          title="Data timeframe used for indicator calculations"
        >
          <option value="1d">Daily</option>
          <option value="1h">1 Hour</option>
          <option value="15m">15 Min</option>
        </select>

        {/* Active condition chips */}
        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
          {conditions.map((cond) => (
            <ConditionChip
              key={cond.id}
              cond={cond}
              fieldMap={fieldMap}
              onEdit={() => openEdit(cond)}
              onRemove={() => removeCondition(cond.id)}
            />
          ))}
          {conditions.length > 0 && (
            <button
              onClick={clearConditions}
              className="text-xs text-text-muted hover:text-red-400 transition-colors px-1"
              title="Clear all conditions"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Add condition button */}
        <button
          onClick={openAdd}
          className="shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-accent/50 text-accent hover:bg-accent/10 transition-colors"
        >
          <span className="text-base leading-none">+</span> Add Filter
        </button>

        {/* Save as preset */}
        {conditions.length > 0 && (
          <button
            onClick={() => setSavePresetOpen(true)}
            className="shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-border text-text-secondary hover:border-accent/50 hover:text-text-primary transition-colors"
            title="Save current filters as a reusable preset"
          >
            Save Preset
          </button>
        )}

        {/* Run button */}
        <button
          onClick={runScan}
          disabled={isScanning}
          className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-sm font-bold shadow-panel hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isScanning ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Scanning…
            </>
          ) : (
            <>Run Screener →</>
          )}
        </button>
      </div>

      {/* ── Preset section — grouped by archetype ───────────────────── */}
      <div className="mb-4 pb-4 border-b border-border/50 space-y-3">
        {(['Trend Following', 'Mean Reversion', 'Hybrid'] as const).map((cat) => {
          const catPresets = presets.filter((p) => p.category === cat)
          if (catPresets.length === 0) return null
          const meta = CATEGORY_META[cat]
          return (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-xs font-bold ${meta.color}`}>{meta.icon} {cat}</span>
                <div className="relative group">
                  <button
                    type="button"
                    className="w-4 h-4 rounded-full border border-border text-[9px] text-text-muted/60 hover:text-text-muted flex items-center justify-center leading-none"
                    aria-label={`About ${cat}`}
                  >?</button>
                  <div className="absolute left-0 top-full mt-1.5 z-30 w-72 bg-surface border border-border rounded-xl p-3 shadow-2xl hidden group-hover:block pointer-events-none">
                    <p className="text-[11px] font-bold text-text-primary mb-1">{cat}</p>
                    <p className="text-[11px] text-text-secondary leading-relaxed mb-2">{meta.description}</p>
                    <p className="text-[10px] text-text-muted leading-relaxed italic">{meta.philosophy}</p>
                    <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-1.5">
                      <span className="text-[9px] font-semibold text-text-muted uppercase tracking-wide">Typical win rate:</span>
                      <span className={`text-[10px] font-bold ${meta.color}`}>{meta.winRate}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {catPresets.map((p) => {
                  const edu = PRESET_EDUCATION[p.id]
                  const tfLabel: Record<string, string> = { intraday: 'Intraday', short: 'Short', swing: 'Swing', medium: 'Medium', long: 'Long' }
                  return (
                    <div key={p.id} className="relative group/preset">
                      <button
                        onClick={() => {
                          if (activePresetId === p.id) { clearPreset(); setEduOpen(false) }
                          else { applyPreset(p); setEduOpen(true) }
                        }}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                          activePresetId === p.id
                            ? 'bg-accent text-white border-accent'
                            : 'border-border text-text-secondary hover:border-accent/50 hover:text-text-primary'
                        }`}
                      >
                        {p.name}
                        <span className={`ml-1.5 text-[9px] font-medium opacity-60`}>{tfLabel[p.timeframe] ?? p.timeframe}</span>
                      </button>
                      {/* Hover tooltip */}
                      <div className="absolute left-0 top-full mt-1.5 z-30 w-64 bg-surface border border-border rounded-xl p-3 shadow-2xl hidden group-hover/preset:block pointer-events-none">
                        <p className="text-[11px] font-bold text-text-primary mb-1">{p.name}</p>
                        <p className="text-[10px] text-text-secondary leading-relaxed mb-2">{p.description}</p>
                        {edu?.winRate && (
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="text-[9px] font-semibold text-text-muted uppercase tracking-wide">Win rate:</span>
                            <span className="text-[10px] font-bold text-green-400">{edu.winRate}</span>
                          </div>
                        )}
                        {edu?.bestRegime && (
                          <div className="flex items-start gap-1.5">
                            <span className="text-[9px] font-semibold text-text-muted uppercase tracking-wide shrink-0 mt-px">Best in:</span>
                            <span className="text-[10px] text-text-muted leading-relaxed">{edu.bestRegime}</span>
                          </div>
                        )}
                        <div className="mt-2 pt-2 border-t border-border/40">
                          <p className="text-[9px] text-text-muted/60">Filters: {p.filter_chips.slice(0, 3).join(' · ')}{p.filter_chips.length > 3 ? ` +${p.filter_chips.length - 3} more` : ''}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        {customPresets.length > 0 && (
          <div>
            <span className="text-xs font-bold text-text-muted mb-1.5 block">My Saved Presets</span>
            <div className="flex flex-wrap gap-2">
              {customPresets.map((p) => (
                <div key={p.id} className={`inline-flex items-center gap-0 rounded-full border overflow-hidden transition-colors ${
                  activePresetId === p.id ? 'bg-accent/20 border-accent' : 'border-border hover:border-accent/50'
                }`}>
                  <button
                    onClick={() => {
                      if (activePresetId === p.id) { clearPreset(); setEduOpen(false) }
                      else { applyPreset(p); setEduOpen(false) }
                    }}
                    className="text-xs font-semibold px-3 py-1.5 text-text-secondary hover:text-text-primary transition-colors"
                  >
                    {p.name}
                  </button>
                  <button
                    onClick={() => { applyPreset(p); setSavePresetOpen(true) }}
                    className="pl-0 pr-1 py-1.5 text-text-muted/50 hover:text-accent transition-colors text-xs leading-none"
                    title="Edit and update this preset"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => handleDeleteCustomPreset(p.id)}
                    className="pr-2.5 pl-0 py-1.5 text-text-muted/50 hover:text-red-400 transition-colors text-sm leading-none"
                    title="Delete this preset"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Strategy education (collapsible) ─────────────────────────── */}
      {activePresetId && (() => {
        const edu = PRESET_EDUCATION[activePresetId]
        const activePreset = [...presets, ...customPresets].find((p) => p.id === activePresetId)
        if (!edu && !activePreset?.description) return null
        const catMeta = activePreset?.category ? CATEGORY_META[activePreset.category] : null
        return (
          <div className="mb-4 border border-border/60 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setEduOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-surface hover:bg-accent/5 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-widest">
                  Strategy Guide
                </span>
                <span className="text-xs font-bold text-text-primary">· {activePreset?.name}</span>
                {activePreset?.category && catMeta && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border border-current/20 bg-current/5 ${catMeta.color}`}>
                    {catMeta.icon} {activePreset.category}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-text-muted/60">{eduOpen ? '▲' : '▼'}</span>
            </button>
            {eduOpen && (
              <div className="px-4 py-4 border-t border-border/40 bg-bg/50 space-y-4">
                {edu ? (
                  <>
                    {/* Stats bar */}
                    {(edu.winRate || edu.bestRegime) && (
                      <div className="flex flex-wrap gap-4 pb-3 border-b border-border/40">
                        {edu.winRate && (
                          <div>
                            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Historical Win Rate</p>
                            <p className="text-sm font-bold text-green-400 mt-0.5">{edu.winRate}</p>
                          </div>
                        )}
                        {edu.bestRegime && (
                          <div>
                            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Best Market Regime</p>
                            <p className="text-sm text-text-secondary mt-0.5">{edu.bestRegime}</p>
                          </div>
                        )}
                      </div>
                    )}
                    <p className="text-sm text-text-secondary leading-relaxed">{edu.what}</p>
                    <div>
                      <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-2">How the filters work</p>
                      <ul className="space-y-2">
                        {edu.logic.map((item, i) => (
                          <li key={i} className="flex gap-2 text-sm text-text-secondary">
                            <span className="text-accent shrink-0 mt-px">·</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-2">Trading tips</p>
                      <ul className="space-y-2">
                        {edu.tips.map((tip, i) => (
                          <li key={i} className="flex gap-2 text-sm text-text-secondary">
                            <span className="text-green-400 shrink-0 mt-px">✓</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-text-secondary leading-relaxed">{activePreset?.description}</p>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Error banner ─────────────────────────────────────────────── */}
      {scanError && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
          {scanError}
        </div>
      )}

      {/* ── Results table ─────────────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl shadow-panel overflow-hidden">
        {/* Table header bar */}
        <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between gap-3 flex-wrap">
          {results ? (
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm text-text-muted">
                Showing{' '}
                <span className="font-semibold text-text-primary">{results.total_matched}</span>
                {' '}of{' '}
                <span className="font-semibold text-text-primary">{results.total_scanned}</span>
                {' '}results
              </p>
              {fromCache && lastScanAt && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent bg-accent/10 border border-accent/20 rounded-full px-2 py-0.5">
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  cached · {Math.round((Date.now() - lastScanAt) / 60000)} min ago
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-muted">
              {isScanning ? 'Scanning all constituents — this may take 20–40 s…' : 'Add filters above and click Run Screener'}
            </p>
          )}
          {results && results.rows.length > 0 && (
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-text-primary border border-border px-3 py-1.5 rounded-lg hover:border-accent/50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>
          )}
        </div>

        {/* Scanning spinner */}
        {isScanning && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <svg className="w-8 h-8 animate-spin text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <p className="text-sm text-text-muted">Analysing {INDIA_INDICES.find(i=>i.value===indexSymbol)?.label ?? indexSymbol} constituents…</p>
          </div>
        )}

        {/* Empty state */}
        {!isScanning && !results && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-muted">
            <svg className="w-10 h-10 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            <p className="text-sm">Add conditions and run the screener to find matching stocks</p>
          </div>
        )}

        {/* No results */}
        {!isScanning && results && results.rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-text-muted">
            <p className="text-sm font-semibold">No stocks matched the current conditions</p>
            <p className="text-xs">Try relaxing one or more conditions</p>
          </div>
        )}

        {/* Data table */}
        {!isScanning && sortedRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px]">
              <thead>
                <tr className="border-b border-border/50 bg-bg/60">
                  <th className="py-2.5 pl-4 pr-2 text-[11px] font-semibold text-text-muted uppercase tracking-wide text-left min-w-[180px]">Name</th>
                  <Th k="price"       label="Price" />
                  <Th k="change"      label="Day Chg" />
                  <Th k="change_pct"  label="Chg %" />
                  <Th k="volume"      label="Volume" />
                  <Th k={isUS ? 'market_cap_b' : 'market_cap_cr'} label={isUS ? 'MCap (USD B)' : 'MCap (Cr.)'} />
                  <Th k="ema20"       label="EMA (20)" />
                  <Th k="ema50"       label="EMA (50)" />
                  <Th k="rsi"         label="RSI" />
                  <Th k="adx"         label="ADX" />
                  <th className="py-2.5 px-3 text-[11px] font-semibold text-text-muted uppercase tracking-wide text-center">Grade</th>
                  <th className="py-2.5 px-2 text-[11px] font-semibold text-text-muted uppercase tracking-wide text-center">Trade</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <ResultRow
                    key={row.symbol}
                    row={row}
                    onClick={() => navigate(`/stock/${row.symbol}`)}
                    onTrack={(r) => { setTradeRow(r); setTradeSaved(false) }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Condition builder modal */}
      {modalOpen && (
        <ConditionModal
          fields={fields}
          fieldMap={fieldMap}
          initial={editingCond ?? undefined}
          onSave={handleSaveCondition}
          onClose={closeModal}
        />
      )}

      {/* Save preset modal */}
      {savePresetOpen && (
        <SavePresetModal
          conditions={conditions}
          fieldMap={fieldMap}
          existingCustom={customPresets}
          initialOverwriteId={activePresetId && customPresets.some((p) => p.id === activePresetId) ? activePresetId : undefined}
          onSave={handleSavePreset}
          onClose={() => setSavePresetOpen(false)}
        />
      )}

      {/* Add Paper Trade modal */}
      {tradeRow && !tradeSaved && (
        <AddTradeModal
          row={tradeRow}
          virtualCapital={virtualCapital}
          presetId={activePresetId ?? undefined}
          onClose={() => setTradeRow(null)}
          onSaved={() => { setTradeSaved(true); setTradeRow(null) }}
        />
      )}

      {/* Trade saved toast */}
      {tradeSaved && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-surface border border-green-500/40 rounded-2xl px-4 py-3 shadow-2xl">
          <span className="text-green-400 text-lg">✓</span>
          <div>
            <p className="text-sm font-semibold text-text-primary">Trade tracked!</p>
            <button
              onClick={() => navigate('/paper-trades')}
              className="text-xs text-accent underline underline-offset-2 hover:no-underline"
            >
              View in My Trades →
            </button>
          </div>
          <button onClick={() => setTradeSaved(false)} className="text-text-muted hover:text-text-primary ml-1 text-lg leading-none">×</button>
        </div>
      )}
    </div>
  )
}
