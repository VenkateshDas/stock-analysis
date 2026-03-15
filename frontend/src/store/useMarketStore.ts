import { create } from 'zustand'
import type {
  IndexSnapshot,
  AnalysisResult,
  LLMSummary,
  OverviewResponse,
  MultiTimeframeTrend,
  TradeSetup,
  MacroSnapshot,
  ValuationMetrics,
} from '../types/market'
import { api } from '../services/api'

interface MarketState {
  indices: IndexSnapshot[]
  indicesLoading: boolean
  indicesError: string | null

  selectedSymbol: string | null
  analysis: Record<string, AnalysisResult>
  analysisLoading: Record<string, boolean>
  summaries: Record<string, LLMSummary>
  summaryLoading: Record<string, boolean>
  trends: Record<string, MultiTimeframeTrend>
  trendLoading: Record<string, boolean>
  overview: OverviewResponse | null
  opportunities: Record<string, TradeSetup[]>
  opportunitiesLoading: Record<string, boolean>
  macro: MacroSnapshot | null
  macroLoading: boolean
  valuations: Record<string, ValuationMetrics>
  valuationLoading: Record<string, boolean>

  lastRefresh: Date | null

  fetchIndices: () => Promise<void>
  fetchAnalysis: (symbol: string) => Promise<void>
  fetchSummary: (symbol: string) => Promise<void>
  fetchTrend: (symbol: string) => Promise<void>
  fetchOverview: () => Promise<void>
  fetchOpportunities: (symbol: string) => Promise<void>
  fetchMacro: () => Promise<void>
  fetchValuation: (symbol: string) => Promise<void>
  refreshAll: () => Promise<void>
  setSelectedSymbol: (symbol: string | null) => void
}

export const useMarketStore = create<MarketState>((set, get) => ({
  indices: [],
  indicesLoading: false,
  indicesError: null,
  selectedSymbol: null,
  analysis: {},
  analysisLoading: {},
  summaries: {},
  summaryLoading: {},
  trends: {},
  trendLoading: {},
  overview: null,
  opportunities: {},
  opportunitiesLoading: {},
  macro: null,
  macroLoading: false,
  valuations: {},
  valuationLoading: {},
  lastRefresh: null,

  fetchIndices: async () => {
    set({ indicesLoading: true, indicesError: null })
    try {
      const data = await api.getIndices()
      set({ indices: data, indicesLoading: false, lastRefresh: new Date() })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch market data'
      set({ indicesError: msg, indicesLoading: false })
    }
  },

  fetchAnalysis: async (symbol: string) => {
    set((s) => ({ analysisLoading: { ...s.analysisLoading, [symbol]: true } }))
    try {
      const data = await api.getAnalysis(symbol)
      set((s) => ({
        analysis: { ...s.analysis, [symbol]: data },
        analysisLoading: { ...s.analysisLoading, [symbol]: false },
      }))
    } catch {
      set((s) => ({ analysisLoading: { ...s.analysisLoading, [symbol]: false } }))
    }
  },

  fetchSummary: async (symbol: string) => {
    set((s) => ({ summaryLoading: { ...s.summaryLoading, [symbol]: true } }))
    try {
      const data = await api.getSummary(symbol)
      set((s) => ({
        summaries: { ...s.summaries, [symbol]: data },
        summaryLoading: { ...s.summaryLoading, [symbol]: false },
      }))
    } catch {
      set((s) => ({ summaryLoading: { ...s.summaryLoading, [symbol]: false } }))
    }
  },

  fetchTrend: async (symbol: string) => {
    set((s) => ({ trendLoading: { ...s.trendLoading, [symbol]: true } }))
    try {
      const data = await api.getTrend(symbol)
      set((s) => ({
        trends: { ...s.trends, [symbol]: data },
        trendLoading: { ...s.trendLoading, [symbol]: false },
      }))
    } catch {
      set((s) => ({ trendLoading: { ...s.trendLoading, [symbol]: false } }))
    }
  },

  fetchOpportunities: async (symbol: string) => {
    set((s) => ({ opportunitiesLoading: { ...s.opportunitiesLoading, [symbol]: true } }))
    try {
      const data = await api.getOpportunities(symbol)
      set((s) => ({
        opportunities: { ...s.opportunities, [symbol]: data },
        opportunitiesLoading: { ...s.opportunitiesLoading, [symbol]: false },
      }))
    } catch {
      set((s) => ({ opportunitiesLoading: { ...s.opportunitiesLoading, [symbol]: false } }))
    }
  },

  fetchOverview: async () => {
    try {
      const data = await api.getOverview()
      set({ overview: data })
    } catch {
      // non-critical
    }
  },

  fetchMacro: async () => {
    set({ macroLoading: true })
    try {
      const data = await api.getMacro()
      set({ macro: data, macroLoading: false })
    } catch {
      set({ macroLoading: false })
    }
  },

  fetchValuation: async (symbol: string) => {
    set((s) => ({ valuationLoading: { ...s.valuationLoading, [symbol]: true } }))
    try {
      const data = await api.getValuation(symbol)
      set((s) => ({
        valuations: { ...s.valuations, [symbol]: data },
        valuationLoading: { ...s.valuationLoading, [symbol]: false },
      }))
    } catch {
      set((s) => ({ valuationLoading: { ...s.valuationLoading, [symbol]: false } }))
    }
  },

  refreshAll: async () => {
    await api.refresh()
    const state = get()
    await state.fetchIndices()
    await state.fetchOverview()
    // Re-fetch analysis for currently selected symbol
    if (state.selectedSymbol) {
      await state.fetchAnalysis(state.selectedSymbol)
    }
  },

  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
}))
