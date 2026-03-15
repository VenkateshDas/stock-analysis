export interface OHLCVBar {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface IndexSnapshot {
  symbol: string
  name: string
  currency: string
  timezone: string
  note: string
  tradingview_url: string
  last_close: number
  prev_close: number
  open: number
  high: number
  low: number
  volume: number
  change_pts: number
  change_pct: number
  trade_date: string
  prev_trade_date?: string | null
  last_updated: string
  spark_closes: number[]
  spark_dates: string[]
}

export interface CPRBar {
  pp: number         // Pivot Point
  tc: number         // Top Central Pivot (raw; may be below BC in bearish sessions)
  bc: number         // Bottom Central Pivot
  cpr_low: number    // min(tc, bc) — lower bound of CPR zone
  cpr_high: number   // max(tc, bc) — upper bound of CPR zone
  r1: number         // Resistance 1
  r2: number         // Resistance 2
  r3: number         // Resistance 3
  s1: number         // Support 1
  s2: number         // Support 2
  s3: number         // Support 3
  width_pct: number  // (cpr_high - cpr_low) / PP * 100 — always non-negative
  width_signal: 'narrow' | 'moderate' | 'wide'
  is_virgin: boolean // true if current session never touched the CPR zone
}

export interface HistoryResponse {
  symbol: string
  bars: OHLCVBar[]
  sma20: (number | null)[]
  sma50: (number | null)[]
  sma200: (number | null)[]
  cpr: (CPRBar | null)[]
}

export interface MACDData {
  macd: number | null
  signal: number | null
  histogram: number | null
}

export interface BollingerData {
  upper: number | null
  middle: number | null
  lower: number | null
  percent_b: number | null
}

export interface TechnicalIndicators {
  rsi: number | null
  rsi_signal: 'overbought' | 'oversold' | 'neutral'
  macd: MACDData
  macd_signal: 'bullish' | 'bearish' | 'neutral'
  bollinger: BollingerData
  bb_signal: 'above_upper' | 'below_lower' | 'near_upper' | 'near_lower' | 'middle'
  adx: number | null
  adx_signal: 'strong_trend' | 'moderate_trend' | 'weak_trend' | 'no_trend'
  plus_di: number | null
  minus_di: number | null
  sma20: number | null
  sma50: number | null
  sma200: number | null
  price_vs_sma20: 'above' | 'below'
  price_vs_sma50: 'above' | 'below'
  price_vs_sma200: 'above' | 'below'
  ema20: number | null
  ema50: number | null
  ema200: number | null
  ema_cross: 'bullish' | 'bearish' | 'neutral'
  atr: number | null
  atr_pct: number | null
  obv: number | null
  obv_trend: 'rising' | 'falling' | 'flat'
  rvol: number | null
  rvol_signal: 'high' | 'normal' | 'low'
}

export interface MonthlyContribution {
  month: string
  year: number
  overnight_pct: number
  intraday_pct: number
}

export interface StatisticalMetrics {
  daily_return_pct: number | null
  weekly_return_pct: number | null
  monthly_return_pct: number | null
  roc_3m_pct: number | null
  roc_6m_pct: number | null
  yearly_return_pct: number | null
  ytd_return_pct: number | null
  week52_high: number | null
  week52_low: number | null
  pct_from_52w_high: number | null
  pct_from_52w_low: number | null
  current_drawdown_pct: number | null
  max_drawdown_ytd_pct: number | null
  volatility_20d: number | null
  daily_range: number | null
  daily_range_pct: number | null
  atr_ratio: number | null
  avg_daily_range_pts: number | null
  avg_daily_range_pct: number | null
  avg_weekly_range_pts: number | null
  avg_weekly_range_pct: number | null
  overnight_intraday: MonthlyContribution[] | null
}

export interface MarketRegimeResult {
  regime: 'bull_trending' | 'bear_trending' | 'consolidating' | 'volatile'
  phase: 'early' | 'mid' | 'late'
  daily_bias: 'bullish' | 'bearish' | 'neutral'
  confidence: number
  action_bias: 'buy_dips' | 'sell_rallies' | 'wait' | 'breakout_watch'
  key_support: number | null
  key_resistance: number | null
  drivers: string[]
  caution: string[]
}

export interface TradeSetup {
  symbol: string
  name: string
  direction: 'long' | 'short'
  setup_type: 'momentum' | 'pullback' | 'breakout'
  quality: 'A' | 'B' | 'C'
  entry_price: number
  stop_loss: number
  target: number
  risk_reward: number
  reasons: string[]
  risks: string[]
  weight_in_index: number
  sector: string
  relative_return_1m: number
}

export interface AnalysisResult {
  symbol: string
  trade_date: string
  last_close: number
  currency: string
  technical: TechnicalIndicators
  statistical: StatisticalMetrics
  overall_sentiment: 'bullish' | 'bearish' | 'neutral'
  sentiment_score: number
  regime: MarketRegimeResult | null
}

export interface TimeframeTrend {
  timeframe: 'daily' | 'weekly' | 'monthly' | 'yearly'
  window_label: string
  window_bars: number

  direction: 'up' | 'down' | 'flat'
  strength: 'strong' | 'moderate' | 'weak'
  trend_label:
    | 'strong_uptrend'
    | 'uptrend'
    | 'weak_uptrend'
    | 'flat'
    | 'weak_downtrend'
    | 'downtrend'
    | 'strong_downtrend'
  trend_score: number  // -1.0 to +1.0

  slope_pct_per_bar: number | null
  regression_start: number | null
  regression_end: number | null
  r_squared: number | null
  total_return_pct: number | null

  mk_tau: number | null
  mk_pvalue: number | null
  trend_significant: boolean

  hurst_exponent: number | null   // yearly only
  persistence: 'trending' | 'random' | 'mean_reverting' | null

  next_period_forecast: number | null
  forecast_change_pct: number | null
  forecast_reliability: 'high' | 'moderate' | 'low' | 'unavailable'
}

export interface MultiTimeframeTrend {
  symbol: string
  trade_date: string
  daily: TimeframeTrend
  weekly: TimeframeTrend
  monthly: TimeframeTrend
  yearly: TimeframeTrend
}

export interface LLMSummary {
  symbol: string
  trade_date: string
  commentary: string
  model_used: string
  generated_at: string
}

export interface MacroTicker {
  key: string
  label: string
  value: number | null
  change_1w_pct: number | null
  change_1m_pct: number | null
  change_3m_pct: number | null
  direction: 'rising' | 'falling' | 'flat'
  context: string
}

export interface MacroSnapshot {
  trade_date: string
  tickers: MacroTicker[]
}

export interface ValuationMetrics {
  symbol: string
  trade_date: string
  trailing_pe: number | null
  forward_pe: number | null
  price_to_book: number | null
  dividend_yield: number | null    // already in % (e.g. 1.8 means 1.8%)
  earnings_yield: number | null    // %
  equity_risk_premium: number | null  // %
  historical_pe_avg: number | null
  pe_signal: 'cheap' | 'fair' | 'stretched' | 'expensive' | 'unavailable'
  data_source: string
}

export interface StockFundamentals {
  ticker: string
  trade_date: string
  trailing_pe: number | null
  forward_pe: number | null
  price_to_book: number | null
  ev_to_ebitda: number | null
  earnings_growth: number | null    // % (e.g. 15.0 = 15%)
  revenue_growth: number | null     // %
  return_on_equity: number | null   // %
  profit_margins: number | null     // %
  debt_to_equity: number | null
  current_ratio: number | null
  dividend_yield: number | null     // % (e.g. 1.8 = 1.8%)
  payout_ratio: number | null       // %
  beta: number | null
  market_cap: number | null
  currency: string
}

export interface OverviewResponse {
  trade_date: string
  bullish_count: number
  bearish_count: number
  neutral_count: number
  overall_sentiment: string
  indices_sentiment: Record<string, string>
}

export interface PCRResult {
  proxy_ticker: string
  is_thin_market: boolean
  expiry_count: number
  near_expiry_count: number
  pcr_volume: number | null
  put_volume: number | null
  call_volume: number | null
  vol_signal: 'complacent' | 'neutral' | 'fearful' | 'unavailable'
  pcr_oi: number
  put_oi: number
  call_oi: number
  oi_signal: 'call_dominant' | 'neutral' | 'heavy_hedging'
  overall_signal: 'contrarian_bullish' | 'neutral' | 'contrarian_bearish'
  signal_label: string
}

export interface GapInfo {
  prev_close: number
  open_price: number
  gap_pts: number
  gap_pct: number
  gap_type: 'GAP_UP' | 'GAP_DOWN' | 'FLAT'
}

export interface OHOLSignal {
  signal: 'OPEN_HIGH' | 'OPEN_LOW' | 'NONE' | 'DOJI' | 'UNAVAILABLE'
  session_date: string | null
  window_minutes: number | null
  bars_used: number | null
  candle_open: number | null
  candle_high: number | null
  candle_low: number | null
  candle_close: number | null
  candle_time: string | null
  entry_trigger_long: number | null
  entry_trigger_short: number | null
  data_source: string
}

export interface HistoricalGapDay {
  date: string
  gap_pct: number
  gap_type: string
}

export interface OpeningRangeResult {
  symbol: string
  trade_date: string
  gap: GapInfo
  ohol: OHOLSignal
  ohol_current?: OHOLSignal | null
  ohol_previous?: OHOLSignal | null
  historical_gaps: HistoricalGapDay[]
  gap_up_pct: number
  gap_down_pct: number
  avg_gap_pct: number
  note: string
}
