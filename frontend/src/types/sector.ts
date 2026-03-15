// ── Global sector ETF performance ──────────────────────────────────────────

export interface SectorPerformance {
  sector_name: string
  ticker: string
  change_pct: number
  change_pts: number
  is_positive: boolean
}

export interface GlobalSectorSummary {
  trade_date: string
  region: string
  positive_sectors: SectorPerformance[]
  negative_sectors: SectorPerformance[]
  neutral_sectors: SectorPerformance[]
}

// ── Per-stock analysis ──────────────────────────────────────────────────────

export interface StockBreakdown {
  symbol: string
  name: string
  sector: string
  industry: string
  weight: number            // % of index (0–100)
  daily_change_pct: number  // vs previous close
  contribution_pct: number  // weight × change / 100
  last_close: number
  prev_close: number
  is_positive: boolean
  above_sma200?: boolean | null
}

// ── Sector-level aggregation ────────────────────────────────────────────────

export interface SectorBreakdown {
  sector: string
  weight: number            // total sector weight in index
  daily_change_pct: number  // weighted-average daily change
  contribution_pct: number  // total sector contribution to index move
  stock_count: number
  analyzed_count: number
  top_gainers: StockBreakdown[]  // top 3
  top_losers: StockBreakdown[]   // bottom 3
  stocks: StockBreakdown[]       // all stocks, sorted by weight desc
}

// ── Index-level response ────────────────────────────────────────────────────

export interface IndexSectorAnalysis {
  index_symbol: string
  index_name: string
  proxy_etf: string
  trade_date: string
  data_source: string
  total_constituents: number
  analyzed_constituents: number
  sectors: SectorBreakdown[]    // sorted by weight desc
  sector_count: number
  top_gainers: StockBreakdown[] // top 5 across all sectors
  top_losers: StockBreakdown[]  // bottom 5 across all sectors
  positive_sector_count: number
  negative_sector_count: number
  pct_above_sma200?: number | null  // % of constituents above 200-day SMA
}
