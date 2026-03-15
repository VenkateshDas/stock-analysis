export type TradeStatus =
  | 'OPEN'
  | 'TARGET_HIT'
  | 'STOP_HIT'
  | 'TREND_EXIT'
  | 'TIME_STOP'
  | 'CLOSED'

export interface ExitAlert {
  type: 'stop_hit' | 'partial_target' | 'target_hit' | 'trend_exit' | 'time_stop'
  severity: 'danger' | 'success' | 'warning' | 'info'
  message: string
}

export interface PaperTrade {
  id: string
  symbol: string
  company_name: string
  sector: string
  strategy: string
  entry_price: number
  stop_price: number
  target_price: number
  atr: number
  shares: number
  virtual_capital: number
  entry_date: string
  notes: string | null
  status: TradeStatus
  exit_price: number | null
  exit_date: string | null
  created_at: string
}

export interface PaperTradeLiveStatus {
  trade: PaperTrade
  current_price: number | null
  current_pnl: number | null
  current_pnl_pct: number | null
  r_multiple: number | null
  progress_to_target_pct: number | null
  days_open: number
  alerts: ExitAlert[]
  ema20: number | null
  ema50: number | null
}

export interface PaperTradeCreate {
  symbol: string
  company_name: string
  sector: string
  strategy: string
  entry_price: number
  stop_price: number
  target_price: number
  atr: number
  notes?: string
  virtual_capital: number
}

export interface PositionSizingResult {
  virtual_capital: number
  risk_pct: number
  risk_amount: number
  entry_price: number
  stop_price: number
  target_price: number
  stop_distance: number
  target_distance: number
  risk_reward: number
  shares: number
  capital_needed: number
  capital_pct: number
  max_loss: number
  max_gain: number
}
