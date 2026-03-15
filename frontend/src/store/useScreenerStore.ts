import { create } from 'zustand'
import { api } from '../services/api'
import type {
  AvailableField,
  ScreenerCondition,
  ScreenerPreset,
  ScreenerResult,
} from '../types/screener'

let _idCounter = 0
export function newConditionId(): string {
  return `cond_${Date.now()}_${_idCounter++}`
}

// ── 5-minute front-end scan cache ─────────────────────────────────────────────
const SCAN_CACHE_MS = 5 * 60 * 1000
let _cacheKey    = ''
let _cacheTime   = 0
let _cacheResult: ScreenerResult | null = null

function buildCacheKey(
  indexSymbol: string,
  activePresetId: string | null,
  conditions: ScreenerCondition[],
  interval: string,
): string {
  return JSON.stringify({
    i: indexSymbol,
    p: activePresetId,
    v: interval,
    c: conditions.map(({ lhs, op, rhs_value, rhs_field }) => ({ lhs, op, rhs_value, rhs_field })),
  })
}
// ─────────────────────────────────────────────────────────────────────────────

interface ScreenerStore {
  // Metadata
  presets: ScreenerPreset[]
  fields: AvailableField[]
  fieldMap: Record<string, AvailableField>
  operators: Record<string, string>
  metaLoaded: boolean

  // Active criteria
  indexSymbol: string
  activePresetId: string | null
  conditions: ScreenerCondition[]
  interval: string   // "15m" | "1h" | "1d"

  // Results
  results: ScreenerResult | null
  isScanning: boolean
  scanError: string | null
  lastScanAt: number | null     // timestamp of last completed scan (cached or fresh)
  fromCache: boolean            // true when the current results came from the 5-min cache

  // Actions
  loadMeta: () => Promise<void>
  setIndex: (sym: string) => void
  applyPreset: (preset: ScreenerPreset) => void
  clearPreset: () => void
  addCondition: (cond: Omit<ScreenerCondition, 'id'>) => void
  updateCondition: (id: string, patch: Partial<ScreenerCondition>) => void
  removeCondition: (id: string) => void
  clearConditions: () => void
  runScan: () => Promise<void>
}

// Map preset timeframe → data interval for backend
const PRESET_INTERVAL: Record<string, string> = {
  intraday: '15m',
  short:    '1d',
  swing:    '1d',
  medium:   '1d',
  long:     '1d',
}

export const useScreenerStore = create<ScreenerStore>((set, get) => ({
  presets: [],
  fields: [],
  fieldMap: {},
  operators: {},
  metaLoaded: false,
  indexSymbol: 'CNX500',
  activePresetId: null,
  conditions: [],
  interval: '1d',
  results: null,
  isScanning: false,
  scanError: null,
  lastScanAt: null,
  fromCache: false,

  loadMeta: async () => {
    if (get().metaLoaded) return
    try {
      const [presets, fieldsResp] = await Promise.all([
        api.getScreenerPresets(),
        api.getScreenerFields(),
      ])
      const fieldMap: Record<string, AvailableField> = {}
      for (const f of fieldsResp.fields) fieldMap[f.id] = f
      set({ presets, fields: fieldsResp.fields, fieldMap, operators: fieldsResp.operators, metaLoaded: true })
    } catch {
      // non-fatal — UI will show empty state
    }
  },

  setIndex: (sym) => set({ indexSymbol: sym, results: null }),

  applyPreset: (preset) => {
    const conditions = preset.conditions.map((c) => ({ ...c, id: newConditionId() }))
    const interval = PRESET_INTERVAL[preset.timeframe] ?? '1d'
    set({ conditions, activePresetId: preset.id, interval, results: null })
  },

  clearPreset: () => set({ activePresetId: null }),

  addCondition: (cond) => {
    set((s) => ({
      conditions: [...s.conditions, { ...cond, id: newConditionId() }],
      activePresetId: null,
      results: null,
    }))
  },

  updateCondition: (id, patch) => {
    set((s) => ({
      conditions: s.conditions.map((c) => c.id === id ? { ...c, ...patch } : c),
      activePresetId: null,
      results: null,
    }))
  },

  removeCondition: (id) => {
    set((s) => ({
      conditions: s.conditions.filter((c) => c.id !== id),
      activePresetId: null,
      results: null,
    }))
  },

  clearConditions: () => set({ conditions: [], activePresetId: null, results: null }),

  runScan: async () => {
    const { indexSymbol, conditions, activePresetId, interval } = get()
    const key = buildCacheKey(indexSymbol, activePresetId, conditions, interval)
    const now = Date.now()

    // Return cached result if same criteria was scanned within 5 minutes
    if (key === _cacheKey && now - _cacheTime < SCAN_CACHE_MS && _cacheResult) {
      set({ results: _cacheResult, isScanning: false, scanError: null, lastScanAt: _cacheTime, fromCache: true })
      return
    }

    set({ isScanning: true, scanError: null, fromCache: false })
    try {
      const result = await api.runScreenerScan({
        index_symbol: indexSymbol,
        preset_id: activePresetId,
        conditions,
        interval,
      })
      _cacheKey    = key
      _cacheTime   = now
      _cacheResult = result
      set({ results: result, isScanning: false, lastScanAt: now, fromCache: false })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Scan failed'
      set({ isScanning: false, scanError: msg })
    }
  },
}))
