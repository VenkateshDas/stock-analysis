import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'
import { ConnectionCard } from '../components/bot/ConnectionCard'
import { EquityChart } from '../components/bot/EquityChart'
import { RiskGauge } from '../components/bot/RiskGauge'
import { SignalCard } from '../components/bot/SignalCard'
import type {
  BacktestRunStatus,
  BacktestTrade,
  BotStatus,
  EquityPoint,
  KiteStatus,
  LiveOrder,
  LivePosition,
  OrderIntent,
  RiskConfig,
  SignalEvent,
  StrategyBlueprintResponse,
  StrategyConfig,
  StrategyImprovementResponse,
} from '../types/bot'

const DEFAULT_RISK: RiskConfig = {
  capital: 100000,
  per_trade_risk_pct: 0.75,
  daily_loss_cap_pct: 2,
  max_open_positions: 1,
  max_trades_per_day: 3,
  cooldown_after_losses: 2,
  expiry_position_size_multiplier: 0.5,
  expiry_stop_multiplier: 0.8,
}

const DEFAULT_STRATEGY_PARAMS = {
  session_start: '09:30',
  session_end: '15:00',
  opening_range_end: '09:30',
  target_rr: 2,
  ema_fast: 9,
  ema_slow: 21,
  volume_mult: 1.0,
}

type StrategyParams = typeof DEFAULT_STRATEGY_PARAMS

const CURATED_INSTRUMENTS = [
  { group: 'India Indices', options: ['NIFTY', 'BANKNIFTY', 'NIFTYIT', 'NIFTYAUTO', 'NIFTY200', 'NSEI', 'CNX200', 'NSEBANK'] },
  { group: 'India Stocks', options: ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS', 'SBIN.NS'] },
  { group: 'US Indices/ETFs', options: ['SPY', 'QQQ', 'DIA', '^GSPC', '^NDX'] },
  { group: 'US Stocks', options: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'TSLA'] },
]

function sevenDaysAgo() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function paramsFromStrategy(s: StrategyConfig | null): StrategyParams {
  if (!s) return { ...DEFAULT_STRATEGY_PARAMS }
  const p = s.parameters as Record<string, unknown>
  return {
    session_start: String(p.session_start ?? DEFAULT_STRATEGY_PARAMS.session_start),
    session_end: String(p.session_end ?? DEFAULT_STRATEGY_PARAMS.session_end),
    opening_range_end: String(p.opening_range_end ?? DEFAULT_STRATEGY_PARAMS.opening_range_end),
    target_rr: Number(p.target_rr ?? DEFAULT_STRATEGY_PARAMS.target_rr),
    ema_fast: Number(p.ema_fast ?? DEFAULT_STRATEGY_PARAMS.ema_fast),
    ema_slow: Number(p.ema_slow ?? DEFAULT_STRATEGY_PARAMS.ema_slow),
    volume_mult: Number(p.volume_mult ?? DEFAULT_STRATEGY_PARAMS.volume_mult),
  }
}

function makeStrategyId(name: string) {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${slug || 'STRATEGY'}_V1`
}

export function BotLab() {
  const [kiteStatus, setKiteStatus] = useState<KiteStatus | null>(null)
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null)
  const [togglingBot, setTogglingBot] = useState(false)

  const [showSettings, setShowSettings] = useState(false)
  const [settingsMode, setSettingsMode] = useState('paper')
  const [settingsCapital, setSettingsCapital] = useState(100000)
  const [savingSettings, setSavingSettings] = useState(false)
  const [showModeWarning, setShowModeWarning] = useState(false)

  const [strategies, setStrategies] = useState<StrategyConfig[]>([])
  const [activeStrategyId, setActiveStrategyId] = useState<string>('')
  const [activeStrategy, setActiveStrategy] = useState<StrategyConfig | null>(null)
  const [strategyParams, setStrategyParams] = useState<StrategyParams>({ ...DEFAULT_STRATEGY_PARAMS })
  const [editingStrategy, setEditingStrategy] = useState(false)
  const [editParams, setEditParams] = useState<StrategyParams>({ ...DEFAULT_STRATEGY_PARAMS })
  const [savingStrategy, setSavingStrategy] = useState(false)

  const [showCreateStrategy, setShowCreateStrategy] = useState(false)
  const [newStrategyName, setNewStrategyName] = useState('')
  const [newStrategyDescription, setNewStrategyDescription] = useState('')

  const [symbol, setSymbol] = useState('NIFTY')
  const [customSymbol, setCustomSymbol] = useState('')

  const [blueprintLoading, setBlueprintLoading] = useState(false)
  const [blueprint, setBlueprint] = useState<StrategyBlueprintResponse | null>(null)
  const [blueprintApplyStatus, setBlueprintApplyStatus] = useState('')
  const [blueprintExperience, setBlueprintExperience] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner')
  const [blueprintRisk, setBlueprintRisk] = useState<'low' | 'medium' | 'high'>('medium')
  const [blueprintObjective, setBlueprintObjective] = useState('')

  const [improving, setImproving] = useState(false)
  const [improvement, setImprovement] = useState<StrategyImprovementResponse | null>(null)
  const [applyingImprovement, setApplyingImprovement] = useState(false)

  const [startDate, setStartDate] = useState(sevenDaysAgo)
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [capital, setCapital] = useState(100000)
  const [running, setRunning] = useState(false)
  const [backtest, setBacktest] = useState<BacktestRunStatus | null>(null)
  const [trades, setTrades] = useState<BacktestTrade[]>([])
  const [equityPoints, setEquityPoints] = useState<EquityPoint[]>([])
  const [backtestError, setBacktestError] = useState('')

  const [signalRunning, setSignalRunning] = useState(false)
  const [lastSignal, setLastSignal] = useState<SignalEvent | null>(null)
  const [lastIntent, setLastIntent] = useState<OrderIntent | null>(null)
  const [pendingIntents, setPendingIntents] = useState<OrderIntent[]>([])
  const [allSignals, setAllSignals] = useState<SignalEvent[]>([])

  const [positions, setPositions] = useState<LivePosition[]>([])
  const [orders, setOrders] = useState<LiveOrder[]>([])

  const loadKiteStatus = useCallback(async () => {
    try { setKiteStatus(await api.getKiteStatus()) }
    catch { setKiteStatus({ connected: false, profile_name: null, available_margin: null, has_credentials: false, masked_api_key: null }) }
  }, [])

  const loadBotStatus = useCallback(async () => {
    try { setBotStatus(await api.getBotStatus()) } catch { /* ignore */ }
  }, [])

  const loadSettings = useCallback(async () => {
    try {
      const s = await api.getBotSettings()
      setSettingsMode(s.mode)
      setSettingsCapital(s.capital)
      setCapital(s.capital)
    } catch { /* ignore */ }
  }, [])

  const syncFromStrategy = useCallback((strategy: StrategyConfig | null) => {
    setActiveStrategy(strategy)
    const params = paramsFromStrategy(strategy)
    setStrategyParams(params)
    setEditParams(params)
    if (strategy?.instrument) {
      setSymbol(strategy.instrument.toUpperCase())
      setCustomSymbol('')
    }
  }, [])

  const loadStrategies = useCallback(async () => {
    try {
      const list = await api.getStrategies()
      const ordered = [...list]
      setStrategies(ordered)
      if (ordered.length === 0) {
        const defaultConfig: StrategyConfig = {
          strategy_id: 'IN_BREAKOUT_V1',
          name: 'India Intraday Breakout',
          version: 'v1',
          description: 'Opening range breakout with EMA trend and volume filter.',
          instrument: symbol,
          parameters: { ...DEFAULT_STRATEGY_PARAMS },
          enabled: true,
          algo_id: 'ALG-IN-BREAKOUT-V1',
          created_at: new Date().toISOString(),
        }
        await api.registerStrategy(defaultConfig)
        setStrategies([defaultConfig])
        setActiveStrategyId(defaultConfig.strategy_id)
        syncFromStrategy(defaultConfig)
        return
      }

      const selected = ordered.find((s) => s.strategy_id === activeStrategyId)
        ?? ordered.find((s) => s.strategy_id === 'IN_BREAKOUT_V1')
        ?? ordered[0]

      setActiveStrategyId(selected.strategy_id)
      syncFromStrategy(selected)
    } catch { /* ignore */ }
  }, [activeStrategyId, symbol, syncFromStrategy])

  const loadActivity = useCallback(async () => {
    try {
      const [pos, ord] = await Promise.all([api.getLivePositions(), api.getLiveOrdersToday()])
      setPositions(pos)
      setOrders(ord)
    } catch { /* ignore */ }
  }, [])

  const loadPendingIntents = useCallback(async () => {
    try { setPendingIntents(await api.getPendingIntents()) }
    catch { setPendingIntents([]) }
  }, [])

  const loadTodaySignals = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10)
      setAllSignals((await api.getSignals(today)) || [])
    } catch { setAllSignals([]) }
  }, [])

  const refreshAll = useCallback(() => {
    loadKiteStatus()
    loadBotStatus()
    loadActivity()
    loadPendingIntents()
    loadTodaySignals()
  }, [loadKiteStatus, loadBotStatus, loadActivity, loadPendingIntents, loadTodaySignals])

  useEffect(() => {
    loadKiteStatus()
    loadBotStatus()
    loadSettings()
    loadStrategies()
    loadActivity()
    loadPendingIntents()
    loadTodaySignals()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (showSettings) loadSettings()
  }, [showSettings, loadSettings])

  useEffect(() => {
    if (!strategies.length || !activeStrategyId) return
    const selected = strategies.find((s) => s.strategy_id === activeStrategyId) || null
    syncFromStrategy(selected)
  }, [activeStrategyId, strategies, syncFromStrategy])

  const pnl = useMemo(() => trades.reduce((a, t) => a + t.pnl, 0), [trades])
  const winTrades = useMemo(() => trades.filter((t) => t.pnl > 0).length, [trades])
  const winRate = trades.length > 0 ? Math.round((winTrades / trades.length) * 100) : 0
  const worstDayPnl = useMemo(() => {
    if (!trades.length) return 0
    const byDay: Record<string, number> = {}
    for (const t of trades) {
      const d = t.entry_time.slice(0, 10)
      byDay[d] = (byDay[d] ?? 0) + t.pnl
    }
    return Math.min(...Object.values(byDay))
  }, [trades])

  const promotionVerdict = useMemo(() => {
    if (!backtest?.report) return null
    const r = backtest.report
    if (r.promotion_pass) return { label: 'Ready to trade', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' }
    if (r.win_rate >= 45 && r.max_drawdown_pct <= 20) return { label: 'Borderline, needs more testing', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' }
    return { label: 'Not ready, improve strategy first', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' }
  }, [backtest])

  const activeStrategyRef = activeStrategy?.strategy_id || 'IN_BREAKOUT_V1'

  const saveStrategy = useCallback(async (config: StrategyConfig) => {
    await api.registerStrategy(config)
    await loadStrategies()
    setActiveStrategyId(config.strategy_id)
  }, [loadStrategies])

  const onToggleBot = async () => {
    if (!botStatus) return
    setTogglingBot(true)
    try {
      await api.toggleBot(!botStatus.is_running)
      await loadBotStatus()
    } finally { setTogglingBot(false) }
  }

  const onSaveSettings = async () => {
    setSavingSettings(true)
    try {
      await api.saveBotSettings({
        mode: settingsMode,
        capital: settingsCapital,
        risk_config: { ...DEFAULT_RISK, capital: settingsCapital },
      })
      setCapital(settingsCapital)
      await Promise.all([loadBotStatus(), loadSettings()])
      setShowSettings(false)
    } finally { setSavingSettings(false) }
  }

  const onSaveStrategy = async () => {
    if (!activeStrategy) return
    setSavingStrategy(true)
    try {
      const config: StrategyConfig = {
        strategy_id: activeStrategy.strategy_id,
        name: activeStrategy.name,
        version: activeStrategy.version || 'v1',
        description: activeStrategy.description,
        instrument: symbol,
        parameters: { ...editParams },
        enabled: true,
        algo_id: activeStrategy.algo_id || 'ALG-IN-BREAKOUT-V1',
        created_at: activeStrategy.created_at,
      }
      await saveStrategy(config)
      setEditingStrategy(false)
    } finally { setSavingStrategy(false) }
  }

  const onCreateStrategy = async () => {
    const cleanName = newStrategyName.trim()
    if (!cleanName) return

    setSavingStrategy(true)
    try {
      const strategyId = makeStrategyId(cleanName)
      const config: StrategyConfig = {
        strategy_id: strategyId,
        name: cleanName,
        version: 'v1',
        description: newStrategyDescription.trim() || 'Custom ORB strategy created in Bot Lab',
        instrument: symbol,
        parameters: { ...strategyParams },
        enabled: true,
        algo_id: `ALG-${strategyId.replace(/_V\d+$/, '')}`,
        created_at: new Date().toISOString(),
      }
      await saveStrategy(config)
      setShowCreateStrategy(false)
      setNewStrategyName('')
      setNewStrategyDescription('')
    } finally { setSavingStrategy(false) }
  }

  const onGenerateBlueprint = async () => {
    setBlueprintLoading(true)
    setBlueprintApplyStatus('')
    try {
      const out = await api.getStrategyBlueprint({
        symbol,
        experience_level: blueprintExperience,
        risk_level: blueprintRisk,
        objective: blueprintObjective.trim(),
      })
      setBlueprint(out)
    } catch { /* ignore */ }
    finally { setBlueprintLoading(false) }
  }

  const onApplyBlueprintParams = async () => {
    if (!blueprint || !activeStrategy) return
    const p = blueprint.suggested_params as Record<string, unknown>
    const newParams: StrategyParams = {
      session_start: String(p.session_start ?? strategyParams.session_start),
      session_end: String(p.session_end ?? strategyParams.session_end),
      opening_range_end: String(p.opening_range_end ?? strategyParams.opening_range_end),
      target_rr: Number(p.target_rr ?? strategyParams.target_rr),
      ema_fast: Number(p.ema_fast ?? strategyParams.ema_fast),
      ema_slow: Number(p.ema_slow ?? strategyParams.ema_slow),
      volume_mult: Number(p.volume_mult ?? strategyParams.volume_mult),
    }
    setSavingStrategy(true)
    setBlueprintApplyStatus('')
    try {
      const config: StrategyConfig = {
        ...activeStrategy,
        instrument: symbol,
        parameters: { ...newParams },
      }
      await saveStrategy(config)
      setStrategyParams(newParams)
      setEditParams(newParams)
      setEditingStrategy(false)
      setBlueprintApplyStatus(`Applied to strategy "${config.name}".`)
    } catch {
      setBlueprintApplyStatus('Could not apply blueprint right now. Please try again.')
    } finally {
      setSavingStrategy(false)
    }
  }

  const onCreateFromBlueprint = async () => {
    if (!blueprint) return
    setSavingStrategy(true)
    try {
      const p = blueprint.suggested_params as Record<string, unknown>
      const params: StrategyParams = {
        session_start: String(p.session_start ?? DEFAULT_STRATEGY_PARAMS.session_start),
        session_end: String(p.session_end ?? DEFAULT_STRATEGY_PARAMS.session_end),
        opening_range_end: String(p.opening_range_end ?? DEFAULT_STRATEGY_PARAMS.opening_range_end),
        target_rr: Number(p.target_rr ?? DEFAULT_STRATEGY_PARAMS.target_rr),
        ema_fast: Number(p.ema_fast ?? DEFAULT_STRATEGY_PARAMS.ema_fast),
        ema_slow: Number(p.ema_slow ?? DEFAULT_STRATEGY_PARAMS.ema_slow),
        volume_mult: Number(p.volume_mult ?? DEFAULT_STRATEGY_PARAMS.volume_mult),
      }

      const name = blueprint.suggested_name || `${symbol} AI Strategy`
      const strategyId = makeStrategyId(name)
      const config: StrategyConfig = {
        strategy_id: strategyId,
        name,
        version: 'v1',
        description: blueprint.suggested_description || 'AI-assisted strategy blueprint',
        instrument: symbol,
        parameters: params,
        enabled: true,
        algo_id: `ALG-${strategyId.replace(/_V\d+$/, '')}`,
        created_at: new Date().toISOString(),
      }
      await saveStrategy(config)
      setBlueprint(null)
    } finally { setSavingStrategy(false) }
  }

  const onRunBacktest = async () => {
    setRunning(true)
    setBacktestError('')
    setTrades([])
    setEquityPoints([])
    setBacktest(null)
    setImprovement(null)
    try {
      if (activeStrategy) {
        await api.registerStrategy({
          ...activeStrategy,
          instrument: symbol,
          parameters: { ...strategyParams },
        }).catch(() => {})
      }

      const run = await api.runBacktest(
        {
          symbol,
          timeframe: '5m',
          start_date: startDate,
          end_date: endDate,
          initial_capital: capital,
          commission_pct: 0.03,
          slippage_pct: 0.02,
          strategy_id: activeStrategyRef,
          session_start: strategyParams.session_start,
          session_end: strategyParams.session_end,
          opening_range_end: strategyParams.opening_range_end,
          target_rr: strategyParams.target_rr,
          ema_fast: strategyParams.ema_fast,
          ema_slow: strategyParams.ema_slow,
          volume_mult: strategyParams.volume_mult,
        },
        { ...DEFAULT_RISK, capital },
      )
      setBacktest(run)
      const [runTrades, equity] = await Promise.all([
        api.getBacktestTrades(run.run_id),
        api.getBacktestEquity(run.run_id),
      ])
      setTrades(runTrades)
      setEquityPoints(equity)
    } catch (err: any) {
      setBacktestError(
        err?.response?.data?.detail ||
        'Simulation failed. For 5-minute data, yfinance supports around 60 days. Try a shorter range.',
      )
    } finally { setRunning(false) }
  }

  const onImproveStrategy = async () => {
    if (!backtest?.run_id) return
    setImproving(true)
    try {
      const result = await api.improveStrategy(backtest.run_id)
      setImprovement(result)
    } catch { /* ignore */ }
    finally { setImproving(false) }
  }

  const onApplyImprovement = async (andRetest = false) => {
    if (!improvement || !activeStrategy) return
    const p = improvement.improved_params as Record<string, unknown>
    const newParams: StrategyParams = {
      session_start: String(p.session_start ?? strategyParams.session_start),
      session_end: String(p.session_end ?? strategyParams.session_end),
      opening_range_end: String(p.opening_range_end ?? strategyParams.opening_range_end),
      target_rr: Number(p.target_rr ?? strategyParams.target_rr),
      ema_fast: Number(p.ema_fast ?? strategyParams.ema_fast),
      ema_slow: Number(p.ema_slow ?? strategyParams.ema_slow),
      volume_mult: Number(p.volume_mult ?? strategyParams.volume_mult),
    }
    setApplyingImprovement(true)
    try {
      const config: StrategyConfig = {
        ...activeStrategy,
        instrument: symbol,
        parameters: { ...newParams },
      }
      await saveStrategy(config)
      setStrategyParams(newParams)
      setEditParams(newParams)
      setImprovement(null)
      if (andRetest) await onRunBacktest()
    } finally { setApplyingImprovement(false) }
  }

  const onRunSignal = async () => {
    setSignalRunning(true)
    try {
      const out = await api.runSignals(activeStrategyRef, symbol)
      setLastSignal(out.signal as SignalEvent)
      setLastIntent(out.order_intent as OrderIntent | null)
      await loadPendingIntents()
      await loadTodaySignals()
    } catch { /* ignore */ }
    finally { setSignalRunning(false) }
  }

  const onChangeCuratedSymbol = (next: string) => {
    if (next === '__CUSTOM__') {
      setSymbol(customSymbol.toUpperCase() || '')
      return
    }
    setCustomSymbol('')
    setSymbol(next.toUpperCase())
  }

  const onApplyCustomSymbol = () => {
    if (!customSymbol.trim()) return
    setSymbol(customSymbol.trim().toUpperCase())
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Bot Lab</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Beginner flow: pick instrument, choose strategy, run paper backtests, then trade with approvals.
          </p>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="px-4 py-2 text-xs font-medium rounded-lg border border-border text-text-muted hover:text-text-primary hover:border-accent/40 transition-colors"
        >
          {showSettings ? 'Close Settings' : 'Settings'}
        </button>
      </div>

      {showSettings && (
        <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-text-muted">Trading Mode</label>
              <div className="flex gap-2">
                {(['paper', 'live'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      if (m === 'live') setShowModeWarning(true)
                      else setShowModeWarning(false)
                      setSettingsMode(m)
                    }}
                    className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                      settingsMode === m
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border text-text-muted hover:border-accent/30'
                    }`}
                  >
                    {m === 'paper' ? 'Paper Mode' : 'Live Mode'}
                  </button>
                ))}
              </div>
              {showModeWarning && settingsMode === 'live' && (
                <p className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
                  Live mode routes approved orders to Zerodha. Real money is at risk.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-text-muted">Starting Capital (INR)</label>
              <input
                type="number"
                value={settingsCapital}
                onChange={(e) => setSettingsCapital(Number(e.target.value))}
                min={10000}
                step={5000}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSaveSettings}
              disabled={savingSettings}
              className="px-5 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-60 transition-colors"
            >
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
            <button
              onClick={() => setShowSettings(false)}
              className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <ConnectionCard kiteStatus={kiteStatus} onStatusChange={loadKiteStatus} />

      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-text-primary">Step 1: Choose Instrument</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] text-text-muted">Curated list</label>
            <select
              value={CURATED_INSTRUMENTS.some((g) => g.options.includes(symbol)) ? symbol : '__CUSTOM__'}
              onChange={(e) => onChangeCuratedSymbol(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
            >
              {CURATED_INSTRUMENTS.map((group) => (
                <optgroup key={group.group} label={group.group}>
                  {group.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </optgroup>
              ))}
              <option value="__CUSTOM__">Custom symbol</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-text-muted">Custom ticker (examples: ITC.NS, AAPL, SPY)</label>
            <div className="flex gap-2">
              <input
                value={customSymbol}
                onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
                className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="RELIANCE.NS"
              />
              <button
                onClick={onApplyCustomSymbol}
                className="px-3 py-2 text-xs rounded-lg border border-border text-text-muted hover:text-text-primary"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
        <p className="text-xs text-text-muted">
          Active instrument: <span className="text-text-primary font-semibold">{symbol || 'Not set'}</span>
        </p>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Step 2: Strategy Workspace</h3>
            <p className="text-xs text-text-muted mt-0.5">Create multiple strategies and switch between them.</p>
          </div>
          <button
            onClick={() => setShowCreateStrategy((v) => !v)}
            className="px-4 py-1.5 text-xs font-medium rounded-lg border border-accent/40 text-accent hover:bg-accent/10 transition-colors"
          >
            {showCreateStrategy ? 'Close' : 'Create New Strategy'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] text-text-muted">Saved strategies</label>
            <select
              value={activeStrategyId}
              onChange={(e) => setActiveStrategyId(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
            >
              {strategies.map((s) => (
                <option key={s.strategy_id} value={s.strategy_id}>{s.name} ({s.strategy_id})</option>
              ))}
            </select>
          </div>
          <div className="border border-border rounded-lg px-3 py-2">
            <p className="text-[10px] text-text-muted">Selected strategy</p>
            <p className="text-xs font-semibold text-text-primary">{activeStrategy?.name || '-'}</p>
            <p className="text-[11px] text-text-muted mt-1">{activeStrategy?.description || 'No description'}</p>
          </div>
        </div>

        {showCreateStrategy && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border border-border rounded-lg p-3 bg-bg/30">
            <div className="space-y-1">
              <label className="text-[11px] text-text-muted">Strategy name</label>
              <input
                value={newStrategyName}
                onChange={(e) => setNewStrategyName(e.target.value)}
                placeholder="Nifty Momentum Breakout"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-text-muted">Description</label>
              <input
                value={newStrategyDescription}
                onChange={(e) => setNewStrategyDescription(e.target.value)}
                placeholder="Lower drawdown morning breakout"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <button
                onClick={onCreateStrategy}
                disabled={savingStrategy || !newStrategyName.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-60"
              >
                {savingStrategy ? 'Creating...' : 'Create Strategy From Current Parameters'}
              </button>
            </div>
          </div>
        )}

        <div className="rounded-lg bg-bg/60 border border-border px-4 py-3 text-xs text-text-muted leading-relaxed space-y-1.5">
          <p className="text-text-primary font-medium text-sm">ORB logic in plain words</p>
          <p>1) Capture morning range. 2) Trade only when price breaks that range.</p>
          <p>3) Trend filter with fast/slow EMA. 4) VWAP alignment. 5) RSI anti-chase and volume check.</p>
          <p>Stops and targets use volatility (ATR), and all positions close at session end.</p>
        </div>

        {!editingStrategy ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              <ParamDisplay label="Trade window" value={`${strategyParams.session_start} - ${strategyParams.session_end}`} />
              <ParamDisplay label="Morning range" value={`09:15 - ${strategyParams.opening_range_end}`} />
              <ParamDisplay label="Target RR" value={`${strategyParams.target_rr}x`} />
              <ParamDisplay label="Volume filter" value={`${strategyParams.volume_mult}x`} />
              <ParamDisplay label="EMA fast" value={String(strategyParams.ema_fast)} />
              <ParamDisplay label="EMA slow" value={String(strategyParams.ema_slow)} />
            </div>
            <button
              onClick={() => { setEditParams({ ...strategyParams }); setEditingStrategy(true) }}
              className="px-4 py-1.5 text-xs font-medium rounded-lg border border-accent/40 text-accent hover:bg-accent/10"
            >
              Modify Parameters
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ParamEdit label="Start looking for trades at" hint="HH:MM" value={editParams.session_start} onChange={(v) => setEditParams((p) => ({ ...p, session_start: v }))} />
              <ParamEdit label="Stop looking for trades at" hint="HH:MM" value={editParams.session_end} onChange={(v) => setEditParams((p) => ({ ...p, session_end: v }))} />
              <ParamEdit label="Morning range ends at" hint="HH:MM" value={editParams.opening_range_end} onChange={(v) => setEditParams((p) => ({ ...p, opening_range_end: v }))} />
              <ParamEdit label="Target RR" hint="2 means target is 2x stop" value={String(editParams.target_rr)} onChange={(v) => setEditParams((p) => ({ ...p, target_rr: parseFloat(v) || 2 }))} type="number" />
              <ParamEdit label="EMA fast" hint="Default 9" value={String(editParams.ema_fast)} onChange={(v) => setEditParams((p) => ({ ...p, ema_fast: parseInt(v) || 9 }))} type="number" />
              <ParamEdit label="EMA slow" hint="Default 21" value={String(editParams.ema_slow)} onChange={(v) => setEditParams((p) => ({ ...p, ema_slow: parseInt(v) || 21 }))} type="number" />
              <ParamEdit label="Volume multiplier" hint="1.1 means 10% above average" value={String(editParams.volume_mult)} onChange={(v) => setEditParams((p) => ({ ...p, volume_mult: parseFloat(v) || 1 }))} type="number" />
            </div>
            <div className="flex gap-2">
              <button
                onClick={onSaveStrategy}
                disabled={savingStrategy}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-60"
              >
                {savingStrategy ? 'Saving...' : 'Save Strategy'}
              </button>
              <button
                onClick={() => setEditingStrategy(false)}
                className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-text-primary">Step 3: AI Strategy Copilot</h3>
        <p className="text-xs text-text-muted">Generate a strategy blueprint based on experience level, risk tolerance, and objective.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] text-text-muted">Experience</label>
            <select value={blueprintExperience} onChange={(e) => setBlueprintExperience(e.target.value as any)} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm">
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-text-muted">Risk</label>
            <select value={blueprintRisk} onChange={(e) => setBlueprintRisk(e.target.value as any)} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2 md:col-span-2">
            <label className="text-[11px] text-text-muted">Objective</label>
            <input
              value={blueprintObjective}
              onChange={(e) => setBlueprintObjective(e.target.value)}
              placeholder="Example: lower drawdown and fewer but cleaner trades"
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <button
          onClick={onGenerateBlueprint}
          disabled={blueprintLoading}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-60"
        >
          {blueprintLoading ? 'Generating...' : 'Generate AI Blueprint'}
        </button>

        {blueprint && (
          <div className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-semibold text-text-primary">{blueprint.suggested_name}</p>
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-text-muted">{blueprint.confidence.toUpperCase()} confidence</span>
            </div>
            <p className="text-xs text-text-muted">{blueprint.summary}</p>
            <p className="text-xs text-text-muted">{blueprint.suggested_description}</p>
            {blueprint.notes?.length > 0 && (
              <div className="space-y-1">
                {blueprint.notes.map((n, i) => (
                  <p key={i} className="text-xs text-text-muted">- {n}</p>
                ))}
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              <button onClick={onApplyBlueprintParams} disabled={savingStrategy} className="px-4 py-2 text-sm rounded-lg border border-border text-text-muted hover:text-text-primary disabled:opacity-60">Apply to Current Strategy</button>
              <button onClick={onCreateFromBlueprint} disabled={savingStrategy} className="px-4 py-2 text-sm rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-60">Create New Strategy From Blueprint</button>
            </div>
            {blueprintApplyStatus && <p className="text-xs text-green-400">{blueprintApplyStatus}</p>}
          </div>
        )}
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Step 4: Backtest in Paper Mode</h3>
          <p className="text-xs text-text-muted mt-0.5">
            Simulate on historical data before any live execution.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] text-text-muted">Instrument</label>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-text-muted">Start date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-text-muted">End date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-text-muted">Capital (INR)</label>
            <input type="number" value={capital} onChange={(e) => setCapital(Number(e.target.value))} min={10000} step={5000} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={onRunBacktest} disabled={running} className="px-6 py-2.5 text-sm font-semibold rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-60 transition-colors">
            {running ? 'Simulating...' : 'Run Backtest'}
          </button>
          <p className="text-[11px] text-text-muted">
            {kiteStatus?.connected
              ? 'Kite connected. You can use broader historical coverage depending on broker limits.'
              : 'Without Kite, yfinance intraday data depth is limited.'}
          </p>
        </div>

        {backtestError && <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{backtestError}</p>}

        {backtest?.report && (
          <div className="space-y-4 pt-2 border-t border-border">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <BigStat label="Net P/L" value={`${pnl >= 0 ? '+' : ''}INR ${pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} positive={pnl >= 0} />
              <BigStat label="Win rate" value={`${winRate}%`} positive={winRate >= 50} />
              <BigStat label="Worst day" value={`INR ${Math.abs(worstDayPnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} positive={worstDayPnl >= 0} invertColor />
            </div>

            {equityPoints.length > 1 && <EquityChart points={equityPoints} initialCapital={capital} />}

            {promotionVerdict && (
              <div className={`rounded-lg border px-4 py-3 ${promotionVerdict.bg}`}>
                <p className={`text-sm font-semibold ${promotionVerdict.color}`}>{promotionVerdict.label}</p>
                <p className="text-xs text-text-muted mt-0.5">{backtest.report.promotion_notes}</p>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <SmallStat label="Total trades" value={String(backtest.report.total_trades)} />
              <SmallStat label="Max drawdown" value={`${backtest.report.max_drawdown_pct.toFixed(1)}%`} />
              <SmallStat label="Profit factor" value={backtest.report.profit_factor.toFixed(2)} />
              <SmallStat label="CAGR" value={`${backtest.report.cagr_pct.toFixed(1)}%`} />
            </div>

            {trades.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-text-muted">Recent trades ({trades.length})</p>
                <div className="space-y-1 max-h-64 overflow-auto pr-1">
                  {trades.map((t, i) => {
                    const entryDt = new Date(t.entry_time)
                    const exitDt = new Date(t.exit_time)
                    const fmtDate = entryDt.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' })
                    const fmtEntry = entryDt.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })
                    const fmtExit = exitDt.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })
                    return (
                      <div key={i} className="border border-border rounded-lg px-3 py-2 text-xs flex items-center gap-3 flex-wrap">
                        <span className="text-text-muted w-16 shrink-0">{fmtDate}</span>
                        <span className={`font-semibold w-8 shrink-0 ${t.side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>{t.side}</span>
                        <span className="text-text-muted font-mono text-[11px]">{fmtEntry}{'->'}{fmtExit}</span>
                        <span className="text-text-muted font-mono">{t.entry_price.toFixed(0)}{'->'}{t.exit_price.toFixed(0)}</span>
                        <span className={`font-semibold ml-auto ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{t.pnl >= 0 ? '+' : ''}INR {t.pnl.toFixed(0)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-border space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-text-primary">AI Improvement</p>
                  <p className="text-xs text-text-muted mt-0.5">Analyze this run and suggest parameter changes.</p>
                </div>
                {!improvement && (
                  <button onClick={onImproveStrategy} disabled={improving} className="px-4 py-2 text-sm font-medium rounded-lg border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-60">
                    {improving ? 'Analyzing...' : 'Analyze and Suggest'}
                  </button>
                )}
              </div>

              {improvement && (
                <div className="space-y-4">
                  <div className="rounded-lg border px-4 py-3 space-y-1 bg-bg/40 border-border">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-text-primary">Assessment</p>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-border text-text-muted">{improvement.confidence.toUpperCase()}</span>
                    </div>
                    <p className="text-xs text-text-muted leading-relaxed">{improvement.assessment}</p>
                  </div>

                  {improvement.suggestions.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-text-muted">Suggested changes ({improvement.suggestions.length})</p>
                      {improvement.suggestions.map((s, i) => (
                        <div key={i} className="border border-border rounded-lg px-4 py-3 space-y-1.5">
                          <p className="text-xs font-semibold text-text-primary">{s.label}</p>
                          <div className="flex items-center gap-2 text-xs font-mono">
                            <span className="text-text-muted bg-bg px-2 py-0.5 rounded">{String(s.current_value)}</span>
                            <span className="text-text-muted">{'->'}</span>
                            <span className="text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded font-semibold">{String(s.suggested_value)}</span>
                          </div>
                          <p className="text-xs text-text-muted leading-relaxed">{s.plain_reason}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-text-muted bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                      No changes suggested for this run.
                    </p>
                  )}

                  {improvement.suggestions.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => onApplyImprovement(false)} disabled={applyingImprovement} className="px-4 py-2 text-sm font-medium rounded-lg border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-60">
                        {applyingImprovement ? 'Applying...' : 'Apply Suggestions'}
                      </button>
                      <button onClick={() => onApplyImprovement(true)} disabled={applyingImprovement || running} className="px-4 py-2 text-sm font-semibold rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-60">
                        {applyingImprovement || running ? 'Working...' : 'Apply and Retest'}
                      </button>
                      <button onClick={() => setImprovement(null)} disabled={applyingImprovement} className="px-3 py-2 text-xs text-text-muted hover:text-text-primary">
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Step 5: Signals and Approvals</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Run live analysis on {symbol}. Approve each order intent manually.
            </p>
          </div>
          <button onClick={onRunSignal} disabled={signalRunning} className="px-4 py-2 text-sm font-medium rounded-lg border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-60 transition-colors">
            {signalRunning ? 'Analyzing...' : 'Run Analysis Now'}
          </button>
        </div>

        {lastSignal && <SignalCard signal={lastSignal} intent={lastIntent} onUpdated={refreshAll} />}

        {pendingIntents.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-text-muted">Other pending approvals from today</p>
            {pendingIntents
              .filter((intent) => intent.intent_id !== lastIntent?.intent_id)
              .map((intent) => {
                const sig = allSignals.find((s) => s.signal_id === intent.signal_id)
                if (!sig) return null
                return <SignalCard key={intent.intent_id} signal={sig} intent={intent} onUpdated={refreshAll} />
              })}
          </div>
        )}

        {!lastSignal && pendingIntents.length === 0 && (
          <p className="text-xs text-text-muted">Run analysis to check if there is a trade setup right now.</p>
        )}
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Step 6: Activity Monitor</h3>
            <p className="text-xs text-text-muted mt-0.5">Open positions and executed orders for today.</p>
          </div>
          <button onClick={loadActivity} className="text-xs text-text-muted hover:text-text-primary underline transition-colors">Refresh</button>
        </div>

        <div>
          <p className="text-xs font-semibold text-text-muted mb-2">Open Positions ({positions.length})</p>
          {positions.length > 0 ? (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs border-collapse min-w-[400px]">
                <thead>
                  <tr className="text-left text-text-muted border-b border-border">
                    {['Symbol', 'Qty', 'Avg', 'Current', 'Unrealized P/L'].map((h) => (
                      <th key={h} className="pb-2 pr-4 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-medium text-text-primary whitespace-nowrap">{p.symbol}</td>
                      <td className="py-2 pr-4">{p.qty}</td>
                      <td className="py-2 pr-4 font-mono whitespace-nowrap">INR {p.avg_price.toFixed(2)}</td>
                      <td className="py-2 pr-4 font-mono whitespace-nowrap">INR {p.last_price.toFixed(2)}</td>
                      <td className={`py-2 font-semibold whitespace-nowrap ${p.unrealized_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {p.unrealized_pnl >= 0 ? '+' : ''}INR {p.unrealized_pnl.toFixed(0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-text-muted">No open positions.</p>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-text-muted mb-2">Executed Orders ({orders.length})</p>
          {orders.length > 0 ? (
            <div className="space-y-1 max-h-48 overflow-auto pr-1">
              {orders.map((o, i) => (
                <div key={i} className="border border-border rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-3 flex-wrap">
                  <span className="font-medium text-text-primary">{o.symbol}</span>
                  <span className={`font-medium ${o.side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>{o.side}</span>
                  <span className="text-text-muted">Qty: {o.qty}</span>
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] ${['COMPLETE', 'FILLED', 'EXECUTED'].includes(o.status) ? 'border-green-500/30 text-green-400' : 'border-border text-text-muted'}`}>{o.status}</span>
                  <span className="text-text-muted text-[10px]">{o.placed_at ? new Date(o.placed_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted">No orders today.</p>
          )}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Bot Status</h3>
            <p className="text-xs text-text-muted mt-0.5">Start or stop bot execution.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${botStatus?.mode === 'live' ? 'border-orange-500/30 bg-orange-500/10 text-orange-400' : 'border-blue-500/30 bg-blue-500/10 text-blue-400'}`}>
              {botStatus?.mode === 'live' ? 'Live Mode' : 'Paper Mode'}
            </span>
            <button onClick={onToggleBot} disabled={togglingBot} className={`relative w-12 h-6 rounded-full border transition-all duration-300 ${botStatus?.is_running ? 'bg-green-500 border-green-400' : 'bg-surface border-border'} disabled:opacity-60`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300 ${botStatus?.is_running ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
            <span className="text-xs text-text-muted">{botStatus?.is_running ? 'Running' : 'Stopped'}</span>
          </div>
        </div>

        {botStatus && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatBox label="Today trades" value={String(botStatus.today_trades)} />
            <StatBox label="Today P/L" value={`${botStatus.today_pnl >= 0 ? '+' : ''}INR ${botStatus.today_pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} positive={botStatus.today_pnl >= 0} />
            <div className="border border-border rounded-lg px-3 py-2 col-span-2 md:col-span-1">
              <RiskGauge usedPct={botStatus.risk_used_pct} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatBox({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="border border-border rounded-lg px-3 py-2">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className={`text-sm font-semibold ${positive === undefined ? 'text-text-primary' : positive ? 'text-green-400' : 'text-red-400'}`}>
        {value}
      </p>
    </div>
  )
}

function BigStat({ label, value, positive, invertColor }: { label: string; value: string; positive?: boolean; invertColor?: boolean }) {
  const color = positive === undefined
    ? 'text-text-primary'
    : invertColor
      ? (positive ? 'text-text-primary' : 'text-red-400')
      : (positive ? 'text-green-400' : 'text-red-400')
  return (
    <div className="border border-border rounded-xl px-4 py-3 text-center space-y-1">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  )
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded-lg px-3 py-2">
      <p className="text-[10px] text-text-muted">{label}</p>
      <p className="text-xs font-semibold text-text-primary">{value}</p>
    </div>
  )
}

function ParamDisplay({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded-lg px-3 py-2">
      <p className="text-[10px] text-text-muted">{label}</p>
      <p className="text-xs font-semibold text-text-primary mt-0.5">{value}</p>
    </div>
  )
}

function ParamEdit({
  label, hint, value, onChange, type = 'text',
}: {
  label: string; hint: string; value: string; onChange: (v: string) => void; type?: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-text-primary">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        step={type === 'number' ? 'any' : undefined}
        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
      />
      <p className="text-[10px] text-text-muted">{hint}</p>
    </div>
  )
}
