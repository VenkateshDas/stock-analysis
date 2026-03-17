import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type TickMarkType,
  ColorType,
  LineStyle,
  LineType,
} from 'lightweight-charts'
import type { HistoryResponse } from '../../types/market'

type ChartInterval = '1d' | '1h' | '15m' | '5m'

interface CandlestickChartProps {
  data: HistoryResponse
  height?: number
  interval?: ChartInterval
}

type RangeWindow = '2H' | '1D' | '3D' | '1W' | '5D' | '1M' | '3M' | 'ALL'

const RANGE_OPTIONS: Record<ChartInterval, RangeWindow[]> = {
  '5m':  ['2H', '1D', '3D', '1W', '1M', 'ALL'],
  '15m': ['2H', '1D', '3D', '1W', '1M', 'ALL'],
  '1h':  ['1D', '5D', '1M', '3M', 'ALL'],
  '1d':  ['1M', '3M', 'ALL'],
}

function defaultRange(iv: ChartInterval): RangeWindow {
  if (iv === '5m') return '1D'
  if (iv === '15m') return '1D'
  if (iv === '1h') return '5D'
  return '3M'
}

interface HoverSnapshot {
  open: number
  high: number
  low: number
  close: number
  timeLabel: string
}

function formatLocalTimeLabel(time: Time): string {
  const tsSeconds = typeof time === 'number'
    ? time
    : typeof time === 'string'
    ? Date.parse(time) / 1000
    : Date.parse(
        `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}T00:00:00`
      ) / 1000

  if (!Number.isFinite(tsSeconds)) return ''

  return new Date(tsSeconds * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatTickLabel(time: Time, _tickType: TickMarkType, _locale: string): string {
  const tsSeconds = typeof time === 'number'
    ? time
    : typeof time === 'string'
    ? Date.parse(time) / 1000
    : Date.parse(
        `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}T00:00:00`
      ) / 1000

  if (!Number.isFinite(tsSeconds)) return ''

  return new Date(tsSeconds * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: '2-digit',
  })
}

// Fixed-order CPR series config (index must stay stable — matches cprSeriesArr)
const CPR_SERIES_CONFIGS = [
  { key: 'pp',       color: '#6366f1', title: 'PP',   lineWidth: 2 as const, lineStyle: LineStyle.Dotted       },
  { key: 'cpr_high', color: '#6366f1', title: 'CPR↑', lineWidth: 1 as const, lineStyle: LineStyle.Dotted       },
  { key: 'cpr_low',  color: '#6366f1', title: 'CPR↓', lineWidth: 1 as const, lineStyle: LineStyle.Dotted       },
  { key: 'r1',       color: '#4ade80', title: 'R1',   lineWidth: 1 as const, lineStyle: LineStyle.SparseDotted },
  { key: 'r2',       color: '#22c55e', title: 'R2',   lineWidth: 1 as const, lineStyle: LineStyle.SparseDotted },
  { key: 'r3',       color: '#16a34a', title: 'R3',   lineWidth: 1 as const, lineStyle: LineStyle.SparseDotted },
  { key: 's1',       color: '#f87171', title: 'S1',   lineWidth: 1 as const, lineStyle: LineStyle.SparseDotted },
  { key: 's2',       color: '#ef4444', title: 'S2',   lineWidth: 1 as const, lineStyle: LineStyle.SparseDotted },
  { key: 's3',       color: '#dc2626', title: 'S3',   lineWidth: 1 as const, lineStyle: LineStyle.SparseDotted },
] as const

type CprKey = 'pp' | 'cpr_high' | 'cpr_low' | 'r1' | 'r2' | 'r3' | 's1' | 's2' | 's3'

function applyRangeWindowToChart(
  chart: IChartApi,
  rw: RangeWindow,
  barCount: number,
  iv: ChartInterval,
) {
  chart.timeScale().fitContent()
  if (rw === '1D') {
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, barCount - 10), to: barCount + 1 })
  } else if (rw === '2H') {
    // ~4 bars per hour for 5m/15m → 2H ≈ 24–8 bars
    const barsIn2h = iv === '5m' ? 24 : iv === '15m' ? 8 : 16
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, barCount - barsIn2h), to: barCount + 1 })
  } else if (rw === '3D') {
    const barsIn3d = iv === '5m' ? 30 : iv === '15m' ? 24 : 24
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, barCount - barsIn3d), to: barCount + 1 })
  } else if (rw === '1W') {
    const barsIn1w = iv === '5m' ? 50 : iv === '15m' ? 35 : 35
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, barCount - barsIn1w), to: barCount + 1 })
  } else if (rw === '5D') {
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, barCount - 50), to: barCount + 1 })
  } else if (rw === '1M') {
    // ~20 trading days per month × bars per day
    const bars = iv === '5m' ? 1560 : iv === '15m' ? 520 : iv === '1h' ? 200 : 30
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, barCount - bars), to: barCount + 1 })
  } else if (rw === '3M') {
    const bars = iv === '5m' ? 4680 : iv === '15m' ? 1560 : iv === '1h' ? 600 : 90
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, barCount - bars), to: barCount + 1 })
  }
  // 'ALL' → fitContent() already called above
}

export function CandlestickChart({ data, height = 450, interval = '1d' }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)

  // ── Series refs — created once per chart, reused on every data refresh ────────
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'>   | null>(null)
  const sma20Ref        = useRef<ISeriesApi<'Line'>        | null>(null)
  const sma50Ref        = useRef<ISeriesApi<'Line'>        | null>(null)
  const sma200Ref       = useRef<ISeriesApi<'Line'>        | null>(null)
  const cprSeriesArr    = useRef<ISeriesApi<'Line'>[]>([])

  // Whether the initial viewport has been set after the last chart creation.
  // On subsequent data refreshes we do NOT touch the viewport, so the user's
  // zoom / pan is preserved naturally by lightweight-charts.
  const rangeAppliedRef = useRef(false)

  // Current bar count — lets the range-window effect run without data in its deps.
  const barCountRef = useRef(0)

  // Always-current copy of rangeWindow — lets the data effect read it without
  // adding rangeWindow to its deps (which would reset viewport on range button clicks).
  const rangeWindowRef = useRef<RangeWindow>(defaultRange(interval))

  // Toggle state refs — so Effect 1 can apply correct visibility when the chart
  // is recreated after an interval switch (without toggle state in its deps).
  const showSma20Ref  = useRef(true)
  const showSma50Ref  = useRef(true)
  const showSma200Ref = useRef(true)
  const showVolumeRef = useRef(true)
  const showCPRRef    = useRef(true)

  // ── React state ───────────────────────────────────────────────────────────────
  const [rangeWindow, setRangeWindow] = useState<RangeWindow>(() => defaultRange(interval))
  const [showSma20,  setShowSma20]  = useState(true)
  const [showSma50,  setShowSma50]  = useState(true)
  const [showSma200, setShowSma200] = useState(true)
  const [showVolume, setShowVolume] = useState(true)
  const [showCPR,    setShowCPR]    = useState(true)
  const [hoverSnapshot, setHoverSnapshot] = useState<HoverSnapshot | null>(null)

  // Keep refs in sync with state
  useEffect(() => { rangeWindowRef.current = rangeWindow },  [rangeWindow])
  useEffect(() => { showSma20Ref.current   = showSma20 },    [showSma20])
  useEffect(() => { showSma50Ref.current   = showSma50 },    [showSma50])
  useEffect(() => { showSma200Ref.current  = showSma200 },   [showSma200])
  useEffect(() => { showVolumeRef.current  = showVolume },   [showVolume])
  useEffect(() => { showCPRRef.current     = showCPR },      [showCPR])

  // Reset rangeWindow to the appropriate default when the interval prop changes
  useEffect(() => {
    const next = defaultRange(interval)
    setRangeWindow(next)
    rangeWindowRef.current = next
  }, [interval])

  const latestClose = useMemo(
    () => data.bars[data.bars.length - 1]?.close ?? null,
    [data.bars]
  )
  const previousClose = useMemo(
    () => data.bars[data.bars.length - 2]?.close ?? null,
    [data.bars]
  )
  const latestChangePct = useMemo(() => {
    if (latestClose == null || previousClose == null || previousClose === 0) return null
    return ((latestClose - previousClose) / previousClose) * 100
  }, [latestClose, previousClose])

  // ── Effect 1: Build the chart shell (reruns only when interval or height changes)
  // Series are created here but left EMPTY — Effect 2 populates them.
  // This effect intentionally does NOT depend on data, rangeWindow, or toggle
  // states, so data refreshes never cause a chart teardown.
  useEffect(() => {
    if (!containerRef.current) return

    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }

    const hourlyTickFmt = (time: Time, _tickType: TickMarkType, _locale: string): string => {
      const tsSeconds = typeof time === 'number'
        ? time
        : typeof time === 'string'
        ? Date.parse(time) / 1000
        : Date.parse(
            `${(time as { year: number; month: number; day: number }).year}-${String((time as { year: number; month: number; day: number }).month).padStart(2, '0')}-${String((time as { year: number; month: number; day: number }).day).padStart(2, '0')}T00:00:00`
          ) / 1000
      if (!Number.isFinite(tsSeconds)) return ''
      return new Date(tsSeconds * 1000).toLocaleString(undefined, {
        month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
      })
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#5a665d',
      },
      grid: {
        vertLines: { color: '#e6ece6' },
        horzLines: { color: '#e6ece6' },
      },
      crosshair: {
        vertLine: { color: '#0f6d74', labelBackgroundColor: '#0f6d74' },
        horzLine: { color: '#0f6d74', labelBackgroundColor: '#0f6d74' },
      },
      localization: {
        timeFormatter: formatLocalTimeLabel,
      },
      timeScale: {
        borderColor: '#d8dfd7',
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: interval === '1h' ? hourlyTickFmt : formatTickLabel,
      },
      rightPriceScale: { borderColor: '#d8dfd7' },
      width: containerRef.current.clientWidth,
      height,
    })
    chartRef.current = chart

    // ── Create all series (always all; visibility applied from refs below) ────
    candleSeriesRef.current = chart.addCandlestickSeries({
      upColor: '#26B856', downColor: '#EF5350',
      borderUpColor: '#26B856', borderDownColor: '#EF5350',
      wickUpColor: '#26B856', wickDownColor: '#EF5350',
      priceScaleId: 'right',
    })

    volumeSeriesRef.current = chart.addHistogramSeries({
      priceScaleId: 'volume',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    })

    sma20Ref.current  = chart.addLineSeries({ color: '#0f6d74', lineWidth: 1, title: 'SMA20',  priceLineVisible: false, lastValueVisible: false })
    sma50Ref.current  = chart.addLineSeries({ color: '#F4A261', lineWidth: 1, title: 'SMA50',  priceLineVisible: false, lastValueVisible: false })
    sma200Ref.current = chart.addLineSeries({ color: '#996b2a', lineWidth: 1, title: 'SMA200', priceLineVisible: false, lastValueVisible: false })

    cprSeriesArr.current = CPR_SERIES_CONFIGS.map(cfg =>
      chart.addLineSeries({
        color: cfg.color,
        lineWidth: cfg.lineWidth,
        lineStyle: cfg.lineStyle,
        lineType: LineType.WithSteps,
        title: cfg.title,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        crosshairMarkerRadius: 0,
      })
    )

    // Apply current toggle visibility (important on interval switches when
    // toggles may have been changed by the user before the interval switch)
    sma20Ref.current.applyOptions({ visible: showSma20Ref.current })
    sma50Ref.current.applyOptions({ visible: showSma50Ref.current })
    sma200Ref.current.applyOptions({ visible: showSma200Ref.current })
    volumeSeriesRef.current.applyOptions({ visible: showVolumeRef.current })
    cprSeriesArr.current.forEach(s => s.applyOptions({ visible: showCPRRef.current }))

    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } })
    chart.priceScale('right').applyOptions({
      scaleMargins: { top: 0.08, bottom: showVolumeRef.current ? 0.25 : 0.08 },
    })

    // Crosshair reads the current candle series via ref (stable across re-renders)
    const crosshairHandler = (param: { time?: Time; seriesData: Map<unknown, unknown> }) => {
      if (!param.time || !candleSeriesRef.current) {
        setHoverSnapshot(null)
        return
      }
      const point = param.seriesData.get(candleSeriesRef.current) as
        | { open: number; high: number; low: number; close: number }
        | undefined
      if (!point) {
        setHoverSnapshot(null)
        return
      }
      setHoverSnapshot({
        open: point.open, high: point.high, low: point.low, close: point.close,
        timeLabel: formatLocalTimeLabel(param.time),
      })
    }
    chart.subscribeCrosshairMove(crosshairHandler)

    // Signal that the next data load should set the initial viewport
    rangeAppliedRef.current = false

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry && chartRef.current) {
        chartRef.current.applyOptions({
          width: entry.contentRect.width,
          height: entry.contentRect.height || height,
        })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      chart.unsubscribeCrosshairMove(crosshairHandler)
      ro.disconnect()
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
    }
  }, [interval, height])

  // ── Effect 2: Update series data only — never touches the viewport ────────────
  // lightweight-charts preserves the user's zoom/pan across setData() calls.
  // The viewport is set ONLY on the very first data load after chart creation.
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || !data?.bars?.length) return

    const times = data.bars.map(b => Math.floor(b.timestamp / 1000) as unknown as Time)

    candleSeriesRef.current.setData(
      data.bars.map(b => ({
        time: Math.floor(b.timestamp / 1000) as unknown as Time,
        open: b.open, high: b.high, low: b.low, close: b.close,
      }))
    )

    volumeSeriesRef.current?.setData(
      data.bars.map(b => ({
        time: Math.floor(b.timestamp / 1000) as unknown as Time,
        value: b.volume,
        color: b.close >= b.open ? 'rgba(38, 184, 86, 0.45)' : 'rgba(239, 83, 80, 0.45)',
      }))
    )

    const setLineData = (
      ref: React.MutableRefObject<ISeriesApi<'Line'> | null>,
      values: (number | null)[],
    ) => {
      if (!ref.current) return
      const pts = values
        .map((v, i) => v != null ? { time: times[i], value: v } : null)
        .filter(Boolean) as { time: Time; value: number }[]
      ref.current.setData(pts)
    }
    setLineData(sma20Ref,  data.sma20)
    setLineData(sma50Ref,  data.sma50)
    setLineData(sma200Ref, data.sma200)

    if (data.cpr?.length) {
      CPR_SERIES_CONFIGS.forEach(({ key }, idx) => {
        const s = cprSeriesArr.current[idx]
        if (!s) return
        const cprKey = key as CprKey
        const pts = data.cpr
          .map((c, i) => {
            const v = c?.[cprKey]
            return v != null ? { time: times[i], value: v } : null
          })
          .filter(Boolean) as { time: Time; value: number }[]
        s.setData(pts)
      })
    }

    barCountRef.current = data.bars.length

    // Set viewport ONLY on first load after chart creation.
    // All subsequent data refreshes (polling) leave the viewport untouched —
    // the user's zoom/pan is preserved automatically by lightweight-charts.
    if (!rangeAppliedRef.current) {
      applyRangeWindowToChart(chartRef.current, rangeWindowRef.current, data.bars.length, interval)
      rangeAppliedRef.current = true
    }
  }, [data, interval])
  // 'interval' is included only so the 1h-specific bar-count formula is correct
  // when interval changes while data is already loaded. It does NOT cause chart
  // recreation (that is Effect 1's job).

  // ── Effect 3: Visibility toggles — just flip a series option, no recreation ──
  useEffect(() => { sma20Ref.current?.applyOptions({ visible: showSma20 }) }, [showSma20])
  useEffect(() => { sma50Ref.current?.applyOptions({ visible: showSma50 }) }, [showSma50])
  useEffect(() => { sma200Ref.current?.applyOptions({ visible: showSma200 }) }, [showSma200])
  useEffect(() => {
    if (!volumeSeriesRef.current || !chartRef.current) return
    volumeSeriesRef.current.applyOptions({ visible: showVolume })
    chartRef.current.priceScale('right').applyOptions({
      scaleMargins: { top: 0.08, bottom: showVolume ? 0.25 : 0.08 },
    })
  }, [showVolume])
  useEffect(() => {
    cprSeriesArr.current.forEach(s => s.applyOptions({ visible: showCPR }))
  }, [showCPR])

  // ── Effect 4: Range window button — explicitly snap to the selected range ─────
  useEffect(() => {
    if (!chartRef.current || !rangeAppliedRef.current || !barCountRef.current) return
    applyRangeWindowToChart(chartRef.current, rangeWindow, barCountRef.current, interval)
  }, [rangeWindow, interval])

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-4 text-xs text-text-muted">
          <span>{
            interval === '5m' ? 'Intraday 5-Min Chart (Local Time)' :
            interval === '15m' ? 'Intraday 15-Min Chart (Local Time)' :
            interval === '1h' ? '30-Day Hourly Chart (Local Time)' :
            '90-Day Chart (Local Time)'
          }</span>
          <span className="hidden sm:inline">
            Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </span>
          {latestChangePct != null && (
            <span className={latestChangePct >= 0 ? 'text-up' : 'text-down'}>
              Last Move: {latestChangePct >= 0 ? '+' : ''}{latestChangePct.toFixed(2)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs">
          {RANGE_OPTIONS[interval].map((window) => (
            <button
              key={window}
              onClick={() => setRangeWindow(window)}
              className={`px-2 py-1 rounded border transition-colors ${
                rangeWindow === window
                  ? 'text-accent border-accent/40 bg-accent/10'
                  : 'text-text-muted border-border hover:text-text-primary'
              }`}
            >
              {window}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-3 text-xs text-text-muted">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showSma20} onChange={(e) => setShowSma20(e.target.checked)} />
          <span className="w-6 h-0.5 bg-[#0f6d74] inline-block" /> SMA20
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showSma50} onChange={(e) => setShowSma50(e.target.checked)} />
          <span className="w-6 h-0.5 bg-[#F4A261] inline-block" /> SMA50
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showSma200} onChange={(e) => setShowSma200(e.target.checked)} />
          <span className="w-6 h-0.5 bg-[#996b2a] inline-block" /> SMA200
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showVolume} onChange={(e) => setShowVolume(e.target.checked)} />
          Volume
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showCPR} onChange={(e) => setShowCPR(e.target.checked)} />
          <span className="w-8 h-0.5 bg-[#6366f1] inline-block rounded" />
          CPR
        </label>
      </div>

      {hoverSnapshot && (
        <div className="mb-3 text-xs text-text-muted font-mono flex flex-wrap gap-x-4 gap-y-1">
          <span>{hoverSnapshot.timeLabel}</span>
          <span>O: {hoverSnapshot.open.toFixed(2)}</span>
          <span>H: {hoverSnapshot.high.toFixed(2)}</span>
          <span>L: {hoverSnapshot.low.toFixed(2)}</span>
          <span>C: {hoverSnapshot.close.toFixed(2)}</span>
        </div>
      )}
      <div ref={containerRef} style={{ height }} />
    </div>
  )
}
