import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMarketStore } from '../store/useMarketStore'
import { api } from '../services/api'
import type {
  HistoryResponse,
  OpeningRangeResult,
  StatisticalMetrics,
  MultiTimeframeTrend,
  TimeframeTrend,
  PCRResult,
} from '../types/market'
import type { IndexSectorAnalysis } from '../types/sector'
import { CandlestickChart } from '../components/charts/CandlestickChart'
import { TechnicalPanel } from '../components/analysis/TechnicalPanel'
import { StatisticsPanel } from '../components/analysis/StatisticsPanel'
import { LLMSummaryPanel } from '../components/analysis/LLMSummaryPanel'
import { TrendPanel } from '../components/analysis/TrendPanel'
import { SectorCard } from '../components/market/SectorCard'
import { ActionPlaybookPanel } from '../components/analysis/ActionPlaybookPanel'
import { TechnicalGauge } from '../components/analysis/TechnicalGauge'
import { CPRPanel } from '../components/analysis/CPRPanel'
import { MarketRegimeCard } from '../components/analysis/MarketRegimeCard'
import { OpportunitiesPanel } from '../components/analysis/OpportunitiesPanel'
import { MarketMetricsPanel } from '../components/analysis/MarketMetricsPanel'
import { MarketAssessmentCard } from '../components/analysis/MarketAssessmentCard'
import { MacroContextCard } from '../components/analysis/MacroContextCard'
import { ValuationPanel } from '../components/analysis/ValuationPanel'

const DETAIL_POLL_MS = 60_000

// ── Compact Performance Card ───────────────────────────────────────────────────
function PerformanceCard({
  stats, currency, lastClose, benchmarkStats,
}: {
  stats: StatisticalMetrics
  currency: string
  lastClose: number
  benchmarkStats?: StatisticalMetrics | null
}) {
  const w52Range =
    stats.week52_high != null && stats.week52_low != null
      ? stats.week52_high - stats.week52_low
      : null
  const w52Position =
    w52Range && stats.week52_low != null
      ? ((lastClose - stats.week52_low) / w52Range) * 100
      : null

  const rows = [
    { label: 'Today', value: stats.daily_return_pct },
    { label: 'This week', value: stats.weekly_return_pct },
    { label: 'This month', value: stats.monthly_return_pct },
    { label: 'Past year', value: stats.yearly_return_pct },
    { label: 'Year to date', value: stats.ytd_return_pct },
  ]

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70">Performance</h3>

      <div className="space-y-2.5">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-xs text-text-muted">{label}</span>
            <span
              className={`text-sm font-mono font-bold ${
                value == null ? 'text-text-muted' : value >= 0 ? 'text-up' : 'text-down'
              }`}
            >
              {value != null ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` : '—'}
            </span>
          </div>
        ))}
      </div>

      {w52Position != null && (
        <div className="pt-4 border-t border-border space-y-2">
          <div className="flex justify-between text-[10px] text-text-muted">
            <span>{stats.week52_low?.toLocaleString()} {currency}</span>
            <span className="text-accent font-mono font-bold">{w52Position.toFixed(0)}% of 52W range</span>
            <span>{stats.week52_high?.toLocaleString()} {currency}</span>
          </div>
          <div className="h-2 bg-bg rounded-full overflow-hidden border border-border">
            <div
              className="h-full bg-accent rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, Math.max(0, w52Position))}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-text-muted">
            <span>52W Low</span>
            <span>52W High</span>
          </div>
        </div>
      )}

      {stats.volatility_20d != null && (
        <div className="pt-3 border-t border-border flex items-center justify-between">
          <span className="text-xs text-text-muted">20D Annualised Vol</span>
          <span className="text-sm font-mono font-bold text-text-primary">
            {stats.volatility_20d.toFixed(1)}%
          </span>
        </div>
      )}

      {/* Alpha vs S&P 500 */}
      {benchmarkStats && (
        <div className="pt-3 border-t border-border space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/60">vs S&amp;P 500</p>
          {([
            ['1M alpha', stats.monthly_return_pct, benchmarkStats.monthly_return_pct],
            ['YTD alpha', stats.ytd_return_pct, benchmarkStats.ytd_return_pct],
            ['1Y alpha',  stats.yearly_return_pct, benchmarkStats.yearly_return_pct],
          ] as const).map(([label, val, bval]) => {
            if (val == null || bval == null) return null
            const alpha = val - bval
            return (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-text-muted">{label}</span>
                <span className={`text-sm font-mono font-bold ${alpha >= 0 ? 'text-up' : 'text-down'}`}>
                  {alpha >= 0 ? '+' : ''}{alpha.toFixed(1)}%
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Compact Trend Card ─────────────────────────────────────────────────────────
function trendArrow(label: TimeframeTrend['trend_label']): string {
  const m: Record<string, string> = {
    strong_uptrend: '↑↑', uptrend: '↑', weak_uptrend: '↗',
    flat: '→', weak_downtrend: '↘', downtrend: '↓', strong_downtrend: '↓↓',
  }
  return m[label] ?? '→'
}

function trendDirColor(dir: TimeframeTrend['direction']): string {
  return dir === 'up' ? 'text-up' : dir === 'down' ? 'text-down' : 'text-neutral'
}

function CompactTrendCard({ trend }: { trend: MultiTimeframeTrend }) {
  const frames: { label: string; data: TimeframeTrend }[] = [
    { label: 'Daily', data: trend.daily },
    { label: 'Weekly', data: trend.weekly },
    { label: 'Monthly', data: trend.monthly },
    { label: 'Yearly', data: trend.yearly },
  ]

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70">Multi-Timeframe Trend</h3>

      <div className="space-y-3">
        {frames.map(({ label, data }) => (
          <div key={label} className="flex items-center gap-3">
            <span className={`text-2xl font-black w-8 flex-shrink-0 leading-none ${trendDirColor(data.direction)}`}>
              {trendArrow(data.trend_label)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-xs font-semibold text-text-primary">{label}</span>
                <span
                  className={`text-xs font-mono flex-shrink-0 ${
                    (data.total_return_pct ?? 0) >= 0 ? 'text-up' : 'text-down'
                  }`}
                >
                  {data.total_return_pct != null
                    ? `${data.total_return_pct >= 0 ? '+' : ''}${data.total_return_pct.toFixed(1)}%`
                    : ''}
                </span>
              </div>
              <p className="text-[11px] text-text-muted capitalize">{data.trend_label.replace(/_/g, ' ')}</p>
              <div className="relative h-1 bg-border/50 rounded-full mt-1.5 overflow-hidden">
                <div
                  className={`absolute top-0 h-full rounded-full ${data.trend_score >= 0 ? 'bg-up' : 'bg-down'}`}
                  style={{
                    left: data.trend_score >= 0 ? '50%' : `${(0.5 + data.trend_score / 2) * 100}%`,
                    width: `${Math.abs(data.trend_score) * 50}%`,
                  }}
                />
                <div className="absolute top-0 left-1/2 w-px h-full bg-border/80" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {trend.yearly.next_period_forecast != null && trend.yearly.forecast_reliability !== 'unavailable' && (
        <div className="pt-4 border-t border-border">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-text-muted">Yearly forecast</span>
            <span
              className={`text-sm font-mono font-bold ${
                (trend.yearly.forecast_change_pct ?? 0) >= 0 ? 'text-up' : 'text-down'
              }`}
            >
              {trend.yearly.next_period_forecast.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-text-muted">
              {trend.yearly.forecast_change_pct != null
                ? `${trend.yearly.forecast_change_pct >= 0 ? '+' : ''}${trend.yearly.forecast_change_pct.toFixed(1)}% · ${trend.yearly.forecast_reliability} reliability`
                : ''}
            </span>
            {trend.yearly.hurst_exponent != null && (
              <span className="text-[10px] text-text-muted">
                Hurst: {trend.yearly.hurst_exponent.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Compact Opening Range Card ─────────────────────────────────────────────────
function CompactOpeningRangeCard({ data }: { data: OpeningRangeResult }) {
  const { gap } = data
  const isUp = gap.gap_type === 'GAP_UP'
  const isDown = gap.gap_type === 'GAP_DOWN'
  const sign = gap.gap_pct >= 0 ? '+' : ''
  const gapColor = isUp
    ? 'text-up bg-up/10 border-up/30'
    : isDown
    ? 'text-down bg-down/10 border-down/30'
    : 'text-neutral bg-neutral/10 border-neutral/30'

  const current = data.ohol_current ?? data.ohol
  const isBullishOHOL = current.signal === 'OPEN_LOW'
  const isBearishOHOL = current.signal === 'OPEN_HIGH'
  const oholColor = isBullishOHOL
    ? 'text-up bg-up/10 border-up/30'
    : isBearishOHOL
    ? 'text-down bg-down/10 border-down/30'
    : 'text-neutral bg-neutral/10 border-neutral/30'
  const oholLabel = isBullishOHOL
    ? 'Open = Low · Bullish signal'
    : isBearishOHOL
    ? 'Open = High · Bearish signal'
    : current.signal === 'DOJI'
    ? 'Doji · Undecided'
    : current.signal === 'UNAVAILABLE'
    ? 'Intraday data N/A'
    : 'No OHOL signal'

  const gaps = data.historical_gaps.slice(-20)
  const MAX_PCT = 2
  const flatPct = Math.max(0, 100 - data.gap_up_pct - data.gap_down_pct)

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70">Opening Range</h3>

      <div className="flex items-center gap-3">
        <div className={`flex-shrink-0 rounded-xl border px-4 py-3 text-center ${gapColor}`}>
          <p className="text-[9px] font-bold uppercase tracking-widest opacity-70 mb-1">
            {isUp ? 'Gap Up' : isDown ? 'Gap Down' : 'Flat Open'}
          </p>
          <p className="text-2xl font-black font-mono leading-none">
            {sign}{gap.gap_pct.toFixed(2)}%
          </p>
        </div>
        <div className="flex-1 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-text-muted">Prev close</span>
            <span className="font-mono font-semibold text-text-primary">
              {gap.prev_close.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Today open</span>
            <span className="font-mono font-semibold text-text-primary">
              {gap.open_price.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Gap size</span>
            <span className={`font-mono font-semibold ${isUp ? 'text-up' : isDown ? 'text-down' : 'text-neutral'}`}>
              {sign}{gap.gap_pts.toLocaleString(undefined, { maximumFractionDigits: 1 })} pts
            </span>
          </div>
        </div>
      </div>

      {current.signal !== 'UNAVAILABLE' && (
        <div className={`rounded-xl border px-3 py-2.5 ${oholColor}`}>
          <p className="text-xs font-bold">{oholLabel}</p>
          {current.entry_trigger_long != null && (
            <p className="text-[11px] font-mono mt-1 opacity-90">
              Long above {current.entry_trigger_long.toLocaleString()}
            </p>
          )}
          {current.entry_trigger_short != null && (
            <p className="text-[11px] font-mono mt-1 opacity-90">
              Short below {current.entry_trigger_short.toLocaleString()}
            </p>
          )}
        </div>
      )}

      {gaps.length > 0 && (
        <div className="pt-3 border-t border-border space-y-2">
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-text-muted">30-day gaps:</span>
            <span className="text-up font-semibold">{data.gap_up_pct}% up</span>
            <span className="text-down font-semibold">{data.gap_down_pct}% down</span>
            <span className="text-neutral font-semibold">{flatPct.toFixed(0)}% flat</span>
          </div>
          <div className="flex items-end gap-px h-8">
            {gaps.map((day, i) => {
              const h = Math.min(100, (Math.abs(day.gap_pct) / MAX_PCT) * 100)
              const bg =
                day.gap_type === 'GAP_UP' ? '#26B856' : day.gap_type === 'GAP_DOWN' ? '#EF5350' : '#6B7280'
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col justify-end"
                  style={{ height: '100%' }}
                  title={`${day.date}: ${day.gap_pct >= 0 ? '+' : ''}${day.gap_pct.toFixed(2)}% (${day.gap_type})`}
                >
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

// ── Main Page ──────────────────────────────────────────────────────────────────
export function IndexDetail() {
  const { symbol } = useParams<{ symbol: string }>()
  const navigate = useNavigate()
  const {
    indices, analysis, analysisLoading, summaries, summaryLoading, trends, trendLoading,
    opportunities, opportunitiesLoading, macro, macroLoading,
    valuations, valuationLoading,
    fetchAnalysis, fetchSummary, fetchTrend, fetchIndices, fetchOpportunities, fetchMacro,
    fetchValuation,
  } = useMarketStore()

  const sym = symbol?.toUpperCase() ?? ''
  const indexData = indices.find((i) => i.symbol === sym)
  const analysisData = analysis[sym]
  const isAnalysisLoading = analysisLoading[sym] ?? false
  const summaryData = summaries[sym]
  const isSummaryLoading = summaryLoading[sym] ?? false
  const trendData = trends[sym]
  const isTrendLoading = trendLoading[sym] ?? false

  const [history, setHistory] = useState<HistoryResponse | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [chartInterval, setChartInterval] = useState<'1d' | '1h' | '15m' | '5m'>('1d')
  const [sectorData, setSectorData] = useState<IndexSectorAnalysis | null>(null)
  const [sectorLoading, setSectorLoading] = useState(false)
  const [openingRange, setOpeningRange] = useState<OpeningRangeResult | null>(null)
  const [openingRangeLoading, setOpeningRangeLoading] = useState(false)
  const [pcr, setPcr] = useState<PCRResult | null>(null)
  const [pcrLoading, setPcrLoading] = useState(false)
  const [pcrUnavailable, setPcrUnavailable] = useState(false)
  const [showDeepDive, setShowDeepDive] = useState(false)
  const INDIA_SYMBOLS = new Set(['NSEI', 'CNX100', 'CNX200', 'NSEBANK'])

  // Benchmark: S&P 500 stats for relative performance (alpha calculation)
  const benchmarkStats = sym !== 'GSPC' ? (analysis['GSPC']?.statistical ?? null) : null

  useEffect(() => {
    if (indices.length === 0) fetchIndices()
  }, [indices.length, fetchIndices])

  // Pre-fetch S&P 500 analysis for relative performance (alpha vs benchmark)
  useEffect(() => {
    if (sym && sym !== 'GSPC' && !analysis['GSPC'] && !analysisLoading['GSPC']) {
      fetchAnalysis('GSPC')
    }
  }, [sym, analysis, analysisLoading, fetchAnalysis])

  // Macro context — fetched once on mount, cached 1h server-side
  useEffect(() => {
    if (!macro && !macroLoading) fetchMacro()
  }, [macro, macroLoading, fetchMacro])

  // Valuation — fetched once per symbol, cached 6h server-side
  useEffect(() => {
    if (!sym) return
    if (!valuations[sym] && !valuationLoading[sym]) fetchValuation(sym)
  }, [sym, valuations, valuationLoading, fetchValuation])

  // Re-fetch history when chart interval changes
  useEffect(() => {
    if (!sym) return
    setHistoryLoading(true)
    api
      .getHistory(sym, chartInterval)
      .then(setHistory)
      .catch(() => setHistory(null))
      .finally(() => setHistoryLoading(false))
  }, [sym, chartInterval])

  useEffect(() => {
    if (sym) {
      const fetchAll = () => {
        fetchIndices()
        fetchAnalysis(sym)
        fetchTrend(sym)
        setHistoryLoading(true)
        api
          .getHistory(sym, chartInterval)
          .then(setHistory)
          .catch(() => setHistory(null))
          .finally(() => setHistoryLoading(false))
        setSectorLoading(true)
        api
          .getIndexSectors(sym)
          .then(setSectorData)
          .catch(() => setSectorData(null))
          .finally(() => setSectorLoading(false))
        setOpeningRangeLoading(true)
        api
          .getOpeningRange(sym)
          .then(setOpeningRange)
          .catch(() => setOpeningRange(null))
          .finally(() => setOpeningRangeLoading(false))
        setPcrLoading(true)
        setPcrUnavailable(false)
        api.getPCR(sym)
          .then((result) => { setPcr(result); if (result === null) setPcrUnavailable(true) })
          .catch(() => { setPcr(null); setPcrUnavailable(true) })
          .finally(() => setPcrLoading(false))
      }
      fetchAll()
      const id = window.setInterval(fetchAll, DETAIL_POLL_MS)
      return () => window.clearInterval(id)
    }
  }, [sym, fetchAnalysis, fetchTrend, fetchIndices, chartInterval])

  useEffect(() => {
    if (sym && INDIA_SYMBOLS.has(sym)) {
      fetchOpportunities(sym)
    }
  }, [sym, fetchOpportunities]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!sym) return null

  const sentiment = analysisData?.overall_sentiment
  const sentimentClasses =
    sentiment === 'bullish'
      ? 'text-up bg-up/10 border-up/30'
      : sentiment === 'bearish'
      ? 'text-down bg-down/10 border-down/30'
      : 'text-neutral bg-neutral/10 border-neutral/30'

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

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-black text-text-primary">{indexData?.name ?? sym}</h1>
            {indexData && (
              <div className="flex flex-wrap items-baseline gap-x-2 sm:gap-x-3 gap-y-1 mt-1.5">
                <span
                  className={`text-2xl sm:text-3xl font-black font-mono ${
                    indexData.change_pct >= 0 ? 'text-up' : 'text-down'
                  }`}
                >
                  {indexData.last_close.toLocaleString()}
                </span>
                <span className="text-sm text-text-muted font-medium">{indexData.currency}</span>
                <span
                  className={`text-base sm:text-lg font-bold ${indexData.change_pct >= 0 ? 'text-up' : 'text-down'}`}
                >
                  {indexData.change_pct >= 0 ? '▲' : '▼'} {Math.abs(indexData.change_pct).toFixed(2)}%
                </span>
                <span className="text-xs sm:text-sm text-text-muted">
                  Prev {indexData.prev_close.toLocaleString()}
                  {indexData.prev_trade_date ? ` · ${indexData.prev_trade_date}` : ''}
                </span>
                <span className="text-xs sm:text-sm text-text-muted">{indexData.trade_date}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {indexData?.tradingview_url && (
              <a
                href={indexData.tradingview_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full border border-border text-text-muted hover:text-text-primary hover:border-accent/40 transition-colors"
              >
                TradingView ↗
              </a>
            )}
            {sentiment && (
              <span
                className={`text-xs sm:text-sm font-bold px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border capitalize ${sentimentClasses}`}
              >
                {sentiment === 'bullish' ? '↑ Bullish' : sentiment === 'bearish' ? '↓ Bearish' : '→ Neutral'}
              </span>
            )}
          </div>
        </div>

        {indexData?.note && (
          <p className="mt-3 text-xs text-text-muted leading-relaxed max-w-3xl">{indexData.note}</p>
        )}
      </div>

      {/* ── Price Chart ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 justify-end flex-wrap">
        {(['5m', '15m', '1h', '1d'] as const).map((iv) => (
          <button
            key={iv}
            onClick={() => setChartInterval(iv)}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              chartInterval === iv
                ? 'text-accent border-accent/40 bg-accent/10'
                : 'text-text-muted border-border hover:text-text-primary'
            }`}
          >
            {iv === '5m' ? '5m' : iv === '15m' ? '15m' : iv === '1h' ? '1h' : '1D'}
          </button>
        ))}
      </div>
      {historyLoading ? (
        <div className="bg-surface border border-border rounded-2xl h-[300px] sm:h-[560px] flex items-center justify-center">
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

      {/* ── Market Assessment ────────────────────────────────────────────────────
          Answers the three investor questions: direction, extent, timeframe */}
      {analysisData && trendData && history && (
        <MarketAssessmentCard
          analysis={analysisData}
          trend={trendData}
          cpr={history.cpr}
          macro={macro}
          valuation={valuations[sym] ?? null}
          pctAboveSma200={sectorData?.pct_above_sma200 ?? null}
        />
      )}

      {/* ── Snapshot: Returns · Trend · Opening Range ─────────────────────────
          Quick numbers at a glance — how it performed, which direction, gap info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {analysisData ? (
          <PerformanceCard
            stats={analysisData.statistical}
            currency={analysisData.currency}
            lastClose={analysisData.last_close}
            benchmarkStats={benchmarkStats}
          />
        ) : isAnalysisLoading ? (
          <div className="bg-surface border border-border rounded-2xl animate-pulse h-64" />
        ) : (
          <div />
        )}

        {trendData ? (
          <CompactTrendCard trend={trendData} />
        ) : isTrendLoading ? (
          <div className="bg-surface border border-border rounded-2xl animate-pulse h-64" />
        ) : (
          <div />
        )}

        {openingRangeLoading ? (
          <div className="bg-surface border border-border rounded-2xl animate-pulse h-64" />
        ) : openingRange ? (
          <CompactOpeningRangeCard data={openingRange} />
        ) : (
          <div className="bg-surface border border-border rounded-2xl p-5">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70 mb-2">
              Opening Range
            </h3>
            <p className="text-xs text-text-muted italic">Not available for this index.</p>
          </div>
        )}
      </div>

      {/* ── Return Breakdown ─────────────────────────────────────────────────────
          Rate of change across timeframes, drawdown, and overnight vs intraday split */}
      {analysisData && (
        <MarketMetricsPanel
          stats={analysisData.statistical}
          tech={analysisData.technical}
          currency={analysisData.currency}
          lastClose={analysisData.last_close}
        />
      )}

      {/* ── Macro Context ────────────────────────────────────────────────────────
          Global forces: VIX, bond yields, currencies, commodities */}
      {(macro || macroLoading) && (
        <MacroContextCard data={macro!} loading={macroLoading && !macro} />
      )}

      {/* ── Valuation ────────────────────────────────────────────────────────────
          PE ratio vs historical average, P/B, dividend yield, equity risk premium */}
      {(valuations[sym] || valuationLoading[sym]) && (
        <ValuationPanel
          data={valuations[sym]!}
          loading={valuationLoading[sym] && !valuations[sym]}
        />
      )}

      {/* ── Market Regime ────────────────────────────────────────────────────────
          What phase the market is in and what that implies for positioning */}
      {analysisData?.regime && (
        <MarketRegimeCard regime={analysisData.regime} />
      )}

      {/* ── Technical Score ──────────────────────────────────────────────────────
          Aggregated buy/sell/neutral signal across oscillators and moving averages */}
      {history && analysisData && (
        <TechnicalGauge bars={history.bars} tech={analysisData.technical} />
      )}

      {/* ── Pivot Levels & Options Positioning ──────────────────────────────────
          Key intraday price zones (CPR) and options market sentiment (PCR) */}
      {history && history.cpr?.length > 0 && analysisData && (
        <CPRPanel
          cpr={history.cpr}
          lastClose={analysisData.last_close}
          currency={analysisData.currency}
          pcr={pcr}
          pcrLoading={pcrLoading}
          pcrUnavailable={pcrUnavailable}
        />
      )}

      {/* ── Action Playbook ──────────────────────────────────────────────────────
          Sector-driven buy / watch / trim recommendations */}
      <ActionPlaybookPanel
        indexData={indexData}
        analysis={analysisData ?? null}
        trend={trendData ?? null}
        sectorData={sectorData}
        loading={isAnalysisLoading || isTrendLoading || sectorLoading}
        assetType="index"
      />

      {/* ── Trade Setups (India indices only) ────────────────────────────────────
          High-quality long and short setups within index constituents */}
      {INDIA_SYMBOLS.has(sym) && (
        <OpportunitiesPanel
          symbol={sym}
          setups={opportunities[sym] ?? []}
          loading={opportunitiesLoading[sym] ?? false}
        />
      )}

      {/* ── AI Commentary ────────────────────────────────────────────────────────
          Plain-English synthesis of all indicators and market context */}
      <LLMSummaryPanel
        summary={summaryData ?? null}
        loading={isSummaryLoading}
        onFetch={() => fetchSummary(sym)}
      />

      {/* ── Detailed Analysis (collapsible) ──────────────────────────────────────
          Full indicator values, statistics, multi-timeframe trend, market internals */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowDeepDive((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-bg/40 transition-colors"
        >
          <div className="text-left">
            <p className="text-sm font-semibold text-text-primary">Detailed Analysis</p>
            <p className="text-xs text-text-muted mt-0.5">
              Indicator values · Return breakdown · Multi-timeframe trends · Sector internals
            </p>
          </div>
          <svg
            className={`w-5 h-5 text-text-muted transition-transform duration-200 ${showDeepDive ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showDeepDive && (
          <div className="px-5 pb-6 space-y-6 border-t border-border pt-5">

            {/* Indicator breakdown & statistics side-by-side */}
            {analysisData ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TechnicalPanel data={analysisData.technical} currency={analysisData.currency} />
                <StatisticsPanel
                  data={analysisData.statistical}
                  currency={analysisData.currency}
                  lastClose={analysisData.last_close}
                />
              </div>
            ) : (
              <p className="text-sm text-text-muted italic text-center py-8">Analysis data not available.</p>
            )}

            {/* Multi-timeframe trend analysis */}
            <TrendPanel trend={trendData ?? null} loading={isTrendLoading} />

            {/* Sector & constituent breakdown */}
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-4">Sector Breakdown</h3>
              {sectorLoading ? (
                <div className="bg-bg border border-border rounded-xl h-64 animate-pulse" />
              ) : sectorData ? (
                <SectorCard data={sectorData} />
              ) : (
                <p className="text-sm text-text-muted italic">
                  Sector data not available for this index.
                </p>
              )}
            </div>

          </div>
        )}
      </div>

    </div>
  )
}
