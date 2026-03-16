import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createChart, type IChartApi, type Time, ColorType, LineStyle } from 'lightweight-charts'
import { usePaperTradeStore } from '../store/usePaperTradeStore'
import { api } from '../services/api'
import type { ExitAlert, PaperTrade, PaperTradeLiveStatus, TradeProjection, TradeStatus } from '../types/paper_trade'

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(n: number | null | undefined): string {
  if (n == null) return '—'
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return '—'
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: decimals })
}

function daysBetween(a: string, b: string | null): number {
  const msPerDay = 86400000
  const dateA = new Date(a).getTime()
  const dateB = b ? new Date(b).getTime() : Date.now()
  return Math.max(0, Math.floor((dateB - dateA) / msPerDay))
}

function statusLabel(s: TradeStatus): { label: string; cls: string } {
  switch (s) {
    case 'OPEN':       return { label: 'Open',        cls: 'text-accent bg-accent/10 border-accent/30' }
    case 'TARGET_HIT': return { label: 'Target Hit',  cls: 'text-green-400 bg-green-500/10 border-green-500/30' }
    case 'STOP_HIT':   return { label: 'Stop Hit',    cls: 'text-red-400 bg-red-500/10 border-red-500/30' }
    case 'TREND_EXIT': return { label: 'Trend Exit',  cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' }
    case 'TIME_STOP':  return { label: 'Time Stop',   cls: 'text-orange-400 bg-orange-500/10 border-orange-500/30' }
    case 'CLOSED':     return { label: 'Closed',      cls: 'text-text-muted bg-border/20 border-border/40' }
  }
}

function alertSeverityCls(sev: ExitAlert['severity']) {
  switch (sev) {
    case 'danger':  return 'bg-red-50 border-red-200 text-red-900'
    case 'success': return 'bg-green-50 border-green-200 text-green-900'
    case 'warning': return 'bg-amber-50 border-amber-200 text-amber-900'
    case 'info':    return 'bg-blue-50 border-blue-200 text-blue-900'
  }
}

function alertIcon(type: ExitAlert['type']) {
  switch (type) {
    case 'stop_hit':       return '⛔'
    case 'target_hit':     return '🎯'
    case 'partial_target': return '📊'
    case 'trend_exit':     return '⚠️'
    case 'time_stop':      return '⏱'
  }
}

function alertMeta(type: ExitAlert['type']): { title: string; desc: string } {
  switch (type) {
    case 'stop_hit':       return { title: 'Stop Loss Hit',    desc: 'Price has reached your stop level. Consider closing this position now.' }
    case 'target_hit':     return { title: 'Target Reached',   desc: 'Your profit target has been hit. Time to lock in your gains.' }
    case 'partial_target': return { title: 'Halfway to Target', desc: 'Price has moved 60% toward your target. Consider a partial exit.' }
    case 'trend_exit':     return { title: 'Trend Weakening',   desc: 'Short-term momentum has turned bearish. Review whether to stay in.' }
    case 'time_stop':      return { title: '20-Day Limit',      desc: 'This trade has been open for 20 days without a decisive move.' }
  }
}

function alertCircleCls(sev: ExitAlert['severity']) {
  switch (sev) {
    case 'danger':  return 'bg-red-100 border-red-300'
    case 'success': return 'bg-green-100 border-green-300'
    case 'warning': return 'bg-amber-100 border-amber-300'
    case 'info':    return 'bg-blue-100 border-blue-300'
  }
}

// Background + border for page-level alert cards
function pageAlertBgCls(sev: ExitAlert['severity']) {
  switch (sev) {
    case 'danger':  return 'bg-red-50 border-red-200'
    case 'success': return 'bg-green-50 border-green-200'
    case 'warning': return 'bg-amber-50 border-amber-200'
    case 'info':    return 'bg-blue-50 border-blue-200'
  }
}

// Dark accent color for stock name + review button (readable on light tint)
function pageAlertAccentCls(sev: ExitAlert['severity']) {
  switch (sev) {
    case 'danger':  return 'text-red-700'
    case 'success': return 'text-green-800'
    case 'warning': return 'text-amber-800'
    case 'info':    return 'text-blue-800'
  }
}

function strategyLabel(s: string): string {
  const map: Record<string, string> = {
    pullback: 'Pullback',
    breakout: 'Breakout',
    momentum: 'Momentum',
    reversal: 'Reversal',
    orb: 'Opening Range Breakout',
    swing: 'Swing',
  }
  return map[s.toLowerCase()] ?? s
}

// ── Close Trade Modal ─────────────────────────────────────────────────────────

function CloseModal({
  trade,
  currentPrice,
  onClose,
  onConfirm,
}: {
  trade: PaperTrade
  currentPrice: number | null
  onClose: () => void
  onConfirm: (exitPrice: number) => void
}) {
  const [exitPrice, setExitPrice] = useState(currentPrice?.toFixed(2) ?? trade.entry_price.toFixed(2))
  const ep = parseFloat(exitPrice) || 0
  const pnl = (ep - trade.entry_price) * trade.shares

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-sm z-10 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-text-primary">Close Trade</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-xl leading-none">×</button>
        </div>
        <p className="text-sm text-text-muted mb-4">
          {trade.symbol.replace('.NS', '')} · Entry ₹{trade.entry_price.toFixed(2)} · {trade.shares} shares
        </p>
        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Exit Price</label>
        <input
          type="number"
          value={exitPrice}
          onChange={(e) => setExitPrice(e.target.value)}
          className="w-full text-sm font-mono font-semibold bg-bg border border-border rounded-lg px-3 py-2.5 text-text-primary focus:outline-none focus:border-accent mb-3"
          step="0.5"
        />
        <div className={`rounded-xl px-3 py-2 mb-4 text-sm font-semibold ${pnl >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          P&L: {pnl >= 0 ? '+' : ''}₹{Math.abs(pnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
        </div>
        <div className="flex gap-2.5">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm border border-border rounded-xl text-text-secondary hover:border-accent/50 transition-colors">Cancel</button>
          <button
            onClick={() => onConfirm(ep)}
            className="flex-1 py-2.5 text-sm font-bold bg-accent text-white rounded-xl hover:bg-accent/90 transition-colors"
          >
            Confirm Exit
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Price Ladder Visual ───────────────────────────────────────────────────────

function PriceLadder({ trade, currentPrice }: { trade: PaperTrade; currentPrice?: number | null }) {
  const stop   = trade.stop_price
  const entry  = trade.entry_price
  const target = trade.target_price
  const exit   = trade.exit_price

  const stopDist   = entry - stop
  const targetDist = target - entry
  const rr         = stopDist > 0 ? (targetDist / stopDist).toFixed(1) : '—'

  // Price to show on the ladder
  const livePrice = exit ?? currentPrice

  // Compute position of livePrice as % within stop→target range
  const totalRange = target - stop
  const livePct = livePrice != null && totalRange > 0
    ? Math.min(100, Math.max(0, ((livePrice - stop) / totalRange) * 100))
    : null

  return (
    <div className="space-y-3">
      {/* Ladder bar */}
      <div className="relative h-8 rounded-full overflow-visible mx-2">
        {/* Background track */}
        <div className="absolute inset-0 rounded-full bg-bg border border-border/40" />
        {/* Green fill: entry to target */}
        <div
          className="absolute top-0 bottom-0 rounded-r-full bg-green-500/20 border-r border-green-500/30"
          style={{
            left: `${((entry - stop) / (target - stop)) * 100}%`,
            right: 0,
          }}
        />
        {/* Red fill: stop to entry */}
        <div
          className="absolute top-0 bottom-0 rounded-l-full bg-red-500/20 border-r border-red-500/30"
          style={{
            left: 0,
            right: `${((target - entry) / (target - stop)) * 100}%`,
          }}
        />
        {/* Entry marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-text-muted/60"
          style={{ left: `${((entry - stop) / (target - stop)) * 100}%` }}
        />
        {/* Live price dot */}
        {livePct != null && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-lg z-10 ${
              exit != null
                ? (exit >= entry ? 'bg-green-400' : 'bg-red-400')
                : 'bg-accent'
            }`}
            style={{ left: `calc(${livePct}% - 7px)` }}
          />
        )}
      </div>

      {/* Level labels */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-red-500/5 border border-red-500/20 px-2 py-2">
          <p className="text-[10px] text-red-400/70 mb-0.5 font-semibold">Stop Loss</p>
          <p className="text-sm font-mono font-bold text-red-400">{fmt(stop)}</p>
          <p className="text-[10px] text-red-400/60 mt-0.5">−{fmt(stopDist)} ({((stopDist / entry) * 100).toFixed(1)}%)</p>
        </div>
        <div className="rounded-lg bg-bg border border-border px-2 py-2">
          <p className="text-[10px] text-text-muted mb-0.5 font-semibold">Entry</p>
          <p className="text-sm font-mono font-bold text-text-primary">{fmt(entry)}</p>
          <p className="text-[10px] text-text-muted/60 mt-0.5">R/R {rr}×</p>
        </div>
        <div className="rounded-lg bg-green-500/5 border border-green-500/20 px-2 py-2">
          <p className="text-[10px] text-green-400/70 mb-0.5 font-semibold">Target</p>
          <p className="text-sm font-mono font-bold text-green-400">{fmt(target)}</p>
          <p className="text-[10px] text-green-400/60 mt-0.5">+{fmt(targetDist)} ({((targetDist / entry) * 100).toFixed(1)}%)</p>
        </div>
      </div>
    </div>
  )
}

// ── Trade Projection Chart ────────────────────────────────────────────────────

function TradeProjectionChart({ trade }: { trade: PaperTrade }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)
  const [proj, setProj]       = useState<TradeProjection | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.getTradeProjection(
      trade.symbol, trade.entry_price, trade.stop_price, trade.target_price, trade.entry_date,
    ).then((data) => {
      if (!cancelled) { setProj(data); setLoading(false) }
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [trade.id])

  useEffect(() => {
    if (!containerRef.current || loading || !proj) return

    const container = containerRef.current
    const chart = createChart(container, {
      width:  container.offsetWidth || 360,
      height: 185,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(148,163,184,0.65)',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(148,163,184,0.04)' },
        horzLines: { color: 'rgba(148,163,184,0.06)' },
      },
      rightPriceScale: { borderColor: 'rgba(148,163,184,0.1)', scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: 'rgba(148,163,184,0.1)', timeVisible: false },
      crosshair: { mode: 1 },
      handleScroll: false,
      handleScale:  false,
    })
    chartRef.current = chart

    // ── Projection cone ───────────────────────────────────────────────
    if (proj.projection.length > 1) {
      const pts = proj.projection
      const midLine = chart.addLineSeries({ color: 'rgba(129,140,248,0.7)', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false })
      midLine.setData(pts.map(p => ({ time: p.time as Time, value: p.mid })))
      const upperLine = chart.addLineSeries({ color: 'rgba(34,197,94,0.35)', lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false })
      upperLine.setData(pts.map(p => ({ time: p.time as Time, value: p.upper })))
      const lowerLine = chart.addLineSeries({ color: 'rgba(239,68,68,0.35)', lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false })
      lowerLine.setData(pts.map(p => ({ time: p.time as Time, value: p.lower })))
    }

    // ── Actual price path ─────────────────────────────────────────────
    if (proj.actual && proj.actual.length > 0) {
      // For closed trades show path only up to exit date
      const cutoff = trade.exit_date ? new Date(trade.exit_date).getTime() / 1000 : Infinity
      const actualPts = proj.actual
        .filter(p => p.time <= cutoff)
        .map(p => ({ time: p.time as Time, value: p.value }))
      if (actualPts.length > 0) {
        const actualLine = chart.addLineSeries({ color: 'rgba(255,255,255,0.85)', lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
        actualLine.setData(actualPts)
      }
    }

    // ── Price level lines via a hidden anchor series ───────────────────
    const anchor = chart.addLineSeries({ visible: false, priceLineVisible: false, lastValueVisible: false })
    anchor.createPriceLine({ price: trade.entry_price,  color: '#818cf8', lineWidth: 1, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: 'Entry'  })
    anchor.createPriceLine({ price: trade.stop_price,   color: '#ef4444', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Stop'   })
    anchor.createPriceLine({ price: trade.target_price, color: '#22c55e', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Target' })

    chart.timeScale().fitContent()

    return () => { chart.remove(); chartRef.current = null }
  }, [proj, loading])

  const dirCfg = {
    on_track:      { cls: 'text-green-400 bg-green-500/10 border-green-500/30',   icon: '↑' },
    stalling:      { cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30', icon: '→' },
    breaking_down: { cls: 'text-red-400 bg-red-500/10 border-red-500/30',         icon: '↓' },
  }
  const dir = proj?.direction ? dirCfg[proj.direction as keyof typeof dirCfg] : null

  return (
    <div>
      {/* Direction badge */}
      {dir && proj?.direction_label && (
        <div className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 mb-3 ${dir.cls}`}>
          <span className="text-base font-bold shrink-0">{dir.icon}</span>
          <div className="min-w-0">
            <p className="text-xs font-bold leading-none">{proj.direction_label}</p>
            {proj.direction_detail && (
              <p className="text-[10px] opacity-70 mt-0.5 leading-tight">{proj.direction_detail}</p>
            )}
          </div>
          {proj.sigma_annual != null && (
            <span className="ml-auto text-[10px] opacity-50 shrink-0">σ {proj.sigma_annual.toFixed(1)}% p.a.</span>
          )}
        </div>
      )}
      {/* Chart */}
      {loading ? (
        <div className="h-[185px] rounded-xl bg-bg border border-border/40 flex items-center justify-center">
          <span className="text-xs text-text-muted animate-pulse">Loading projection…</span>
        </div>
      ) : (
        <div ref={containerRef} className="rounded-xl overflow-hidden border border-border/20" style={{ height: '185px' }} />
      )}
      {/* GBM legend */}
      {proj && !loading && (
        <div className="flex gap-4 mt-1.5 text-[10px] text-text-muted/60">
          <span className="flex items-center gap-1"><span className="inline-block w-3 border-t border-dashed border-indigo-400/60" />Projected path</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 border-t-2 border-white/60" />Actual price</span>
        </div>
      )}
    </div>
  )
}

// ── Trade Detail Panel ────────────────────────────────────────────────────────

function TradeDetailPanel({
  status,
  onClose,
  onRecordExit,
  onDelete,
}: {
  status: PaperTradeLiveStatus
  onClose: () => void
  onRecordExit: (s: PaperTradeLiveStatus) => void
  onDelete: (id: string) => void
}) {
  const navigate = useNavigate()
  const t = status.trade
  const isOpen = t.status === 'OPEN'

  const stopDist   = t.entry_price - t.stop_price
  const targetDist = t.target_price - t.entry_price
  const riskAmount = stopDist * t.shares
  const maxGain    = targetDist * t.shares
  const rr         = stopDist > 0 ? (targetDist / stopDist) : null
  const daysHeld   = daysBetween(t.entry_date, t.exit_date)

  // Closed trade P&L
  const closedPnl    = t.exit_price != null ? (t.exit_price - t.entry_price) * t.shares : null
  const closedPnlPct = t.exit_price != null ? ((t.exit_price - t.entry_price) / t.entry_price) * 100 : null
  const closedR      = t.exit_price != null && stopDist > 0
    ? (t.exit_price - t.entry_price) / stopDist
    : null

  const { label, cls } = statusLabel(t.status)
  const pnlPos = isOpen ? (status.current_pnl ?? 0) >= 0 : (closedPnl ?? 0) >= 0

  // Outcome narrative for closed trades
  function outcomeNarrative(): string {
    if (!t.exit_price) return ''
    if (t.status === 'TARGET_HIT') return 'Trade hit the full target — excellent execution.'
    if (t.status === 'STOP_HIT') return 'Price hit the stop loss. Risk was controlled as planned.'
    if (t.status === 'TREND_EXIT') return 'Exited early due to weakening momentum (EMA crossover).'
    if (t.status === 'TIME_STOP') return 'Closed after 20 days without a decisive move.'
    return 'Manually closed by you.'
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-md bg-surface border-l border-border shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border/60">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-extrabold text-text-primary">{t.symbol.replace('.NS', '')}</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>
              {t.sector && (
                <span className="text-[10px] font-semibold text-text-muted bg-border/30 px-1.5 py-0.5 rounded">{t.sector}</span>
              )}
            </div>
            <p className="text-sm text-text-muted mt-0.5 truncate">{t.company_name}</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-xl leading-none mt-0.5 shrink-0">×</button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Strategy + Timeline */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-text-muted">Strategy:</span>
              <span className="font-semibold text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded-full">
                {strategyLabel(t.strategy)}
              </span>
            </div>
            <div className="text-text-muted text-right">
              <span>{t.entry_date}</span>
              {t.exit_date && <span className="text-text-muted/50"> → {t.exit_date}</span>}
              <span className="ml-1.5 text-text-muted/70">({daysHeld}d)</span>
            </div>
          </div>

          {/* Price Ladder */}
          <div>
            <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Price Levels</h3>
            <PriceLadder trade={t} currentPrice={status.current_price} />
          </div>

          {/* Projection Chart */}
          <div>
            <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Price Forecast</h3>
            <TradeProjectionChart trade={t} />
          </div>

          {/* Position Details */}
          <div>
            <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Position Details</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Shares',          value: t.shares.toLocaleString('en-IN') },
                { label: 'Capital Deployed', value: fmt(t.entry_price * t.shares, 0) },
                { label: 'Max Risk (stop)',  value: fmt(riskAmount, 0), color: 'text-red-400' },
                { label: 'Max Gain (target)', value: fmt(maxGain, 0), color: 'text-green-400' },
                { label: 'Risk/Reward',     value: rr != null ? rr.toFixed(1) + '×' : '—' },
                { label: 'ATR',             value: t.atr > 0 ? fmt(t.atr) : '—' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-bg rounded-xl px-3 py-2.5">
                  <p className="text-[10px] text-text-muted mb-0.5">{label}</p>
                  <p className={`text-sm font-semibold font-mono ${color ?? 'text-text-primary'}`}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Live Status — open trades */}
          {isOpen && (
            <div>
              <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Live Status</h3>
              <div className="bg-bg rounded-xl px-4 py-3 space-y-3">
                {/* Current price + P&L */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-text-muted mb-0.5">Current Price</p>
                    <p className="text-base font-mono font-bold text-text-primary">
                      {status.current_price != null ? fmt(status.current_price) : '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-text-muted mb-0.5">Unrealised P&L</p>
                    <p className={`text-base font-bold ${pnlPos ? 'text-green-400' : 'text-red-400'}`}>
                      {status.current_pnl != null
                        ? (pnlPos ? '+' : '') + '₹' + Math.abs(status.current_pnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })
                        : '—'}
                    </p>
                    {status.current_pnl_pct != null && (
                      <p className={`text-xs ${pnlPos ? 'text-green-400/70' : 'text-red-400/70'}`}>
                        {pct(status.current_pnl_pct)}
                      </p>
                    )}
                  </div>
                </div>

                {/* R-multiple + progress */}
                <div className="flex items-center justify-between text-sm">
                  {status.r_multiple != null && (
                    <span className={`font-semibold px-2 py-0.5 rounded border ${status.r_multiple >= 0 ? 'text-green-400 border-green-500/20 bg-green-500/5' : 'text-red-400 border-red-500/20 bg-red-500/5'}`}>
                      {status.r_multiple >= 0 ? '+' : ''}{status.r_multiple.toFixed(2)}R
                    </span>
                  )}
                  <span className="text-xs text-text-muted">Day {status.days_open}/20</span>
                </div>

                {/* Progress bar */}
                {status.progress_to_target_pct != null && (
                  <div>
                    <div className="flex justify-between text-[10px] text-text-muted mb-1">
                      <span>Progress to target</span>
                      <span>{status.progress_to_target_pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-surface rounded-full overflow-hidden border border-border/40">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          status.progress_to_target_pct >= 100 ? 'bg-green-500' : status.progress_to_target_pct >= 60 ? 'bg-yellow-400' : 'bg-accent'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, status.progress_to_target_pct))}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* EMAs */}
                {(status.ema20 != null || status.ema50 != null) && (
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/30">
                    {status.ema20 != null && (
                      <div>
                        <p className="text-[10px] text-text-muted mb-0.5">20-day avg price</p>
                        <p className={`text-xs font-mono font-semibold ${status.current_price != null && status.current_price > status.ema20 ? 'text-green-400' : 'text-red-400'}`}>
                          {fmt(status.ema20)}
                        </p>
                      </div>
                    )}
                    {status.ema50 != null && (
                      <div>
                        <p className="text-[10px] text-text-muted mb-0.5">50-day avg price</p>
                        <p className={`text-xs font-mono font-semibold ${status.current_price != null && status.current_price > status.ema50 ? 'text-green-400' : 'text-red-400'}`}>
                          {fmt(status.ema50)}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Final Result — closed trades */}
          {!isOpen && t.exit_price != null && (
            <div>
              <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Trade Result</h3>
              <div className={`rounded-xl border px-4 py-3 space-y-3 ${pnlPos ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-text-muted mb-0.5">Exit Price</p>
                    <p className="text-base font-mono font-bold text-text-primary">{fmt(t.exit_price)}</p>
                    {t.exit_date && <p className="text-[10px] text-text-muted mt-0.5">{t.exit_date}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-text-muted mb-0.5">Final P&L</p>
                    <p className={`text-base font-bold ${pnlPos ? 'text-green-400' : 'text-red-400'}`}>
                      {closedPnl != null
                        ? (pnlPos ? '+' : '') + '₹' + Math.abs(closedPnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })
                        : '—'}
                    </p>
                    {closedPnlPct != null && (
                      <p className={`text-xs ${pnlPos ? 'text-green-400/70' : 'text-red-400/70'}`}>
                        {pct(closedPnlPct)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/20">
                  {closedR != null && (
                    <div>
                      <p className="text-[10px] text-text-muted mb-0.5">R-Multiple</p>
                      <span className={`text-sm font-bold px-2 py-0.5 rounded border ${closedR >= 0 ? 'text-green-400 border-green-500/30 bg-green-500/5' : 'text-red-400 border-red-500/30 bg-red-500/5'}`}>
                        {closedR >= 0 ? '+' : ''}{closedR.toFixed(2)}R
                      </span>
                    </div>
                  )}
                  <div className="text-right">
                    <p className="text-[10px] text-text-muted mb-0.5">Days Held</p>
                    <p className="text-sm font-semibold text-text-primary">{daysHeld}d</p>
                  </div>
                </div>

                {/* Forecast vs actual */}
                <div className="pt-2 border-t border-border/20 space-y-1">
                  <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Forecast vs Actual</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-text-muted">Expected gain: </span>
                      <span className="font-mono text-green-400/70">+{fmt(maxGain, 0)}</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Actual gain: </span>
                      <span className={`font-mono ${pnlPos ? 'text-green-400' : 'text-red-400'}`}>
                        {closedPnl != null ? (pnlPos ? '+' : '') + fmt(closedPnl, 0) : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-text-muted">Max risk: </span>
                      <span className="font-mono text-red-400/70">−{fmt(riskAmount, 0)}</span>
                    </div>
                    <div>
                      <span className="text-text-muted">R/R planned: </span>
                      <span className="font-mono text-text-secondary">{rr != null ? rr.toFixed(1) + '×' : '—'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Outcome text */}
              <p className="text-xs text-text-muted italic mt-2 pl-1">{outcomeNarrative()}</p>
            </div>
          )}

          {/* Alerts — open trades */}
          {isOpen && status.alerts.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Action Required</h3>
              <div className="space-y-2">
                {status.alerts.map((a, i) => (
                  <div key={i} className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${alertSeverityCls(a.severity)}`}>
                    <span className="shrink-0 mt-px">{alertIcon(a.type)}</span>
                    <span>{a.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {t.notes && (
            <div>
              <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">Trade Notes</h3>
              <p className="text-sm text-text-muted italic bg-bg rounded-xl px-3 py-2.5 border border-border/40 border-l-2 border-l-accent/40">
                {t.notes}
              </p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-border/60 flex gap-2.5">
          <button
            onClick={() => navigate(`/stock/${t.symbol}`)}
            className="flex-1 py-2.5 text-sm border border-border rounded-xl text-text-secondary hover:border-accent/50 hover:text-accent transition-colors"
          >
            View Chart →
          </button>
          {isOpen && (
            <>
              <button
                onClick={() => onRecordExit(status)}
                className="flex-1 py-2.5 text-sm font-bold bg-accent text-white rounded-xl hover:bg-accent/90 transition-colors"
              >
                Record Exit
              </button>
              <button
                onClick={() => { onDelete(t.id); onClose() }}
                className="py-2.5 px-3 text-sm text-text-muted border border-border rounded-xl hover:border-red-500/40 hover:text-red-400 transition-colors"
                title="Delete trade"
              >
                ✕
              </button>
            </>
          )}
          {!isOpen && (
            <button
              onClick={() => { onDelete(t.id); onClose() }}
              className="py-2.5 px-3 text-sm text-text-muted border border-border rounded-xl hover:border-red-500/40 hover:text-red-400 transition-colors"
              title="Delete trade"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Open Trade Card ───────────────────────────────────────────────────────────

function OpenTradeCard({
  status,
  onClose,
  onDelete,
  onClick,
}: {
  status: PaperTradeLiveStatus
  onClose: (s: PaperTradeLiveStatus) => void
  onDelete: (id: string) => void
  onClick: (s: PaperTradeLiveStatus) => void
}) {
  const t = status.trade
  const pnlPos = (status.current_pnl ?? 0) >= 0
  const progress = status.progress_to_target_pct ?? 0
  const hasAlerts = status.alerts.length > 0
  const worstAlert = hasAlerts ? status.alerts[0] : null

  return (
    <div
      className="bg-surface border border-border rounded-2xl p-4 shadow-panel hover:border-accent/40 transition-colors cursor-pointer flex flex-col"
      onClick={() => onClick(status)}
    >
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-extrabold text-text-primary">{t.symbol.replace('.NS', '')}</span>
            <span className="text-[10px] font-semibold text-text-muted bg-border/40 px-1.5 py-0.5 rounded uppercase">NSE</span>
            {/* Alert badge — compact, replaces full inline alert block */}
            {worstAlert && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border flex items-center gap-0.5 ${alertSeverityCls(worstAlert.severity)}`}>
                {alertIcon(worstAlert.type)} {alertMeta(worstAlert.type).title}
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted truncate mt-0.5" title={t.company_name}>{t.company_name}</p>
        </div>
        <span className="text-xs text-text-muted shrink-0 mt-0.5">Day {status.days_open}/20</span>
      </div>

      {/* ── Price levels ── */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div className="rounded-lg bg-bg px-2 py-1.5">
          <p className="text-[10px] text-text-muted mb-0.5">Entry</p>
          <p className="text-xs font-mono font-semibold text-text-primary">₹{t.entry_price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
        </div>
        <div className="rounded-lg bg-red-50 border border-red-100 px-2 py-1.5">
          <p className="text-[10px] text-red-400 mb-0.5">Stop</p>
          <p className="text-xs font-mono font-semibold text-red-600">₹{t.stop_price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
        </div>
        <div className="rounded-lg bg-green-50 border border-green-100 px-2 py-1.5">
          <p className="text-[10px] text-green-600 mb-0.5">Target</p>
          <p className="text-xs font-mono font-semibold text-green-700">₹{t.target_price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] text-text-muted mb-1">
          <span>Progress to target</span>
          <span>{progress.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 bg-bg rounded-full overflow-hidden border border-border/40">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              progress >= 100 ? 'bg-green-500' : progress >= 60 ? 'bg-yellow-500' : 'bg-accent'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      </div>

      {/* ── Live P&L ── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          {status.current_price != null && (
            <span className="text-sm font-mono font-bold text-text-primary">
              ₹{status.current_price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          )}
          {status.current_pnl != null && (
            <span className={`text-xs font-semibold ${pnlPos ? 'text-green-700' : 'text-red-600'}`}>
              {pnlPos ? '+' : ''}₹{Math.abs(status.current_pnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              {' '}({pct(status.current_pnl_pct)})
            </span>
          )}
          {status.r_multiple != null && (
            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${
              status.r_multiple >= 0
                ? 'text-green-700 border-green-200 bg-green-50'
                : 'text-red-600 border-red-200 bg-red-50'
            }`}>
              {status.r_multiple >= 0 ? '+' : ''}{status.r_multiple.toFixed(2)}R
            </span>
          )}
        </div>
        <span className="text-xs text-text-muted">{t.shares} sh</span>
      </div>

      {/* ── Notes (1 line, truncated) ── */}
      {t.notes ? (
        <p className="text-xs text-text-muted italic mb-3 border-l-2 border-border/60 pl-2 truncate flex-shrink-0" title={t.notes}>
          {t.notes}
        </p>
      ) : (
        /* Empty placeholder keeps height consistent when no notes */
        <div className="mb-3 h-4" />
      )}

      {/* ── Actions — always at bottom ── */}
      <div className="flex gap-2 mt-auto" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onClose(status)}
          className="flex-1 py-2 text-xs font-semibold bg-accent/10 text-accent border border-accent/30 rounded-xl hover:bg-accent/20 transition-colors"
        >
          Record Exit
        </button>
        <button
          onClick={() => onDelete(t.id)}
          className="py-2 px-3 text-xs text-text-muted border border-border rounded-xl hover:border-red-400/50 hover:text-red-500 transition-colors"
          title="Delete trade"
        >
          ✕
        </button>
      </div>
      <p className="text-[10px] text-text-muted/40 text-center mt-2">Tap for full details</p>
    </div>
  )
}

// ── Closed Trade Row ──────────────────────────────────────────────────────────

function ClosedTradeRow({
  status,
  onDelete,
  onClick,
}: {
  status: PaperTradeLiveStatus
  onDelete: (id: string) => void
  onClick: (s: PaperTradeLiveStatus) => void
}) {
  const t = status.trade
  const pnl = t.exit_price != null ? (t.exit_price - t.entry_price) * t.shares : null
  const pnlPct = t.exit_price != null ? ((t.exit_price - t.entry_price) / t.entry_price) * 100 : null
  const stopDist = t.entry_price - t.stop_price
  const closedR  = t.exit_price != null && stopDist > 0 ? (t.exit_price - t.entry_price) / stopDist : null
  const daysHeld = daysBetween(t.entry_date, t.exit_date)
  const pnlPos   = (pnl ?? 0) >= 0
  const { label, cls } = statusLabel(t.status)

  return (
    <tr
      className="border-b border-border/30 hover:bg-accent/5 transition-colors cursor-pointer"
      onClick={() => onClick(status)}
    >
      <td className="py-2.5 pl-4 pr-2">
        <div className="text-sm font-bold text-text-primary">{t.symbol.replace('.NS', '')}</div>
        <div className="text-xs text-text-muted truncate max-w-[120px]">{t.company_name}</div>
      </td>
      <td className="py-2.5 px-3 text-right text-sm font-mono text-text-secondary">
        ₹{t.entry_price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
      </td>
      <td className="py-2.5 px-3 text-right text-sm font-mono text-text-secondary">
        {t.exit_price ? '₹' + t.exit_price.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}
      </td>
      <td className={`py-2.5 px-3 text-right text-sm font-semibold ${pnlPos ? 'text-green-400' : 'text-red-400'}`}>
        <div>{pnl != null ? (pnlPos ? '+' : '') + '₹' + Math.abs(pnl).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'}</div>
        {pnlPct != null && (
          <div className={`text-[10px] ${pnlPos ? 'text-green-400/60' : 'text-red-400/60'}`}>{pct(pnlPct)}</div>
        )}
      </td>
      <td className="py-2.5 px-3 text-center">
        {closedR != null ? (
          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${closedR >= 0 ? 'text-green-400 border-green-500/20 bg-green-500/5' : 'text-red-400 border-red-500/20 bg-red-500/5'}`}>
            {closedR >= 0 ? '+' : ''}{closedR.toFixed(2)}R
          </span>
        ) : <span className="text-text-muted">—</span>}
      </td>
      <td className="py-2.5 px-3 text-center">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>
      </td>
      <td className="py-2.5 px-3 text-right text-xs text-text-muted">
        <div>{t.entry_date}</div>
        <div className="text-text-muted/50">{daysHeld}d held</div>
      </td>
      <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onDelete(t.id)}
          className="text-text-muted hover:text-red-400 transition-colors text-sm"
          title="Delete"
        >✕</button>
      </td>
    </tr>
  )
}

// ── Virtual Capital Editor ────────────────────────────────────────────────────

function CapitalEditor({ capital, onSave }: { capital: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(capital.toFixed(0))

  function handleSave() {
    const n = parseFloat(val)
    if (n > 0) { onSave(n); setEditing(false) }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-muted">₹</span>
        <input
          type="number"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="text-sm font-mono bg-bg border border-accent rounded-lg px-2.5 py-1.5 w-32 text-text-primary focus:outline-none"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
        />
        <button onClick={handleSave} className="text-xs font-semibold text-accent hover:text-accent/80">Save</button>
        <button onClick={() => setEditing(false)} className="text-xs text-text-muted hover:text-text-primary">Cancel</button>
      </div>
    )
  }

  return (
    <button
      onClick={() => { setVal(capital.toFixed(0)); setEditing(true) }}
      className="flex items-center gap-1.5 text-sm font-mono font-semibold text-text-primary hover:text-accent transition-colors group"
      title="Click to change virtual capital"
    >
      ₹{capital.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
      <span className="text-xs text-text-muted group-hover:text-accent transition-colors">✏️</span>
    </button>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function PaperTrades() {
  const navigate = useNavigate()
  const {
    trades, virtualCapital,
    isLoading, error,
    loadTrades, loadSettings, setVirtualCapital,
    closeTrade, deleteTrade,
  } = usePaperTradeStore()

  const [closingStatus,  setClosingStatus]  = useState<PaperTradeLiveStatus | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<PaperTradeLiveStatus | null>(null)
  const [showClosed,     setShowClosed]     = useState(false)

  useEffect(() => {
    loadSettings()
    loadTrades()
  }, [loadSettings, loadTrades])

  const openTrades   = trades.filter((s) => s.trade.status === 'OPEN')
  const closedTrades = trades.filter((s) => s.trade.status !== 'OPEN')

  // Collect all alerts across open trades (carry full status for panel access)
  const allAlerts = openTrades.flatMap((s) =>
    s.alerts.map((a) => ({ alert: a, status: s }))
  )

  // Portfolio summary
  const totalPnl    = openTrades.reduce((sum, s) => sum + (s.current_pnl ?? 0), 0)
  const closedWins  = closedTrades.filter((s) => ['TARGET_HIT'].includes(s.trade.status)).length
  const closedTotal = closedTrades.length
  const winRate     = closedTotal > 0 ? Math.round((closedWins / closedTotal) * 100) : null

  // Total realised P&L
  const realisedPnl = closedTrades.reduce((sum, s) => {
    const t = s.trade
    return sum + (t.exit_price != null ? (t.exit_price - t.entry_price) * t.shares : 0)
  }, 0)

  async function handleClose(s: PaperTradeLiveStatus, exitPrice: number) {
    await closeTrade(s.trade.id, exitPrice)
    setClosingStatus(null)
    // Refresh selected status if same trade
    if (selectedStatus?.trade.id === s.trade.id) setSelectedStatus(null)
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-5">

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-extrabold text-text-primary tracking-tight">My Paper Trades</h1>
          <p className="text-sm text-text-muted mt-0.5">Track swing setups from entry to exit — no real money, real learning.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-surface border border-border rounded-xl px-3 py-2">
            <div>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Virtual Capital</p>
              <CapitalEditor capital={virtualCapital} onSave={setVirtualCapital} />
            </div>
          </div>
          <button
            onClick={() => navigate('/screener')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent/90 transition-colors shadow-panel"
          >
            + Find Stocks
          </button>
        </div>
      </div>

      {/* ── Summary strip ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Open Trades',    value: openTrades.length.toString() },
          { label: 'Unrealised P&L', value: (totalPnl >= 0 ? '+' : '') + '₹' + Math.abs(totalPnl).toLocaleString('en-IN', { maximumFractionDigits: 0 }), color: totalPnl >= 0 ? 'text-green-400' : 'text-red-400' },
          { label: 'Realised P&L',   value: (realisedPnl >= 0 ? '+' : '') + '₹' + Math.abs(realisedPnl).toLocaleString('en-IN', { maximumFractionDigits: 0 }), color: realisedPnl >= 0 ? 'text-green-400' : 'text-red-400' },
          { label: 'Win Rate',       value: winRate != null ? `${winRate}% (${closedWins}/${closedTotal})` : '—', color: winRate != null && winRate >= 50 ? 'text-green-400' : 'text-text-primary' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-surface border border-border rounded-2xl px-4 py-3 shadow-panel">
            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-lg font-extrabold ${color ?? 'text-text-primary'}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Exit alerts ──────────────────────────────────────────────── */}
      {allAlerts.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              {allAlerts.length} trade{allAlerts.length > 1 ? 's need' : ' needs'} your attention
            </h2>
          </div>
          <div className="space-y-2">
            {allAlerts.map(({ alert: a, status: s }, i) => {
              const meta = alertMeta(a.type)
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${pageAlertBgCls(a.severity)}`}
                >
                  {/* Left: icon in circle */}
                  <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base border ${alertCircleCls(a.severity)}`}>
                    {alertIcon(a.type)}
                  </div>

                  {/* Centre: stock + message */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-extrabold ${pageAlertAccentCls(a.severity)}`}>
                        {s.trade.symbol.replace('.NS', '')}
                      </span>
                      <span className="text-sm font-semibold text-text-primary">{meta.title}</span>
                    </div>
                    <p className="text-xs text-text-muted mt-0.5 truncate">{meta.desc}</p>
                  </div>

                  {/* Right: review button */}
                  <button
                    onClick={() => setSelectedStatus(s)}
                    className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${pageAlertAccentCls(a.severity)} border-current/30 hover:bg-current/10`}
                  >
                    Review →
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Loading / Error ───────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <svg className="w-7 h-7 animate-spin text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">{error}</div>
      )}

      {/* ── Open trades ──────────────────────────────────────────────── */}
      {!isLoading && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-text-primary">
              Open Trades
              {openTrades.length > 0 && (
                <span className="ml-2 text-[11px] font-semibold text-text-muted bg-border/40 px-1.5 py-0.5 rounded">{openTrades.length}</span>
              )}
            </h2>
          </div>

          {openTrades.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 bg-surface border border-border rounded-2xl mb-6">
              <svg className="w-10 h-10 text-text-muted opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-sm text-text-muted">No open trades yet.</p>
              <button
                onClick={() => navigate('/screener')}
                className="text-xs font-semibold text-accent hover:underline"
              >
                Run screener to find setups →
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6 items-stretch">
              {openTrades.map((s) => (
                <OpenTradeCard
                  key={s.trade.id}
                  status={s}
                  onClose={(status) => setClosingStatus(status)}
                  onDelete={deleteTrade}
                  onClick={setSelectedStatus}
                />
              ))}
            </div>
          )}

          {/* ── Closed trades ──────────────────────────────────────────── */}
          {closedTrades.length > 0 && (
            <>
              <button
                onClick={() => setShowClosed((v) => !v)}
                className="flex items-center gap-2 text-sm font-bold text-text-primary mb-3 hover:text-accent transition-colors"
              >
                <span className={`text-xs transition-transform ${showClosed ? 'rotate-90' : ''}`}>▶</span>
                Trade History
                <span className="text-[11px] font-semibold text-text-muted bg-border/40 px-1.5 py-0.5 rounded">{closedTrades.length}</span>
              </button>

              {showClosed && (
                <div className="bg-surface border border-border rounded-2xl shadow-panel overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px]">
                      <thead>
                        <tr className="border-b border-border/60 bg-bg/60">
                          <th className="py-2.5 pl-4 pr-2 text-[11px] font-semibold text-text-muted uppercase tracking-wide text-left">Stock</th>
                          <th className="py-2.5 px-3 text-[11px] font-semibold text-text-muted uppercase tracking-wide text-right">Entry</th>
                          <th className="py-2.5 px-3 text-[11px] font-semibold text-text-muted uppercase tracking-wide text-right">Exit</th>
                          <th className="py-2.5 px-3 text-[11px] font-semibold text-text-muted uppercase tracking-wide text-right">P&L</th>
                          <th className="py-2.5 px-3 text-[11px] font-semibold text-text-muted uppercase tracking-wide text-center">R-Multiple</th>
                          <th className="py-2.5 px-3 text-[11px] font-semibold text-text-muted uppercase tracking-wide text-center">Result</th>
                          <th className="py-2.5 px-3 text-[11px] font-semibold text-text-muted uppercase tracking-wide text-right">Date / Held</th>
                          <th className="py-2.5 px-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {closedTrades.map((s) => (
                          <ClosedTradeRow
                            key={s.trade.id}
                            status={s}
                            onDelete={deleteTrade}
                            onClick={setSelectedStatus}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-text-muted/50 text-center py-2">Click any row to see full trade details</p>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Close trade modal ──────────────────────────────────────────── */}
      {closingStatus && (
        <CloseModal
          trade={closingStatus.trade}
          currentPrice={closingStatus.current_price}
          onClose={() => setClosingStatus(null)}
          onConfirm={(ep) => handleClose(closingStatus, ep)}
        />
      )}

      {/* ── Trade detail panel ─────────────────────────────────────────── */}
      {selectedStatus && (
        <TradeDetailPanel
          status={selectedStatus}
          onClose={() => setSelectedStatus(null)}
          onRecordExit={(s) => { setSelectedStatus(null); setClosingStatus(s) }}
          onDelete={deleteTrade}
        />
      )}
    </div>
  )
}
