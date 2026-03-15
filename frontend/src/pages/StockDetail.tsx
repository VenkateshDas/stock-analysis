import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMarketStore } from '../store/useMarketStore'
import { api } from '../services/api'
import type {
  AnalysisResult,
  HistoryResponse,
  LLMSummary,
  MultiTimeframeTrend,
  OpeningRangeResult,
  IndexSnapshot,
  TechnicalIndicators,
  StatisticalMetrics,
  TimeframeTrend,
  PCRResult,
  StockFundamentals,
} from '../types/market'
import { CandlestickChart } from '../components/charts/CandlestickChart'
import { ActionPlaybookPanel } from '../components/analysis/ActionPlaybookPanel'
import { CPRPanel } from '../components/analysis/CPRPanel'
import { TechnicalPanel } from '../components/analysis/TechnicalPanel'
import { StatisticsPanel } from '../components/analysis/StatisticsPanel'
import { TrendPanel } from '../components/analysis/TrendPanel'
import { LLMSummaryPanel } from '../components/analysis/LLMSummaryPanel'
import { TechnicalGauge } from '../components/analysis/TechnicalGauge'
import { MarketMetricsPanel } from '../components/analysis/MarketMetricsPanel'
import { FundamentalsPanel } from '../components/analysis/FundamentalsPanel'
import { MacroContextCard } from '../components/analysis/MacroContextCard'

const DETAIL_POLL_MS = 60_000

// ── Signal Cockpit (same as IndexDetail) ─────────────────────────────────────
type SignalTone = 'up' | 'down' | 'neutral' | 'accent'

function signalClasses(tone: SignalTone): string {
  if (tone === 'up')     return 'text-up bg-up/10 border-up/30'
  if (tone === 'down')   return 'text-down bg-down/10 border-down/30'
  if (tone === 'accent') return 'text-accent bg-accent/10 border-accent/30'
  return 'text-text-muted bg-bg border-border'
}

function SignalChip({
  label, value, status, subtext,
}: { label: string; value: string; status: SignalTone; subtext?: string }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${signalClasses(status)}`}>
      <p className="text-[9px] font-bold uppercase tracking-widest opacity-60 mb-1.5 truncate">{label}</p>
      <p className="text-xl font-black font-mono leading-none">{value}</p>
      {subtext && <p className="text-[11px] font-medium mt-1.5 capitalize leading-none opacity-80">{subtext}</p>}
    </div>
  )
}

function buildCockpit(tech: TechnicalIndicators) {
  const rsiTone: SignalTone = tech.rsi_signal === 'overbought' ? 'down' : tech.rsi_signal === 'oversold' ? 'up' : 'neutral'
  const macdTone: SignalTone = tech.macd_signal === 'bullish' ? 'up' : tech.macd_signal === 'bearish' ? 'down' : 'neutral'
  const adxTone: SignalTone = tech.adx_signal === 'strong_trend' || tech.adx_signal === 'moderate_trend' ? 'accent' : 'neutral'
  const bbTone: SignalTone = tech.bb_signal === 'above_upper' || tech.bb_signal === 'near_upper' ? 'down' : tech.bb_signal === 'below_lower' || tech.bb_signal === 'near_lower' ? 'up' : 'neutral'
  const bbVal = tech.bollinger.percent_b != null ? `${(tech.bollinger.percent_b * 100).toFixed(0)}%B` : '—'
  const rvolTone: SignalTone = tech.rvol_signal === 'high' ? 'up' : 'neutral'
  const obvTone: SignalTone = tech.obv_trend === 'rising' ? 'up' : tech.obv_trend === 'falling' ? 'down' : 'neutral'

  return [
    { label: 'Momentum · RSI',   value: tech.rsi != null ? tech.rsi.toFixed(1) : '—', status: rsiTone,  subtext: tech.rsi_signal === 'overbought' ? 'Overbought' : tech.rsi_signal === 'oversold' ? 'Oversold' : 'Neutral' },
    { label: 'Direction · MACD', value: tech.macd_signal === 'bullish' ? '↑ Bull' : tech.macd_signal === 'bearish' ? '↓ Bear' : '→ Flat', status: macdTone, subtext: `MACD ${tech.macd.macd != null ? tech.macd.macd.toFixed(0) : '—'}` },
    { label: 'Trend Strength · ADX', value: tech.adx != null ? tech.adx.toFixed(0) : '—', status: adxTone, subtext: tech.adx_signal === 'strong_trend' ? 'Strong trend' : tech.adx_signal === 'moderate_trend' ? 'Moderate' : tech.adx_signal === 'weak_trend' ? 'Weak' : 'No trend' },
    { label: 'Price Band · BB',  value: bbVal, status: bbTone, subtext: tech.bb_signal === 'above_upper' ? 'Above range' : tech.bb_signal === 'below_lower' ? 'Below range' : tech.bb_signal === 'near_upper' ? 'Near top' : tech.bb_signal === 'near_lower' ? 'Near bottom' : 'Mid range' },
    { label: 'Volume · Relative', value: tech.rvol != null ? `${tech.rvol.toFixed(1)}×` : '—', status: rvolTone, subtext: tech.rvol_signal === 'high' ? 'High volume' : tech.rvol_signal === 'low' ? 'Low volume' : 'Normal' },
    { label: 'Money Flow · OBV', value: tech.obv_trend === 'rising' ? '↑ Up' : tech.obv_trend === 'falling' ? '↓ Down' : '→ Flat', status: obvTone, subtext: tech.obv_trend === 'rising' ? 'Inflows' : tech.obv_trend === 'falling' ? 'Outflows' : 'Flat flow' },
  ]
}

// ── Compact Performance ───────────────────────────────────────────────────────
function PerformanceCard({ stats, currency, lastClose }: { stats: StatisticalMetrics; currency: string; lastClose: number }) {
  const w52Range = stats.week52_high != null && stats.week52_low != null ? stats.week52_high - stats.week52_low : null
  const w52Pos   = w52Range && stats.week52_low != null ? ((lastClose - stats.week52_low) / w52Range) * 100 : null

  const rows = [
    { label: 'Today',        value: stats.daily_return_pct },
    { label: 'This week',    value: stats.weekly_return_pct },
    { label: 'This month',   value: stats.monthly_return_pct },
    { label: 'Past year',    value: stats.yearly_return_pct },
    { label: 'Year to date', value: stats.ytd_return_pct },
  ]

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70">Performance</h3>
      <div className="space-y-2.5">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-xs text-text-muted">{label}</span>
            <span className={`text-sm font-mono font-bold ${value == null ? 'text-text-muted' : value >= 0 ? 'text-up' : 'text-down'}`}>
              {value != null ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` : '—'}
            </span>
          </div>
        ))}
      </div>
      {w52Pos != null && (
        <div className="pt-4 border-t border-border space-y-2">
          <div className="flex justify-between text-[10px] text-text-muted">
            <span>{stats.week52_low?.toLocaleString()} {currency}</span>
            <span className="text-accent font-mono font-bold">{w52Pos.toFixed(0)}% of 52W range</span>
            <span>{stats.week52_high?.toLocaleString()} {currency}</span>
          </div>
          <div className="h-2 bg-bg rounded-full overflow-hidden border border-border">
            <div className="h-full bg-accent rounded-full transition-all duration-700" style={{ width: `${Math.min(100, Math.max(0, w52Pos))}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-text-muted"><span>52W Low</span><span>52W High</span></div>
        </div>
      )}
      {stats.volatility_20d != null && (
        <div className="pt-3 border-t border-border flex items-center justify-between">
          <span className="text-xs text-text-muted">20D Annualised Vol</span>
          <span className="text-sm font-mono font-bold text-text-primary">{stats.volatility_20d.toFixed(1)}%</span>
        </div>
      )}
    </div>
  )
}

// ── Compact Trend Card ────────────────────────────────────────────────────────
function trendArrow(label: TimeframeTrend['trend_label']): string {
  const m: Record<string, string> = { strong_uptrend: '↑↑', uptrend: '↑', weak_uptrend: '↗', flat: '→', weak_downtrend: '↘', downtrend: '↓', strong_downtrend: '↓↓' }
  return m[label] ?? '→'
}

function CompactTrendCard({ trend }: { trend: MultiTimeframeTrend }) {
  const frames: { label: string; data: TimeframeTrend }[] = [
    { label: 'Daily', data: trend.daily }, { label: 'Weekly', data: trend.weekly },
    { label: 'Monthly', data: trend.monthly }, { label: 'Yearly', data: trend.yearly },
  ]
  const color = (dir: TimeframeTrend['direction']) => dir === 'up' ? 'text-up' : dir === 'down' ? 'text-down' : 'text-neutral'

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70">Multi-Timeframe Trend</h3>
      <div className="space-y-3">
        {frames.map(({ label, data }) => (
          <div key={label} className="flex items-center gap-3">
            <span className={`text-2xl font-black w-8 flex-shrink-0 leading-none ${color(data.direction)}`}>{trendArrow(data.trend_label)}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-xs font-semibold text-text-primary">{label}</span>
                <span className={`text-xs font-mono flex-shrink-0 ${(data.total_return_pct ?? 0) >= 0 ? 'text-up' : 'text-down'}`}>
                  {data.total_return_pct != null ? `${data.total_return_pct >= 0 ? '+' : ''}${data.total_return_pct.toFixed(1)}%` : ''}
                </span>
              </div>
              <p className="text-[11px] text-text-muted capitalize">{data.trend_label.replace(/_/g, ' ')}</p>
              <div className="relative h-1 bg-border/50 rounded-full mt-1.5 overflow-hidden">
                <div className={`absolute top-0 h-full rounded-full ${data.trend_score >= 0 ? 'bg-up' : 'bg-down'}`}
                  style={{ left: data.trend_score >= 0 ? '50%' : `${(0.5 + data.trend_score / 2) * 100}%`, width: `${Math.abs(data.trend_score) * 50}%` }} />
                <div className="absolute top-0 left-1/2 w-px h-full bg-border/80" />
              </div>
            </div>
          </div>
        ))}
      </div>
      {trend.yearly.next_period_forecast != null && trend.yearly.forecast_reliability !== 'unavailable' && (
        <div className="pt-4 border-t border-border flex items-baseline justify-between gap-2">
          <span className="text-xs text-text-muted">Yearly forecast</span>
          <span className={`text-sm font-mono font-bold ${(trend.yearly.forecast_change_pct ?? 0) >= 0 ? 'text-up' : 'text-down'}`}>
            {trend.yearly.next_period_forecast.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            {trend.yearly.forecast_change_pct != null && (
              <span className="text-xs font-normal ml-1">({trend.yearly.forecast_change_pct >= 0 ? '+' : ''}{trend.yearly.forecast_change_pct.toFixed(1)}%)</span>
            )}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Compact Opening Range Card ────────────────────────────────────────────────
function CompactOpeningRangeCard({ data }: { data: OpeningRangeResult }) {
  const { gap } = data
  const isUp = gap.gap_type === 'GAP_UP', isDown = gap.gap_type === 'GAP_DOWN'
  const sign = gap.gap_pct >= 0 ? '+' : ''
  const gapColor = isUp ? 'text-up bg-up/10 border-up/30' : isDown ? 'text-down bg-down/10 border-down/30' : 'text-neutral bg-neutral/10 border-neutral/30'
  const current = data.ohol_current ?? data.ohol
  const isBullishOHOL = current.signal === 'OPEN_LOW', isBearishOHOL = current.signal === 'OPEN_HIGH'
  const oholColor = isBullishOHOL ? 'text-up bg-up/10 border-up/30' : isBearishOHOL ? 'text-down bg-down/10 border-down/30' : 'text-neutral bg-neutral/10 border-neutral/30'
  const oholLabel = isBullishOHOL ? 'Open = Low · Bullish' : isBearishOHOL ? 'Open = High · Bearish' : current.signal === 'DOJI' ? 'Doji · Undecided' : current.signal === 'UNAVAILABLE' ? 'Intraday data N/A' : 'No OHOL signal'
  const gaps = data.historical_gaps.slice(-20)
  const MAX_PCT = 2
  const flatPct = Math.max(0, 100 - data.gap_up_pct - data.gap_down_pct)

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70">Opening Range</h3>
      <div className="flex items-center gap-3">
        <div className={`flex-shrink-0 rounded-xl border px-4 py-3 text-center ${gapColor}`}>
          <p className="text-[9px] font-bold uppercase tracking-widest opacity-70 mb-1">{isUp ? 'Gap Up' : isDown ? 'Gap Down' : 'Flat'}</p>
          <p className="text-2xl font-black font-mono leading-none">{sign}{gap.gap_pct.toFixed(2)}%</p>
        </div>
        <div className="flex-1 space-y-1.5 text-xs">
          <div className="flex justify-between"><span className="text-text-muted">Prev close</span><span className="font-mono font-semibold">{gap.prev_close.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-text-muted">Today open</span><span className="font-mono font-semibold">{gap.open_price.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-text-muted">Gap size</span><span className={`font-mono font-semibold ${isUp ? 'text-up' : isDown ? 'text-down' : 'text-neutral'}`}>{sign}{gap.gap_pts.toLocaleString(undefined, { maximumFractionDigits: 1 })} pts</span></div>
        </div>
      </div>
      {current.signal !== 'UNAVAILABLE' && (
        <div className={`rounded-xl border px-3 py-2.5 ${oholColor}`}>
          <p className="text-xs font-bold">{oholLabel}</p>
          {current.entry_trigger_long != null && <p className="text-[11px] font-mono mt-1 opacity-90">Long above {current.entry_trigger_long.toLocaleString()}</p>}
          {current.entry_trigger_short != null && <p className="text-[11px] font-mono mt-1 opacity-90">Short below {current.entry_trigger_short.toLocaleString()}</p>}
        </div>
      )}
      {gaps.length > 0 && (
        <div className="pt-3 border-t border-border space-y-2">
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-text-muted">30-day:</span>
            <span className="text-up font-semibold">{data.gap_up_pct}% up</span>
            <span className="text-down font-semibold">{data.gap_down_pct}% down</span>
            <span className="text-neutral font-semibold">{flatPct.toFixed(0)}% flat</span>
          </div>
          <div className="flex items-end gap-px h-8">
            {gaps.map((day, i) => {
              const h = Math.min(100, (Math.abs(day.gap_pct) / MAX_PCT) * 100)
              const bg = day.gap_type === 'GAP_UP' ? '#26B856' : day.gap_type === 'GAP_DOWN' ? '#EF5350' : '#6B7280'
              return (
                <div key={i} className="flex-1 flex flex-col justify-end" style={{ height: '100%' }} title={`${day.date}: ${day.gap_pct >= 0 ? '+' : ''}${day.gap_pct.toFixed(2)}%`}>
                  <div style={{ height: `max(2px, ${h}%)`, backgroundColor: bg, borderRadius: '1px' }} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function StockDetail() {
  const { ticker } = useParams<{ ticker: string }>()
  const navigate = useNavigate()
  const sym = ticker?.toUpperCase() ?? ''
  const { macro, macroLoading, fetchMacro } = useMarketStore()

  const [snapshot,      setSnapshot]      = useState<IndexSnapshot | null>(null)
  const [history,       setHistory]       = useState<HistoryResponse | null>(null)
  const [analysis,      setAnalysis]      = useState<AnalysisResult | null>(null)
  const [trend,         setTrend]         = useState<MultiTimeframeTrend | null>(null)
  const [summary,       setSummary]       = useState<LLMSummary | null>(null)
  const [openingRange,  setOpeningRange]  = useState<OpeningRangeResult | null>(null)
  const [pcr,           setPcr]           = useState<PCRResult | null>(null)
  const [_pcrLoading,    setPcrLoading]    = useState(false)
  const [_pcrUnavailable, setPcrUnavailable] = useState(false)

  const [fundamentals,        setFundamentals]        = useState<StockFundamentals | null>(null)
  const [fundamentalsLoading, setFundamentalsLoading] = useState(false)

  const [chartInterval,       setChartInterval]       = useState<'1d' | '1h' | '15m' | '5m'>('1d')
  const [historyLoading,      setHistoryLoading]      = useState(false)
  const [analysisLoading,     setAnalysisLoading]     = useState(false)
  const [trendLoading,        setTrendLoading]        = useState(false)
  const [openingRangeLoading, setOpeningRangeLoading] = useState(false)
  const [summaryLoading,      setSummaryLoading]      = useState(false)
  const [showDeepDive,        setShowDeepDive]        = useState(true)

  // Macro context — fetched once, cached 1h server-side
  useEffect(() => {
    if (!macro && !macroLoading) fetchMacro()
  }, [macro, macroLoading, fetchMacro])

  // Re-fetch history when chart interval changes
  useEffect(() => {
    if (!sym) return
    setHistoryLoading(true)
    api.getStockHistory(sym, chartInterval)
      .then(setHistory)
      .catch(() => setHistory(null))
      .finally(() => setHistoryLoading(false))
  }, [sym, chartInterval])

  useEffect(() => {
    if (!sym) return
    setAnalysisLoading(true)
    setTrendLoading(true)
    setOpeningRangeLoading(true)
    setPcrLoading(true)
    setPcrUnavailable(false)
    setFundamentalsLoading(true)

    Promise.allSettled([
      api.getStock(sym).then(setSnapshot).catch(() => setSnapshot(null)),
      api.getStockHistory(sym, chartInterval).then(setHistory).catch(() => setHistory(null)).finally(() => setHistoryLoading(false)),
      api.getStockAnalysis(sym).then(setAnalysis).catch(() => setAnalysis(null)).finally(() => setAnalysisLoading(false)),
      api.getStockTrend(sym).then(setTrend).catch(() => setTrend(null)).finally(() => setTrendLoading(false)),
      api.getStockOpeningRange(sym).then(setOpeningRange).catch(() => setOpeningRange(null)).finally(() => setOpeningRangeLoading(false)),
      api.getStockPCR(sym)
        .then((result) => { setPcr(result); if (result === null) setPcrUnavailable(true) })
        .catch(() => { setPcr(null); setPcrUnavailable(true) })
        .finally(() => setPcrLoading(false)),
      api.getStockFundamentals(sym)
        .then(setFundamentals)
        .catch(() => setFundamentals(null))
        .finally(() => setFundamentalsLoading(false)),
    ])

    const id = window.setInterval(() => {
      api.getStock(sym).then(setSnapshot).catch(() => null)
      api.getStockHistory(sym, chartInterval).then(setHistory).catch(() => null)
      api.getStockAnalysis(sym).then(setAnalysis).catch(() => null)
      api.getStockTrend(sym).then(setTrend).catch(() => null)
    }, DETAIL_POLL_MS)

    return () => window.clearInterval(id)
  }, [sym, chartInterval])

  if (!sym) return null

  const fetchSummary = async () => {
    setSummaryLoading(true)
    try { setSummary(await api.getStockSummary(sym)) }
    catch { setSummary(null) }
    finally { setSummaryLoading(false) }
  }

  const sentiment = analysis?.overall_sentiment
  const sentimentClasses =
    sentiment === 'bullish' ? 'text-up bg-up/10 border-up/30' :
    sentiment === 'bearish' ? 'text-down bg-down/10 border-down/30' :
    'text-neutral bg-neutral/10 border-neutral/30'

  return (
    <div className="space-y-6">
      {/* ── Hero Header ──────────────────────────────────────────────────────── */}
      <div>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors mb-4"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Dashboard
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-text-primary">{snapshot?.name ?? sym}</h1>
            {snapshot && (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mt-1.5">
                <span className={`text-3xl font-black font-mono ${snapshot.change_pct >= 0 ? 'text-up' : 'text-down'}`}>
                  {snapshot.last_close.toLocaleString()}
                </span>
                <span className="text-base text-text-muted font-medium">{snapshot.currency}</span>
                <span className={`text-lg font-bold ${snapshot.change_pct >= 0 ? 'text-up' : 'text-down'}`}>
                  {snapshot.change_pct >= 0 ? '▲' : '▼'} {Math.abs(snapshot.change_pct).toFixed(2)}%
                </span>
                <span className="text-sm text-text-muted">Prev {snapshot.prev_close.toLocaleString()}</span>
                <span className="text-sm text-text-muted">{snapshot.trade_date}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {snapshot?.tradingview_url && (
              <a
                href={snapshot.tradingview_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold px-3 py-2 rounded-full border border-border text-text-muted hover:text-text-primary hover:border-accent/40 transition-colors"
              >
                TradingView ↗
              </a>
            )}
            {sentiment && (
              <span className={`text-sm font-bold px-4 py-2 rounded-full border capitalize ${sentimentClasses}`}>
                {sentiment === 'bullish' ? '↑ Bullish' : sentiment === 'bearish' ? '↓ Bearish' : '→ Neutral'}
              </span>
            )}
          </div>
        </div>
        {snapshot?.note && (
          <p className="mt-3 text-xs text-text-muted leading-relaxed max-w-3xl">{snapshot.note}</p>
        )}
      </div>

      {/* ── Full-Width Native Chart ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2 justify-end">
        {(['5m', '15m', '1h', '1d'] as const).map((iv) => (
          <button
            key={iv}
            onClick={() => setChartInterval(iv)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              chartInterval === iv
                ? 'text-accent border-accent/40 bg-accent/10'
                : 'text-text-muted border-border hover:text-text-primary'
            }`}
          >
            {iv === '5m' ? '5 Min' : iv === '15m' ? '15 Min' : iv === '1h' ? '1 Hour' : '1 Day'}
          </button>
        ))}
      </div>
      {historyLoading ? (
        <div className="bg-surface border border-border rounded-2xl h-[540px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-text-muted text-sm">Loading chart data…</p>
          </div>
        </div>
      ) : history ? (
        <CandlestickChart data={history} height={500} interval={chartInterval} />
      ) : (
        <div className="bg-surface border border-border rounded-2xl p-10 text-center text-text-muted text-sm">
          Chart data unavailable
        </div>
      )}

      {/* ── Signal Cockpit ────────────────────────────────────────────────────── */}
      {analysisLoading && !analysis ? (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-surface h-20 animate-pulse" />
          ))}
        </div>
      ) : analysis ? (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {buildCockpit(analysis.technical).map(sig => (
            <SignalChip key={sig.label} {...sig} />
          ))}
        </div>
      ) : null}

      {/* ── Technical Gauge ──────────────────────────────────────────────────── */}
      {history && analysis && (
        <TechnicalGauge bars={history.bars} tech={analysis.technical} />
      )}

      {/* ── Weekly Market Metrics Panel ───────────────────────────────────────── */}
      {analysis && (
        <MarketMetricsPanel
          stats={analysis.statistical}
          tech={analysis.technical}
          currency={analysis.currency}
          lastClose={analysis.last_close}
        />
      )}

      {/* ── Fundamentals Panel ───────────────────────────────────────────────── */}
      {(fundamentals || fundamentalsLoading) && (
        <FundamentalsPanel
          data={fundamentals!}
          loading={fundamentalsLoading && !fundamentals}
        />
      )}

      {/* ── Macro Context ────────────────────────────────────────────────────── */}
      {(macro || macroLoading) && (
        <MacroContextCard data={macro!} loading={macroLoading && !macro} />
      )}

      {/* ── CPR Panel ────────────────────────────────────────────────────────── */}
      {history && history.cpr?.length > 0 && analysis && (
        <CPRPanel
          cpr={history.cpr}
          lastClose={analysis.last_close}
          currency={analysis.currency}
          pcr={pcr}
        />
      )}

      {/* ── 3-Column: Performance | Trend | Opening Range ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {analysis ? (
          <PerformanceCard stats={analysis.statistical} currency={analysis.currency} lastClose={analysis.last_close} />
        ) : analysisLoading ? (
          <div className="bg-surface border border-border rounded-2xl animate-pulse h-64" />
        ) : <div />}

        {trend ? (
          <CompactTrendCard trend={trend} />
        ) : trendLoading ? (
          <div className="bg-surface border border-border rounded-2xl animate-pulse h-64" />
        ) : <div />}

        {openingRangeLoading ? (
          <div className="bg-surface border border-border rounded-2xl animate-pulse h-64" />
        ) : openingRange ? (
          <CompactOpeningRangeCard data={openingRange} />
        ) : (
          <div className="bg-surface border border-border rounded-2xl p-5">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70 mb-2">Opening Range</h3>
            <p className="text-xs text-text-muted italic">Not available for this stock.</p>
          </div>
        )}
      </div>

      {/* ── Action Playbook ───────────────────────────────────────────────────── */}
      <ActionPlaybookPanel
        indexData={snapshot ?? undefined}
        analysis={analysis}
        trend={trend}
        sectorData={null}
        loading={analysisLoading || trendLoading}
        assetType="stock"
      />

      {/* ── AI Summary ────────────────────────────────────────────────────────── */}
      <LLMSummaryPanel
        summary={summary ?? null}
        loading={summaryLoading}
        onFetch={fetchSummary}
      />

      {/* ── Technical Deep Dive (collapsible) ────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowDeepDive(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-bg/40 transition-colors"
        >
          <div className="text-left">
            <p className="text-sm font-semibold text-text-primary">Technical Deep Dive</p>
            <p className="text-xs text-text-muted mt-0.5">Full indicator breakdown, statistics, and trend analysis</p>
          </div>
          <svg
            className={`w-5 h-5 text-text-muted transition-transform duration-200 ${showDeepDive ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showDeepDive && (
          <div className="px-5 pb-6 space-y-6 border-t border-border pt-5">
            {analysis ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TechnicalPanel data={analysis.technical} currency={analysis.currency} />
                <StatisticsPanel data={analysis.statistical} currency={analysis.currency} lastClose={analysis.last_close} />
              </div>
            ) : (
              <p className="text-sm text-text-muted italic text-center py-8">Analysis data not available.</p>
            )}
            <TrendPanel trend={trend} loading={trendLoading} />
          </div>
        )}
      </div>
    </div>
  )
}
