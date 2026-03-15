import { create } from 'zustand'
import { api } from '../services/api'
import type { PaperTradeCreate, PaperTradeLiveStatus } from '../types/paper_trade'

interface PaperTradeStore {
  trades: PaperTradeLiveStatus[]
  virtualCapital: number
  isLoading: boolean
  error: string | null

  loadTrades: () => Promise<void>
  loadSettings: () => Promise<void>
  setVirtualCapital: (capital: number) => Promise<void>
  createTrade: (body: PaperTradeCreate) => Promise<void>
  closeTrade: (id: string, exitPrice: number) => Promise<void>
  deleteTrade: (id: string) => Promise<void>
}

export const usePaperTradeStore = create<PaperTradeStore>((set, get) => ({
  trades: [],
  virtualCapital: 100000,
  isLoading: false,
  error: null,

  loadSettings: async () => {
    try {
      const s = await api.getPaperTradeSettings()
      set({ virtualCapital: s.virtual_capital })
    } catch {
      // non-fatal
    }
  },

  setVirtualCapital: async (capital) => {
    try {
      const s = await api.updatePaperTradeSettings(capital)
      set({ virtualCapital: s.virtual_capital })
    } catch {
      // non-fatal
    }
  },

  loadTrades: async () => {
    set({ isLoading: true, error: null })
    try {
      const trades = await api.listPaperTrades()
      set({ trades, isLoading: false })
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to load trades' })
    }
  },

  createTrade: async (body) => {
    const newTrade = await api.createPaperTrade(body)
    set((s) => ({ trades: [newTrade, ...s.trades] }))
  },

  closeTrade: async (id, exitPrice) => {
    await api.closePaperTrade(id, exitPrice)
    await get().loadTrades()
  },

  deleteTrade: async (id) => {
    await api.deletePaperTrade(id)
    set((s) => ({ trades: s.trades.filter((t) => t.trade.id !== id) }))
  },
}))
