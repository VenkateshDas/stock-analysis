import axios from 'axios'
import type {
  IndexSnapshot,
  HistoryResponse,
  AnalysisResult,
  LLMSummary,
  OverviewResponse,
  MultiTimeframeTrend,
  OpeningRangeResult,
  PCRResult,
  TradeSetup,
  MacroSnapshot,
  MacroTickerDetail,
  ValuationMetrics,
  StockFundamentals,
} from '../types/market'
import type {
  GlobalSectorSummary,
  IndexSectorAnalysis,
} from '../types/sector'
import type { ScreenerCriteria, ScreenerFieldsResponse, ScreenerPreset, ScreenerResult } from '../types/screener'
import type { HeatmapData } from '../types/heatmap'
import type { PaperTradeCreate, PaperTradeLiveStatus, PaperTrade, PositionSizingResult, TradeProjection } from '../types/paper_trade'
import type {
  BacktestConfig,
  BacktestRunStatus,
  BacktestTrade,
  BotSettings,
  BotStatus,
  EquityPoint,
  KiteStatus,
  LiveOrder,
  LivePosition,
  OrderIntent,
  RiskConfig,
  RiskStatus,
  StrategyConfig,
  StrategyBlueprintRequest,
  StrategyBlueprintResponse,
  StrategyImprovementResponse,
} from '../types/bot'

const client = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('auth_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

export const api = {
  getIndices: () =>
    client.get<IndexSnapshot[]>('/indices').then((r) => r.data),

  getIndex: (symbol: string) =>
    client.get<IndexSnapshot>(`/indices/${symbol}`).then((r) => r.data),

  getHistory: (symbol: string, interval: '1d' | '1h' | '15m' | '5m' = '1d') =>
    client.get<HistoryResponse>(`/indices/${symbol}/history`, { params: { interval } }).then((r) => r.data),

  getStock: (ticker: string) =>
    client.get<IndexSnapshot>(`/stocks/${ticker}`).then((r) => r.data),

  getStockHistory: (ticker: string, interval: '1d' | '1h' | '15m' | '5m' = '1d') =>
    client.get<HistoryResponse>(`/stocks/${ticker}/history`, { params: { interval } }).then((r) => r.data),

  getAnalysis: (symbol: string) =>
    client.get<AnalysisResult>(`/indices/${symbol}/analysis`).then((r) => r.data),

  getStockAnalysis: (ticker: string) =>
    client.get<AnalysisResult>(`/stocks/${ticker}/analysis`).then((r) => r.data),

  getSummary: (symbol: string) =>
    client.get<LLMSummary>(`/indices/${symbol}/summary`).then((r) => r.data),

  getStockSummary: (ticker: string) =>
    client.get<LLMSummary>(`/stocks/${ticker}/summary`).then((r) => r.data),

  getTrend: (symbol: string) =>
    client.get<MultiTimeframeTrend>(`/indices/${symbol}/trend`).then((r) => r.data),

  getStockTrend: (ticker: string) =>
    client.get<MultiTimeframeTrend>(`/stocks/${ticker}/trend`).then((r) => r.data),

  getOverview: () =>
    client.get<OverviewResponse>('/overview').then((r) => r.data),

  refresh: () =>
    client.get<{ status: string; message: string }>('/refresh').then((r) => r.data),

  getOpeningRange: (symbol: string) =>
    client.get<OpeningRangeResult>(`/indices/${symbol}/opening-range`).then((r) => r.data),

  getStockOpeningRange: (ticker: string) =>
    client.get<OpeningRangeResult>(`/stocks/${ticker}/opening-range`).then((r) => r.data),

  getPCR: (symbol: string) =>
    client.get<PCRResult>(`/indices/${symbol}/pcr`).then((r) => r.status === 204 ? null : r.data),

  getStockPCR: (ticker: string) =>
    client.get<PCRResult>(`/stocks/${ticker}/pcr`).then((r) => r.status === 204 ? null : r.data),

  // Sector Analysis
  getGlobalSectors: (region: string) =>
    client.get<GlobalSectorSummary>(`/sectors/global/${region}`).then((r) => r.data),

  getIndexSectors: (symbol: string) =>
    client.get<IndexSectorAnalysis>(`/sectors/index/${symbol}`, { timeout: 90000 }).then((r) => r.data),

  getAllIndexSectors: () =>
    client.get<IndexSectorAnalysis[]>('/sectors/all', { timeout: 120000 }).then((r) => r.data),

  getHeatmap: (symbol: string) =>
    client.get<HeatmapData>(`/indices/${symbol}/heatmap`, { timeout: 60000 }).then((r) => r.data),

  registerStrategy: (config: StrategyConfig) =>
    client.post<{ status: string; strategy_id: string }>('/bot/strategies/register', { config }).then((r) => r.data),

  getStrategies: () =>
    client.get<StrategyConfig[]>('/bot/strategies').then((r) => r.data),

  runBacktest: (config: BacktestConfig, risk: RiskConfig) =>
    client.post<BacktestRunStatus>('/bot/backtests/run', { config, risk }).then((r) => r.data),

  getBacktest: (runId: string) =>
    client.get<BacktestRunStatus>(`/bot/backtests/${runId}`).then((r) => r.data),

  getBacktestTrades: (runId: string) =>
    client.get<BacktestTrade[]>(`/bot/backtests/${runId}/trades`).then((r) => r.data),

  getBacktestEquity: (runId: string) =>
    client.get<EquityPoint[]>(`/bot/backtests/${runId}/equity`).then((r) => r.data),

  improveStrategy: (runId: string) =>
    client.post<StrategyImprovementResponse>(`/bot/backtests/${runId}/improve`).then((r) => r.data),

  getStrategyBlueprint: (payload: StrategyBlueprintRequest) =>
    client.post<StrategyBlueprintResponse>('/bot/strategies/blueprint', payload).then((r) => r.data),

  runSignals: (strategy_id: string, symbol: string) =>
    client.post('/bot/signals/run', { strategy_id, symbol }).then((r) => r.data),

  getSignals: (date: string) =>
    client.get('/bot/signals', { params: { date } }).then((r) => r.data),

  approveOrder: (intent_id: string, approved: boolean) =>
    client.post('/bot/orders/approve', { intent_id, approved }).then((r) => r.data),

  getRiskStatus: () =>
    client.get<RiskStatus>('/bot/risk/status').then((r) => r.data),

  getAuditEvents: (date: string) =>
    client.get(`/bot/audit/${date}`).then((r) => r.data),

  // Kite OAuth
  saveKiteCredentials: (apiKey: string, apiSecret: string) =>
    client.post('/bot/kite/credentials', { api_key: apiKey, api_secret: apiSecret }).then((r) => r.data),

  getKiteLoginUrl: () =>
    client.get<{ login_url: string }>('/bot/kite/login-url').then((r) => r.data),

  kiteCallback: (apiKey: string, apiSecret: string, requestToken: string) =>
    client.post('/bot/kite/callback', { api_key: apiKey, api_secret: apiSecret, request_token: requestToken }).then((r) => r.data),

  getKiteStatus: () =>
    client.get<KiteStatus>('/bot/kite/status').then((r) => r.data),

  kiteDisconnect: () =>
    client.post('/bot/kite/disconnect').then((r) => r.data),

  // Bot status & controls
  getBotStatus: () =>
    client.get<BotStatus>('/bot/status').then((r) => r.data),

  toggleBot: (enabled: boolean) =>
    client.post('/bot/toggle', { enabled }).then((r) => r.data),

  // Settings
  getBotSettings: () =>
    client.get<BotSettings>('/bot/settings').then((r) => r.data),

  saveBotSettings: (settings: BotSettings) =>
    client.post('/bot/settings', settings).then((r) => r.data),

  // Order execution
  executeOrder: (intentId: string) =>
    client.post(`/bot/orders/${intentId}/execute`).then((r) => r.data),

  getPendingIntents: () =>
    client.get<OrderIntent[]>('/bot/orders/pending').then((r) => r.data),

  getOpportunities: (symbol: string) =>
    client.get<TradeSetup[]>(`/indices/${symbol}/opportunities`).then((r) => r.data),

  // Screener
  getScreenerPresets: () =>
    client.get<ScreenerPreset[]>('/screener/presets').then((r) => r.data),

  getScreenerFields: () =>
    client.get<ScreenerFieldsResponse>('/screener/fields').then((r) => r.data),

  runScreenerScan: (criteria: ScreenerCriteria) =>
    client.post<ScreenerResult>('/screener/scan', criteria, { timeout: 120000 }).then((r) => r.data),

  // Live trading
  getLivePositions: () =>
    client.get<LivePosition[]>('/bot/live/positions').then((r) => r.data),

  getLiveOrdersToday: () =>
    client.get<LiveOrder[]>('/bot/live/orders').then((r) => r.data),

  // Paper Trades
  getPaperTradeSettings: () =>
    client.get<{ virtual_capital: number }>('/paper-trades/settings').then((r) => r.data),

  updatePaperTradeSettings: (virtual_capital: number) =>
    client.put<{ virtual_capital: number }>('/paper-trades/settings', { virtual_capital }).then((r) => r.data),

  getPaperTradeSizing: (entry: number, stop: number, target: number, capital?: number) =>
    client.get<PositionSizingResult>('/paper-trades/sizing', {
      params: { entry_price: entry, stop_price: stop, target_price: target, virtual_capital: capital },
    }).then((r) => r.data),

  createPaperTrade: (body: PaperTradeCreate) =>
    client.post<PaperTradeLiveStatus>('/paper-trades', body).then((r) => r.data),

  listPaperTrades: (openOnly = false) =>
    client.get<PaperTradeLiveStatus[]>('/paper-trades', { params: { open_only: openOnly } }).then((r) => r.data),

  closePaperTrade: (id: string, exit_price: number) =>
    client.put<PaperTrade>(`/paper-trades/${id}/close`, { exit_price }).then((r) => r.data),

  deletePaperTrade: (id: string) =>
    client.delete(`/paper-trades/${id}`).then((r) => r.data),

  getTradeProjection: (ticker: string, entry_price: number, stop_price: number, target_price: number, entry_date?: string) =>
    client.get<TradeProjection>('/paper-trades/projection', {
      params: { ticker, entry_price, stop_price, target_price, entry_date },
    }).then((r) => r.data),

  getMacro: () =>
    client.get<MacroSnapshot>('/macro').then((r) => r.data),

  getMacroDetail: (key: string) =>
    client.get<MacroTickerDetail>(`/macro/${key}`).then((r) => r.data),

  getValuation: (symbol: string) =>
    client.get<ValuationMetrics>(`/indices/${symbol}/valuation`).then((r) => r.data),

  getStockFundamentals: (ticker: string) =>
    client.get<StockFundamentals>(`/stocks/${ticker}/fundamentals`).then((r) => r.data),

  // Auth
  login: (username: string, password: string) =>
    client.post<{ access_token: string; token_type: string }>('/auth/login', { username, password }).then((r) => r.data),

  signup: (username: string, password: string, invite_code = '') =>
    client.post<{ access_token: string; token_type: string }>('/auth/signup', { username, password, invite_code }).then((r) => r.data),

  getMe: () =>
    client.get<{ username: string; id: string }>('/auth/me').then((r) => r.data),
}
