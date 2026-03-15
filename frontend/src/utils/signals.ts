import type { OHLCVBar, TechnicalIndicators } from '../types/market'

export type SignalVerdict = 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell'
export type IndicatorVote = 'buy' | 'neutral' | 'sell'

export interface IndicatorSignal {
  name: string
  value: string
  vote: IndicatorVote
}

export interface SignalCounts {
  buy: number
  neutral: number
  sell: number
}

export interface TradingSignalResult {
  oscillators: IndicatorSignal[]
  movingAverages: IndicatorSignal[]
  oscillatorCounts: SignalCounts
  maCounts: SignalCounts
  summaryCounts: SignalCounts
  summaryScore: number      // -1 (strong sell) to +1 (strong buy)
  oscillatorScore: number
  maScore: number
  summaryVerdict: SignalVerdict
  oscillatorVerdict: SignalVerdict
  maVerdict: SignalVerdict
}

// ── Math primitives ───────────────────────────────────────────────────────────

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null
  const s = closes.slice(closes.length - period)
  return s.reduce((a, b) => a + b, 0) / period
}

function ema(closes: number[], period: number): number | null {
  if (closes.length < period) return null
  const k = 2 / (period + 1)
  let e = closes.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < closes.length; i++) {
    e = closes[i] * k + e * (1 - k)
  }
  return e
}

function wma(closes: number[], period: number): number | null {
  if (closes.length < period) return null
  const s = closes.slice(closes.length - period)
  let num = 0, den = 0
  for (let i = 0; i < period; i++) { num += s[i] * (i + 1); den += (i + 1) }
  return den > 0 ? num / den : null
}

// Hull MA(n) = WMA( 2*WMA(n/2) - WMA(n), sqrt(n) )
function hullMA(closes: number[], period: number): number | null {
  const half = Math.floor(period / 2)
  const sqrtN = Math.round(Math.sqrt(period))
  if (closes.length < period + sqrtN) return null
  const diff: number[] = []
  for (let i = period; i <= closes.length; i++) {
    const w1 = wma(closes.slice(0, i), half)
    const w2 = wma(closes.slice(0, i), period)
    if (w1 != null && w2 != null) diff.push(2 * w1 - w2)
  }
  return wma(diff, sqrtN)
}

function vwma(bars: OHLCVBar[], period: number): number | null {
  if (bars.length < period) return null
  const s = bars.slice(bars.length - period)
  const num = s.reduce((a, b) => a + b.close * b.volume, 0)
  const den = s.reduce((a, b) => a + b.volume, 0)
  return den > 0 ? num / den : null
}

function stochK(bars: OHLCVBar[], period = 14): number | null {
  if (bars.length < period) return null
  const s = bars.slice(bars.length - period)
  const hh = Math.max(...s.map(b => b.high))
  const ll = Math.min(...s.map(b => b.low))
  if (hh === ll) return 50
  return ((bars[bars.length - 1].close - ll) / (hh - ll)) * 100
}

function cci(bars: OHLCVBar[], period = 20): number | null {
  if (bars.length < period) return null
  const s = bars.slice(bars.length - period)
  const tps = s.map(b => (b.high + b.low + b.close) / 3)
  const mean = tps.reduce((a, v) => a + v, 0) / period
  const dev = tps.reduce((a, v) => a + Math.abs(v - mean), 0) / period
  if (dev === 0) return 0
  return (tps[tps.length - 1] - mean) / (0.015 * dev)
}

function williamsR(bars: OHLCVBar[], period = 14): number | null {
  if (bars.length < period) return null
  const s = bars.slice(bars.length - period)
  const hh = Math.max(...s.map(b => b.high))
  const ll = Math.min(...s.map(b => b.low))
  if (hh === ll) return -50
  return ((hh - bars[bars.length - 1].close) / (hh - ll)) * -100
}

function momentum(closes: number[], period = 10): number | null {
  if (closes.length <= period) return null
  return closes[closes.length - 1] - closes[closes.length - 1 - period]
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function countsScore(c: SignalCounts): number {
  const total = c.buy + c.neutral + c.sell
  return total === 0 ? 0 : (c.buy - c.sell) / total
}

function scoreToVerdict(score: number): SignalVerdict {
  if (score > 0.5)  return 'strong_buy'
  if (score > 0.1)  return 'buy'
  if (score < -0.5) return 'strong_sell'
  if (score < -0.1) return 'sell'
  return 'neutral'
}

function toCounts(signals: IndicatorSignal[]): SignalCounts {
  return {
    buy:     signals.filter(s => s.vote === 'buy').length,
    neutral: signals.filter(s => s.vote === 'neutral').length,
    sell:    signals.filter(s => s.vote === 'sell').length,
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computeTradingSignals(
  bars: OHLCVBar[],
  tech: TechnicalIndicators,
): TradingSignalResult {
  const closes = bars.map(b => b.close)
  const last = closes[closes.length - 1]
  const osc: IndicatorSignal[] = []
  const mas: IndicatorSignal[] = []

  // ── Oscillators ──────────────────────────────────────────────────────────────

  // 1. RSI(14): oversold (<30)=buy, overbought(>70)=sell, else mid-line cross
  if (tech.rsi != null) {
    const v = tech.rsi
    const vote: IndicatorVote = v < 30 ? 'buy' : v > 70 ? 'sell' : v > 50 ? 'buy' : v < 50 ? 'sell' : 'neutral'
    osc.push({ name: 'RSI (14)', value: v.toFixed(2), vote })
  }

  // 2. MACD(12,26,9): line vs signal cross
  {
    const vote: IndicatorVote = tech.macd_signal === 'bullish' ? 'buy' : tech.macd_signal === 'bearish' ? 'sell' : 'neutral'
    osc.push({ name: 'MACD (12,26,9)', value: tech.macd.histogram != null ? tech.macd.histogram.toFixed(2) : '—', vote })
  }

  // 3. Stochastic %K(14): <20=buy, >80=sell
  const sk = stochK(bars, 14)
  if (sk != null) {
    const vote: IndicatorVote = sk < 20 ? 'buy' : sk > 80 ? 'sell' : 'neutral'
    osc.push({ name: 'Stoch %K (14)', value: sk.toFixed(2), vote })
  }

  // 4. CCI(20): <-100=buy, >100=sell
  const cciVal = cci(bars, 20)
  if (cciVal != null) {
    const vote: IndicatorVote = cciVal < -100 ? 'buy' : cciVal > 100 ? 'sell' : 'neutral'
    osc.push({ name: 'CCI (20)', value: cciVal.toFixed(2), vote })
  }

  // 5. ADX(14): use +DI/-DI direction when ADX>=25, else neutral
  if (tech.adx != null && tech.plus_di != null && tech.minus_di != null) {
    const vote: IndicatorVote = tech.adx < 25 ? 'neutral' : tech.plus_di > tech.minus_di ? 'buy' : 'sell'
    osc.push({ name: 'ADX (14)', value: tech.adx.toFixed(2), vote })
  }

  // 6. Williams %R(14): <-80=buy (oversold), >-20=sell (overbought)
  const wr = williamsR(bars, 14)
  if (wr != null) {
    const vote: IndicatorVote = wr < -80 ? 'buy' : wr > -20 ? 'sell' : 'neutral'
    osc.push({ name: 'Williams %R (14)', value: wr.toFixed(2), vote })
  }

  // 7. Momentum(10): positive=buy, negative=sell
  const mom = momentum(closes, 10)
  if (mom != null) {
    const vote: IndicatorVote = mom > 0 ? 'buy' : mom < 0 ? 'sell' : 'neutral'
    osc.push({ name: 'Momentum (10)', value: mom.toFixed(2), vote })
  }

  // 8. Bollinger %B: price vs band extremes
  if (tech.bollinger.percent_b != null) {
    const vote: IndicatorVote =
      tech.bb_signal === 'below_lower' ? 'buy' :
      tech.bb_signal === 'above_upper' ? 'sell' : 'neutral'
    osc.push({ name: 'Bollinger %B', value: (tech.bollinger.percent_b * 100).toFixed(1) + '%', vote })
  }

  // 9. OBV trend
  {
    const vote: IndicatorVote = tech.obv_trend === 'rising' ? 'buy' : tech.obv_trend === 'falling' ? 'sell' : 'neutral'
    osc.push({ name: 'OBV Trend', value: tech.obv_trend, vote })
  }

  // ── Moving Averages ───────────────────────────────────────────────────────────
  // Buy = price above MA, Sell = price below MA

  const maList: Array<{ name: string; val: number | null }> = [
    { name: 'SMA (10)',    val: sma(closes, 10) },
    { name: 'EMA (10)',    val: ema(closes, 10) },
    { name: 'SMA (20)',    val: tech.sma20 ?? sma(closes, 20) },
    { name: 'EMA (20)',    val: ema(closes, 20) },
    { name: 'SMA (30)',    val: sma(closes, 30) },
    { name: 'EMA (30)',    val: ema(closes, 30) },
    { name: 'SMA (50)',    val: tech.sma50 ?? sma(closes, 50) },
    { name: 'EMA (50)',    val: ema(closes, 50) },
    { name: 'SMA (100)',   val: sma(closes, 100) },
    { name: 'EMA (100)',   val: ema(closes, 100) },
    { name: 'SMA (200)',   val: tech.sma200 ?? sma(closes, 200) },
    { name: 'EMA (200)',   val: ema(closes, 200) },
    { name: 'VWMA (20)',   val: vwma(bars, 20) },
    { name: 'Hull MA (9)', val: hullMA(closes, 9) },
  ]

  for (const { name, val } of maList) {
    if (val == null) continue
    const vote: IndicatorVote = last > val ? 'buy' : last < val ? 'sell' : 'neutral'
    mas.push({ name, value: val.toFixed(2), vote })
  }

  // ── Aggregate ─────────────────────────────────────────────────────────────────
  const oscillatorCounts = toCounts(osc)
  const maCounts = toCounts(mas)
  const summaryCounts: SignalCounts = {
    buy:     oscillatorCounts.buy     + maCounts.buy,
    neutral: oscillatorCounts.neutral + maCounts.neutral,
    sell:    oscillatorCounts.sell    + maCounts.sell,
  }

  const summaryScore      = countsScore(summaryCounts)
  const oscillatorScore   = countsScore(oscillatorCounts)
  const maScore           = countsScore(maCounts)

  return {
    oscillators: osc,
    movingAverages: mas,
    oscillatorCounts,
    maCounts,
    summaryCounts,
    summaryScore,
    oscillatorScore,
    maScore,
    summaryVerdict:    scoreToVerdict(summaryScore),
    oscillatorVerdict: scoreToVerdict(oscillatorScore),
    maVerdict:         scoreToVerdict(maScore),
  }
}
