export type ConditionOp = 'gt' | 'lt' | 'gte' | 'lte' | 'eq'

export interface ScreenerCondition {
  id: string                        // client-side uuid for React key
  lhs: string                       // field id, e.g. "ema20"
  op: ConditionOp
  rhs_value: number | null          // compare to constant
  rhs_field: string | null          // compare to another field
}

export interface ScreenerCriteria {
  index_symbol: string
  preset_id: string | null
  conditions: ScreenerCondition[]
  interval?: string   // "15m" | "1h" | "1d" — omit for daily (default)
}

export interface ScreenerRow {
  symbol: string
  name: string
  sector: string
  price: number
  open_price: number | null
  change: number | null
  change_pct: number | null
  volume: number | null
  market_cap_cr: number | null
  market_cap_b: number | null
  pe_ratio: number | null
  ema20: number | null
  ema50: number | null
  ema200: number | null
  sma50: number | null
  sma200: number | null
  rsi: number | null
  adx: number | null
  macd: number | null
  rvol: number | null
  atr: number | null
  atr_pct: number | null
  score: number
  total_conditions: number
  matched: string[]
  quality: 'A' | 'B' | 'C'
}

export interface ScreenerResult {
  index_symbol: string
  preset_id: string | null
  total_scanned: number
  total_matched: number
  rows: ScreenerRow[]
  scanned_at: string
}

export interface ScreenerPreset {
  id: string
  name: string
  timeframe: 'intraday' | 'swing' | 'medium' | 'long' | 'short'
  category?: 'Trend Following' | 'Mean Reversion' | 'Hybrid'
  description: string
  conditions: ScreenerCondition[]
  filter_chips: string[]
}

export interface AvailableField {
  id: string
  label: string
  group: string
  price_like: boolean
}

export interface ScreenerFieldsResponse {
  fields: AvailableField[]
  operators: Record<string, string>  // op_id → symbol
}
