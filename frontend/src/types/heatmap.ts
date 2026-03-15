export interface HeatmapStock {
  symbol: string
  name: string
  sector: string
  industry: string
  weight: number
  price: number | null
  change_pct: number | null
}

export interface HeatmapSector {
  name: string
  total_weight: number
  stocks: HeatmapStock[]
}

export interface HeatmapData {
  index_symbol: string
  timestamp: string
  sectors: HeatmapSector[]
}
