import type {
  AnalysisResult,
  IndexSnapshot,
  MultiTimeframeTrend,
  TimeframeTrend,
  OverviewResponse,
} from '../types/market'
import type { IndexSectorAnalysis, StockBreakdown } from '../types/sector'

export type StanceTone = 'up' | 'down' | 'neutral'
export type StanceKey = 'accumulate' | 'buy_dips' | 'hold_wait' | 'reduce_risk' | 'defensive'
export type StockAction = 'buy' | 'watch' | 'trim'

export interface StockIdea {
  symbol: string
  name: string
  sector: string
  action: StockAction
  score: number
  changePct: number
  weight: number
  contributionPct: number
  reason: string
}

export interface IndexPlaybook {
  stance: StanceKey
  stanceLabel: string
  tone: StanceTone
  confidence: 'high' | 'medium' | 'low'
  horizon: string
  summary: string
  happened: string[]
  meaning: string[]
  actionPlan: string[]
  topRisks: string[]
  checklist: DecisionCheck[]
  readinessScore: number
  tradePlan: TradePlan
  stockIdeas: StockIdea[]
  dataCoverage: {
    hasAnalysis: boolean
    hasTrend: boolean
    hasSectors: boolean
  }
}

export interface DecisionCheck {
  id: string
  label: string
  passed: boolean
  note: string
}

export interface TradePlan {
  direction: 'long' | 'short' | 'wait'
  entryLabel: string
  entryPrice: number | null
  stopLoss: number | null
  target1: number | null
  target2: number | null
  riskReward: number | null
  rationale: string[]
}

export interface GlobalPulse {
  tone: StanceTone
  headline: string
  breadthText: string
  participationPct: number
  beginnerAction: string
  leaders: Array<{ symbol: string; name: string; movePct: number; note: string }>
  laggards: Array<{ symbol: string; name: string; movePct: number; note: string }>
}

export interface IndiaMood {
  score: number
  zone: 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed'
  components: {
    momentum: number
    breadth: number
    volatility: number
    trendHealth: number
  }
  summary: string
  action: string
}

export interface QuickSetup {
  score: number
  total: number
  status: 'ready' | 'watch' | 'avoid'
  highlights: string[]
}

const CLAMP_MIN = -1
const CLAMP_MAX = 1

function clamp(value: number, min = CLAMP_MIN, max = CLAMP_MAX): number {
  return Math.max(min, Math.min(max, value))
}

function normalizePct(value: number, divisor: number): number {
  return clamp(value / divisor)
}

function trendDirectionScore(direction: TimeframeTrend['direction']): number {
  if (direction === 'up') return 1
  if (direction === 'down') return -1
  return 0
}

function trendStrengthWeight(strength: TimeframeTrend['strength']): number {
  if (strength === 'strong') return 1
  if (strength === 'moderate') return 0.7
  return 0.4
}

function timeframeScore(timeframe: TimeframeTrend): number {
  const direction = trendDirectionScore(timeframe.direction)
  const strength = trendStrengthWeight(timeframe.strength)
  const significance = timeframe.trend_significant ? 1 : 0.45
  return direction * strength * significance
}

function compositeTrendScore(trend: MultiTimeframeTrend | null): number {
  if (!trend) return 0

  const dailyWeight = 0.2
  const weeklyWeight = 0.3
  const monthlyWeight = 0.35
  const yearlyWeight = 0.15

  const weighted =
    timeframeScore(trend.daily) * dailyWeight +
    timeframeScore(trend.weekly) * weeklyWeight +
    timeframeScore(trend.monthly) * monthlyWeight +
    timeframeScore(trend.yearly) * yearlyWeight

  return clamp(weighted)
}

function sectorBreadthScore(sectorData: IndexSectorAnalysis | null): number {
  if (!sectorData || sectorData.sector_count === 0) return 0
  return clamp((sectorData.positive_sector_count - sectorData.negative_sector_count) / sectorData.sector_count)
}

function volatilityPenalty(analysis: AnalysisResult | null): number {
  if (!analysis?.statistical.volatility_20d) return 0
  const vol = analysis.statistical.volatility_20d
  if (vol >= 30) return -0.25
  if (vol >= 22) return -0.12
  return 0
}

function scoreToStance(score: number): { stance: StanceKey; label: string; tone: StanceTone; horizon: string } {
  if (score >= 0.45) {
    return {
      stance: 'accumulate',
      label: 'Favorable for gradual accumulation',
      tone: 'up',
      horizon: 'Swing to positional (weeks to months)',
    }
  }

  if (score >= 0.15) {
    return {
      stance: 'buy_dips',
      label: 'Positive bias, prefer buying pullbacks',
      tone: 'up',
      horizon: 'Short to medium term',
    }
  }

  if (score > -0.15) {
    return {
      stance: 'hold_wait',
      label: 'Mixed signals, wait for confirmation',
      tone: 'neutral',
      horizon: 'Stay selective',
    }
  }

  if (score > -0.45) {
    return {
      stance: 'reduce_risk',
      label: 'Cautious phase, protect capital',
      tone: 'down',
      horizon: 'Reduce aggressive exposure',
    }
  }

  return {
    stance: 'defensive',
    label: 'Defensive setup, avoid fresh risk',
    tone: 'down',
    horizon: 'Capital preservation',
  }
}

function toConfidence(scoreAbs: number, dataPoints: number): 'high' | 'medium' | 'low' {
  if (scoreAbs >= 0.55 && dataPoints >= 3) return 'high'
  if (scoreAbs >= 0.3 && dataPoints >= 2) return 'medium'
  return 'low'
}

function trendText(trend: TimeframeTrend | undefined): string {
  if (!trend) return 'trend data unavailable'
  const label = trend.trend_label.replace(/_/g, ' ')
  return `${label} (${trend.window_label})`
}

function round(value: number | null, digits = 2): number | null {
  if (value == null || !Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function getAtrValue(analysis: AnalysisResult | null, priceFallback: number): number {
  const atr = analysis?.technical.atr
  if (atr && atr > 0) return atr
  return Math.max(priceFallback * 0.01, 1)
}

function buildTradePlan(params: {
  stance: StanceKey
  index: IndexSnapshot | undefined
  analysis: AnalysisResult | null
}): TradePlan {
  const { stance, index, analysis } = params

  const price = index?.last_close ?? analysis?.last_close ?? 0
  if (price <= 0) {
    return {
      direction: 'wait',
      entryLabel: 'Wait for data',
      entryPrice: null,
      stopLoss: null,
      target1: null,
      target2: null,
      riskReward: null,
      rationale: ['Price data not available yet.'],
    }
  }

  const atr = getAtrValue(analysis, price)
  const sma20 = analysis?.technical.sma20 ?? price

  if (stance === 'accumulate' || stance === 'buy_dips') {
    const entry = stance === 'accumulate' ? Math.min(price, sma20) : price
    const stop = entry - atr * 1.2
    const target1 = entry + atr * 2
    const target2 = entry + atr * 3.5
    const risk = entry - stop
    const reward = target1 - entry

    return {
      direction: 'long',
      entryLabel: stance === 'accumulate' ? 'Buy in tranches near pullback zone' : 'Buy pullback / breakout confirmation',
      entryPrice: round(entry),
      stopLoss: round(stop),
      target1: round(target1),
      target2: round(target2),
      riskReward: risk > 0 ? round(reward / risk, 2) : null,
      rationale: [
        'ATR-based stop keeps risk adaptive to current volatility.',
        'Targets are set at 2 ATR and 3.5 ATR for staged exits.',
      ],
    }
  }

  if (stance === 'reduce_risk' || stance === 'defensive') {
    const entry = Math.max(price, sma20)
    const stop = entry + atr * 1.2
    const target1 = entry - atr * 2
    const target2 = entry - atr * 3.5
    const risk = stop - entry
    const reward = entry - target1

    return {
      direction: 'short',
      entryLabel: 'For experienced traders only: sell on failed bounce',
      entryPrice: round(entry),
      stopLoss: round(stop),
      target1: round(target1),
      target2: round(target2),
      riskReward: risk > 0 ? round(reward / risk, 2) : null,
      rationale: [
        'Short bias only when bounce fails near resistance.',
        'If you do not short, use this plan as an avoid / reduce-risk guide.',
      ],
    }
  }

  return {
    direction: 'wait',
    entryLabel: 'Wait for confirmation',
    entryPrice: null,
    stopLoss: null,
    target1: null,
    target2: null,
    riskReward: null,
    rationale: ['Signals are mixed. Better to wait for trend and breadth alignment.'],
  }
}

function buildDecisionChecklist(params: {
  analysis: AnalysisResult | null
  trend: MultiTimeframeTrend | null
  sectorData: IndexSectorAnalysis | null
  tradePlan: TradePlan
}): { checklist: DecisionCheck[]; readinessScore: number } {
  const { analysis, trend, sectorData, tradePlan } = params

  const volatility = analysis?.statistical.volatility_20d ?? null
  const breadthPass = sectorData
    ? sectorData.positive_sector_count >= sectorData.negative_sector_count
    : false
  const monthlyNotDown = trend ? trend.monthly.direction !== 'down' : false
  const trendAligned = trend ? trend.daily.direction === 'up' && trend.weekly.direction === 'up' : false
  const momentumPass = analysis
    ? analysis.technical.macd_signal === 'bullish' && analysis.technical.price_vs_sma20 === 'above'
    : false
  const riskRewardPass = tradePlan.riskReward != null ? tradePlan.riskReward >= 2 : false
  const volPass = volatility != null ? volatility < 25 : false

  const checklist: DecisionCheck[] = [
    {
      id: 'trend-alignment',
      label: 'Daily + Weekly trend alignment',
      passed: trendAligned,
      note: trendAligned ? 'Both timeframes point up.' : 'Trend alignment is incomplete.',
    },
    {
      id: 'monthly-bias',
      label: 'Monthly trend not bearish',
      passed: monthlyNotDown,
      note: monthlyNotDown ? 'Higher timeframe is supportive or neutral.' : 'Monthly trend is still down.',
    },
    {
      id: 'momentum',
      label: 'Momentum confirmation',
      passed: momentumPass,
      note: momentumPass ? 'MACD bullish and price above 20DMA.' : 'Momentum confirmation missing.',
    },
    {
      id: 'breadth',
      label: 'Sector breadth support',
      passed: breadthPass,
      note: breadthPass ? 'More sectors are participating.' : 'Breadth is weak.',
    },
    {
      id: 'volatility',
      label: 'Volatility manageable',
      passed: volPass,
      note: volatility != null ? `${volatility.toFixed(1)}% annualized 20D vol.` : 'Volatility data unavailable.',
    },
    {
      id: 'risk-reward',
      label: 'Risk/Reward >= 2',
      passed: riskRewardPass,
      note:
        tradePlan.riskReward != null
          ? `Current setup RR: ${tradePlan.riskReward.toFixed(2)}`
          : 'No active trade setup yet.',
    },
  ]

  const passed = checklist.filter((item) => item.passed).length
  const readinessScore = Math.round((passed / checklist.length) * 100)
  return { checklist, readinessScore }
}

function buildStockReason(stock: StockBreakdown, sectorChange: number, action: StockAction): string {
  if (action === 'buy') {
    if (sectorChange > 0.35) {
      return `Sector leadership is positive and ${stock.symbol} contributes meaningfully to the move.`
    }
    return `${stock.symbol} is outperforming with constructive contribution and tradable liquidity.`
  }

  if (action === 'trim') {
    if (sectorChange < -0.35) {
      return `Sector is under pressure and ${stock.symbol} is adding downside drag.`
    }
    return `${stock.symbol} is weakening; consider reducing size until momentum stabilizes.`
  }

  if (Math.abs(stock.daily_change_pct) >= 2) {
    return 'High momentum move today; watch follow-through before committing capital.'
  }
  return 'Signals are mixed. Keep on watchlist for breakout or breakdown confirmation.'
}

function rankStockIdeas(sectorData: IndexSectorAnalysis | null, stance: StanceKey): StockIdea[] {
  if (!sectorData) return []

  const buyThreshold = stance === 'defensive' || stance === 'reduce_risk' ? 1.65 : 1.15
  const trimThreshold = stance === 'accumulate' ? -1.65 : -1.15

  const pool: StockIdea[] = []

  for (const sector of sectorData.sectors) {
    for (const stock of sector.stocks) {
      const contributionComponent = stock.contribution_pct * 18
      const momentumComponent = stock.daily_change_pct * 0.32
      const sectorComponent = sector.daily_change_pct * 0.22
      const weightComponent = Math.min(stock.weight / 4, 1) * 0.35
      const score = contributionComponent + momentumComponent + sectorComponent + weightComponent

      let action: StockAction = 'watch'
      if (score >= buyThreshold && stock.daily_change_pct > 0 && stock.contribution_pct > 0) {
        action = 'buy'
      } else if (score <= trimThreshold && stock.daily_change_pct < 0 && stock.contribution_pct < 0) {
        action = 'trim'
      }

      pool.push({
        symbol: stock.symbol,
        name: stock.name,
        sector: stock.sector,
        action,
        score,
        changePct: stock.daily_change_pct,
        weight: stock.weight,
        contributionPct: stock.contribution_pct,
        reason: buildStockReason(stock, sector.daily_change_pct, action),
      })
    }
  }

  const buys = pool
    .filter((item) => item.action === 'buy')
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)

  const trims = pool
    .filter((item) => item.action === 'trim')
    .sort((a, b) => a.score - b.score)
    .slice(0, 4)

  const watches = pool
    .filter((item) => item.action === 'watch')
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 4)

  return [...buys, ...watches, ...trims]
}

export function buildIndexPlaybook(params: {
  index: IndexSnapshot | undefined
  analysis: AnalysisResult | null
  trend: MultiTimeframeTrend | null
  sectorData: IndexSectorAnalysis | null
}): IndexPlaybook {
  const { index, analysis, trend, sectorData } = params

  const hasAnalysis = Boolean(analysis)
  const hasTrend = Boolean(trend)
  const hasSectors = Boolean(sectorData)

  const trendScore = compositeTrendScore(trend)
  const sentimentScore = analysis?.sentiment_score ?? 0
  const breadthScore = sectorBreadthScore(sectorData)
  const riskPenalty = volatilityPenalty(analysis)

  const combinedScore = clamp(trendScore * 0.5 + sentimentScore * 0.35 + breadthScore * 0.15 + riskPenalty)
  const stance = scoreToStance(combinedScore)
  const tradePlan = buildTradePlan({ stance: stance.stance, index, analysis })
  const { checklist, readinessScore } = buildDecisionChecklist({
    analysis,
    trend,
    sectorData,
    tradePlan,
  })

  const dataPoints = [hasAnalysis, hasTrend, hasSectors].filter(Boolean).length
  const confidence = toConfidence(Math.abs(combinedScore), dataPoints)

  const closeMove = index?.change_pct ?? analysis?.statistical.daily_return_pct ?? 0
  const moveWord = closeMove >= 0 ? 'rose' : 'fell'

  const happened: string[] = []
  if (index) {
    happened.push(
      `${index.name} ${moveWord} ${Math.abs(closeMove).toFixed(2)}% and closed at ${index.last_close.toLocaleString()} ${index.currency}.`,
    )
    happened.push(`Trading session date: ${index.trade_date}.`)
  }
  if (trend) {
    happened.push(`Trend setup: daily is ${trendText(trend.daily)}, weekly is ${trendText(trend.weekly)}.`)
    happened.push(`Macro bias: monthly is ${trendText(trend.monthly)}.`)
  }
  if (sectorData) {
    happened.push(
      `${sectorData.positive_sector_count} of ${sectorData.sector_count} sectors closed positive; ${sectorData.negative_sector_count} closed negative.`,
    )
  }
  if (happened.length === 0) {
    happened.push('Price and trend data are loading. Use this panel once data appears.')
  }

  const meaning: string[] = []
  if (stance.stance === 'accumulate') {
    meaning.push('Trend and participation are aligned. This is typically a healthier environment for phased index investing.')
  } else if (stance.stance === 'buy_dips') {
    meaning.push('Bias is positive, but entries are better on pullbacks than on sharp up days.')
  } else if (stance.stance === 'hold_wait') {
    meaning.push('Signals conflict across timeframes. Avoid forcing trades until trend alignment improves.')
  } else if (stance.stance === 'reduce_risk') {
    meaning.push('Weak internals suggest preserving capital. Keep position sizes smaller than usual.')
  } else {
    meaning.push('Downtrend pressure is dominant. Fresh risk is lower quality until confirmation changes.')
  }

  if (analysis?.technical.rsi_signal === 'overbought') {
    meaning.push('RSI is stretched, so pullbacks are common even inside broader uptrends.')
  }
  if (analysis?.technical.rsi_signal === 'oversold') {
    meaning.push('RSI is oversold, which can trigger relief bounces; confirmation still matters.')
  }
  if (meaning.length === 0) {
    meaning.push('Not enough signals yet. Wait for analysis and trend data to complete before acting.')
  }

  const actionPlan: string[] = []
  if (stance.stance === 'accumulate') {
    actionPlan.push('Index plan: stagger entries across 2-4 tranches instead of one lump-sum buy.')
    actionPlan.push('Risk control: keep invalidation at the recent weekly swing low.')
  } else if (stance.stance === 'buy_dips') {
    actionPlan.push('Index plan: buy only near pullbacks or support retests, not at intraday spikes.')
    actionPlan.push('Risk control: trim if weekly trend turns flat/down with rising volatility.')
  } else if (stance.stance === 'hold_wait') {
    actionPlan.push('Index plan: maintain current allocation and wait for weekly + monthly alignment.')
    actionPlan.push('Trigger to act: new swing high with improving sector breadth.')
  } else if (stance.stance === 'reduce_risk') {
    actionPlan.push('Index plan: reduce leverage and lower position size until trend improves.')
    actionPlan.push('Trigger to re-enter: two consecutive higher closes with better breadth.')
  } else {
    actionPlan.push('Index plan: prioritize defense, cash, or hedged exposure over aggressive buying.')
    actionPlan.push('Trigger to re-enter: weekly trend changes from down to flat/up with breadth confirmation.')
  }
  if (actionPlan.length === 0) {
    actionPlan.push('No action plan available until analysis data is loaded.')
  }

  const topRisks: string[] = []
  if (analysis?.technical.macd_signal === 'bearish') {
    topRisks.push('MACD remains bearish, so upside attempts may fail quickly.')
  }
  if (analysis?.statistical.volatility_20d && analysis.statistical.volatility_20d >= 25) {
    topRisks.push(`Volatility is elevated at ${analysis.statistical.volatility_20d.toFixed(1)}%, so swings can be sharp.`)
  }
  if (trend?.monthly.direction === 'down') {
    topRisks.push('Monthly trend is down; counter-trend rallies are lower-conviction.')
  }
  if (sectorData && sectorData.negative_sector_count > sectorData.positive_sector_count) {
    topRisks.push('More sectors are declining than rising, showing weak market breadth.')
  }
  if (topRisks.length === 0) {
    topRisks.push('No critical red flags detected, but continue using phased entries and stop discipline.')
  }

  const stockIdeas = rankStockIdeas(sectorData, stance.stance)

  const summary = `${stance.label}. Composite score ${combinedScore.toFixed(2)} with ${confidence} confidence.`

  return {
    stance: stance.stance,
    stanceLabel: stance.label,
    tone: stance.tone,
    confidence,
    horizon: stance.horizon,
    summary,
    happened,
    meaning,
    actionPlan,
    topRisks,
    checklist,
    readinessScore,
    tradePlan,
    stockIdeas,
    dataCoverage: {
      hasAnalysis,
      hasTrend,
      hasSectors,
    },
  }
}

function indexConvictionScore(index: IndexSnapshot, analysis?: AnalysisResult): number {
  const move = normalizePct(index.change_pct, 2.5)
  const sentiment = analysis?.sentiment_score ?? 0
  return clamp(move * 0.55 + sentiment * 0.45)
}

function convictionNote(conviction: number): string {
  if (conviction > 0.4) return 'trend and momentum aligned'
  if (conviction < -0.4) return 'momentum weak with downside pressure'
  return 'mixed internals, wait for confirmation'
}

export function buildGlobalPulse(params: {
  indices: IndexSnapshot[]
  overview: OverviewResponse | null
  analysisBySymbol: Record<string, AnalysisResult>
}): GlobalPulse | null {
  const { indices, overview, analysisBySymbol } = params
  if (!overview || indices.length === 0) return null

  const total = overview.bullish_count + overview.bearish_count + overview.neutral_count
  const participationPct = total > 0 ? (overview.bullish_count / total) * 100 : 0

  const convictionList = indices
    .map((index) => {
      const conviction = indexConvictionScore(index, analysisBySymbol[index.symbol])
      return {
        index,
        conviction,
      }
    })
    .sort((a, b) => b.conviction - a.conviction)

  const leaders = convictionList.slice(0, 3).map(({ index, conviction }) => ({
    symbol: index.symbol,
    name: index.name,
    movePct: index.change_pct,
    note: convictionNote(conviction),
  }))

  const laggards = convictionList
    .slice()
    .reverse()
    .slice(0, 2)
    .map(({ index, conviction }) => ({
      symbol: index.symbol,
      name: index.name,
      movePct: index.change_pct,
      note: convictionNote(conviction),
    }))

  let tone: StanceTone = 'neutral'
  let headline = 'Global setup is mixed across regions.'
  let beginnerAction = 'Use staggered entries and wait for weekly confirmation before increasing exposure.'

  if (overview.overall_sentiment === 'risk-on') {
    tone = 'up'
    headline = 'Risk appetite is constructive across most tracked indices.'
    beginnerAction = 'For beginners: favor broad index SIP-style entries and avoid chasing one-day spikes.'
  } else if (overview.overall_sentiment === 'risk-off') {
    tone = 'down'
    headline = 'Risk-off behavior is visible; defensive positioning is preferred.'
    beginnerAction = 'Prioritize smaller sizing, tighter risk control, and wait for breadth improvement.'
  }

  const breadthText = `${overview.bullish_count} bullish · ${overview.neutral_count} neutral · ${overview.bearish_count} bearish indices.`

  return {
    tone,
    headline,
    breadthText,
    participationPct,
    beginnerAction,
    leaders,
    laggards,
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function scoreToMoodZone(score: number): IndiaMood['zone'] {
  if (score < 20) return 'Extreme Fear'
  if (score < 40) return 'Fear'
  if (score < 60) return 'Neutral'
  if (score < 80) return 'Greed'
  return 'Extreme Greed'
}

export function buildIndiaMood(params: {
  indices: IndexSnapshot[]
  analysisBySymbol: Record<string, AnalysisResult>
}): IndiaMood | null {
  const INDIA_SYMBOLS = new Set(['NSEI', 'CNX100', 'CNX200', 'NSEBANK'])
  const indiaIndices = params.indices.filter((index) => INDIA_SYMBOLS.has(index.symbol))
  if (indiaIndices.length === 0) return null

  const analyses = indiaIndices
    .map((index) => params.analysisBySymbol[index.symbol])
    .filter((item): item is AnalysisResult => Boolean(item))

  const avgMove = indiaIndices.reduce((sum, index) => sum + index.change_pct, 0) / indiaIndices.length
  const momentum = clamp01((avgMove + 2) / 4) * 100

  const bullishCount = analyses.filter((item) => item.overall_sentiment === 'bullish').length
  const breadth = analyses.length > 0 ? (bullishCount / analyses.length) * 100 : 50

  const volatilityValues = analyses
    .map((item) => item.statistical.volatility_20d)
    .filter((value): value is number => value != null)
  const avgVol =
    volatilityValues.length > 0
      ? volatilityValues.reduce((sum, value) => sum + value, 0) / volatilityValues.length
      : null
  const volatility = avgVol != null ? clamp01((35 - avgVol) / 25) * 100 : 50

  const trendLocals = analyses.map((item) => {
    let points = 0
    if (item.technical.price_vs_sma20 === 'above') points += 1
    if (item.technical.price_vs_sma50 === 'above') points += 1
    if (item.technical.macd_signal === 'bullish') points += 1
    return points / 3
  })
  const trendHealth =
    trendLocals.length > 0
      ? (trendLocals.reduce((sum, value) => sum + value, 0) / trendLocals.length) * 100
      : 50

  const score = Math.round(momentum * 0.3 + breadth * 0.3 + volatility * 0.2 + trendHealth * 0.2)
  const zone = scoreToMoodZone(score)

  let summary = 'India market mood is balanced.'
  let action = 'Take selective setups with strict risk management.'

  if (zone === 'Extreme Greed' || zone === 'Greed') {
    summary = 'India market mood is optimistic with risk appetite present.'
    action = 'Prefer buying pullbacks; avoid chasing extended candles.'
  } else if (zone === 'Extreme Fear' || zone === 'Fear') {
    summary = 'India market mood is risk-averse and fragile.'
    action = 'Protect capital first and wait for breadth improvement before adding exposure.'
  }

  return {
    score,
    zone,
    components: {
      momentum: Math.round(momentum),
      breadth: Math.round(breadth),
      volatility: Math.round(volatility),
      trendHealth: Math.round(trendHealth),
    },
    summary,
    action,
  }
}

export function buildQuickSetup(
  index: IndexSnapshot,
  analysis: AnalysisResult | undefined,
): QuickSetup {
  if (!analysis) {
    return {
      score: 0,
      total: 5,
      status: 'watch',
      highlights: ['Analysis loading.'],
    }
  }

  const checks = [
    index.change_pct > 0,
    analysis.technical.macd_signal === 'bullish',
    analysis.technical.price_vs_sma20 === 'above',
    analysis.technical.rvol_signal !== 'low',
    analysis.technical.rsi_signal !== 'overbought',
  ]
  const labels = [
    index.change_pct > 0 ? 'Index closed green.' : 'Index closed red.',
    analysis.technical.macd_signal === 'bullish' ? 'MACD bullish.' : 'MACD not bullish.',
    analysis.technical.price_vs_sma20 === 'above' ? 'Price above 20DMA.' : 'Price below 20DMA.',
    analysis.technical.rvol_signal !== 'low' ? 'Volume participation healthy.' : 'Low relative volume.',
    analysis.technical.rsi_signal !== 'overbought' ? 'RSI not overheated.' : 'RSI overheated.',
  ]

  const score = checks.filter(Boolean).length
  const status: QuickSetup['status'] = score >= 4 ? 'ready' : score >= 2 ? 'watch' : 'avoid'

  return {
    score,
    total: checks.length,
    status,
    highlights: labels.slice(0, 3),
  }
}
