export interface StrategyConfig {
  strategy_id: string
  name: string
  version: string
  description: string
  instrument: string
  parameters: Record<string, unknown>
  enabled: boolean
  algo_id: string
  created_at: string
}

export interface BacktestConfig {
  symbol: string
  timeframe: string
  start_date: string
  end_date: string
  initial_capital: number
  commission_pct: number
  slippage_pct: number
  strategy_id: string
  session_start: string
  session_end: string
  // Strategy-tunable params — must be passed so engine uses them
  opening_range_end: string
  target_rr: number
  ema_fast: number
  ema_slow: number
  volume_mult: number
}

export interface RiskConfig {
  capital: number
  per_trade_risk_pct: number
  daily_loss_cap_pct: number
  max_open_positions: number
  max_trades_per_day: number
  cooldown_after_losses: number
  expiry_position_size_multiplier: number
  expiry_stop_multiplier: number
}

export interface BacktestReport {
  run_id: string
  strategy_id: string
  symbol: string
  start_date: string
  end_date: string
  total_trades: number
  win_rate: number
  net_pnl: number
  max_drawdown_pct: number
  sharpe: number
  sortino: number
  profit_factor: number
  cagr_pct: number
  promotion_pass: boolean
  promotion_notes: string
}

export interface BacktestRunStatus {
  run_id: string
  status: string
  created_at: string
  completed_at?: string | null
  report?: BacktestReport | null
}

export interface BacktestTrade {
  run_id: string
  symbol: string
  side: string
  entry_time: string
  entry_price: number
  exit_time: string
  exit_price: number
  qty: number
  pnl: number
  pnl_pct: number
}

export interface EquityPoint {
  run_id: string
  timestamp: string
  equity: number
}

export interface SignalEvent {
  signal_id: string
  strategy_id: string
  symbol: string
  signal_type: string
  confidence: number
  price: number
  timestamp: string
  reason: string
}

export interface OrderIntent {
  intent_id: string
  algo_id: string
  strategy_version: string
  signal_id: string
  symbol: string
  side: string
  quantity: number
  order_type: string
  status: string
  created_at: string
  approved_at?: string | null
}

export interface RiskStatus {
  date: string
  capital: number
  daily_loss_used_pct: number
  trades_taken: number
  max_trades_per_day: number
  open_positions: number
  max_open_positions: number
}

export interface KiteStatus {
  connected: boolean
  profile_name: string | null
  available_margin: number | null
  has_credentials: boolean
  masked_api_key: string | null
}

export interface BotStatus {
  is_running: boolean
  mode: string
  today_trades: number
  today_pnl: number
  risk_used_pct: number
}

export interface BotSettings {
  mode: string
  capital: number
  risk_config: RiskConfig
  api_key?: string | null
  api_secret?: string | null
}

export interface LivePosition {
  symbol: string
  qty: number
  avg_price: number
  last_price: number
  unrealized_pnl: number
  product: string
}

export interface StrategySuggestion {
  parameter: string
  label: string
  current_value: string | number
  suggested_value: string | number
  plain_reason: string
}

export interface StrategyImprovementResponse {
  run_id: string
  assessment: string
  confidence: 'low' | 'medium' | 'high'
  suggestions: StrategySuggestion[]
  improved_params: Record<string, unknown>
  model_used: string
  generated_at: string
}

export interface LiveOrder {
  order_id: string
  symbol: string
  side: string
  qty: number
  order_type: string
  status: string
  placed_at: string
}

export interface StrategyBlueprintRequest {
  symbol: string
  experience_level: 'beginner' | 'intermediate' | 'advanced'
  risk_level: 'low' | 'medium' | 'high'
  objective: string
}

export interface StrategyBlueprintResponse {
  summary: string
  confidence: 'low' | 'medium' | 'high'
  suggested_name: string
  suggested_description: string
  suggested_params: Record<string, unknown>
  notes: string[]
  model_used: string
  generated_at: string
}
