import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart,
  type IChartApi,
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
  '5m':  ['2H', '1D', '3D', '1W'],
  '15m': ['2H', '1D', '3D', '1W'],
  '1h':  ['1D', '5D', '1M'],
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

export function CandlestickChart({ data, height = 450, interval = '1d' }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const [rangeWindow, setRangeWindow] = useState<RangeWindow>(() => defaultRange(interval))

  // Reset range window to a sensible default when interval changes
  useEffect(() => {
    if (interval === '1h') {
      setRangeWindow('1M')
    } else if (interval === '1d') {
      setRangeWindow('3M')
    } else {
      setRangeWindow('1D') // 5m and 15m
    }
  }, [interval])
  const [showSma20, setShowSma20] = useState(true)
  const [showSma50, setShowSma50] = useState(true)
  const [showSma200, setShowSma200] = useState(true)
  const [showVolume, setShowVolume] = useState(true)
  const [showCPR, setShowCPR] = useState(true)
  const [hoverSnapshot, setHoverSnapshot] = useState<HoverSnapshot | null>(null)

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

  useEffect(() => {
    if (!containerRef.current || !data?.bars?.length) return

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
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
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

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26B856',
      downColor: '#EF5350',
      borderUpColor: '#26B856',
      borderDownColor: '#EF5350',
      wickUpColor: '#26B856',
      wickDownColor: '#EF5350',
      priceScaleId: 'right',
    })

    const candleData = data.bars.map((b) => ({
      time: Math.floor(b.timestamp / 1000) as unknown as Time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }))
    candleSeries.setData(candleData)

    const volumeSeries = chart.addHistogramSeries({
      priceScaleId: 'volume',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    })
    volumeSeries.setData(
      data.bars.map((b) => ({
        time: Math.floor(b.timestamp / 1000) as unknown as Time,
        value: b.volume,
        color: b.close >= b.open ? 'rgba(38, 184, 86, 0.45)' : 'rgba(239, 83, 80, 0.45)',
      }))
    )

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    })
    chart.priceScale('right').applyOptions({
      scaleMargins: { top: 0.08, bottom: showVolume ? 0.25 : 0.08 },
    })
    volumeSeries.applyOptions({ visible: showVolume })

    const times = data.bars.map(
      (b) => Math.floor(b.timestamp / 1000) as unknown as Time
    )

    const addSMA = (values: (number | null)[], color: string, title: string) => {
      const series = chart.addLineSeries({
        color,
        lineWidth: 1,
        title,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      const pts = values
        .map((v, i) => (v != null ? { time: times[i], value: v } : null))
        .filter(Boolean) as { time: Time; value: number }[]
      if (pts.length) series.setData(pts)
    }

    if (showSma20) addSMA(data.sma20, '#0f6d74', 'SMA20')
    if (showSma50) addSMA(data.sma50, '#F4A261', 'SMA50')
    if (showSma200) addSMA(data.sma200, '#996b2a', 'SMA200')

    // ── CPR line series — one data point per bar, values shift each day ────
    // Each CPR metric is plotted exactly like an SMA: addLineSeries() with one
    // {time, value} per bar.  createPriceLine() was wrong — it paints a single
    // static horizontal line at a fixed price level across the entire chart.
    if (showCPR && data.cpr?.length) {
      const addCPRLine = (
        extractor: (i: number) => number | null,
        color: string,
        title: string,
        lineWidth: 1 | 2,
        lineStyle: LineStyle,
      ) => {
        const series = chart.addLineSeries({
          color,
          lineWidth,
          lineStyle,
          lineType: LineType.WithSteps,  // flat step per bar — no smooth curves
          title,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: false,
          crosshairMarkerRadius: 0,
        })
        const pts = data.cpr
          .map((c, i) => {
            const v = c != null ? extractor(i) : null
            return v != null ? { time: times[i], value: v } : null
          })
          .filter(Boolean) as { time: Time; value: number }[]
        if (pts.length) series.setData(pts)
      }

      // Core CPR zone: PP (pivot, indigo), cpr_high (upper boundary, green), cpr_low (lower boundary, red)
      // Using cpr_low/cpr_high (normalised) so the lines never cross regardless of session direction.
      addCPRLine((i) => data.cpr[i]?.pp       ?? null, '#6366f1', 'PP', 2, LineStyle.Dotted)
      addCPRLine((i) => data.cpr[i]?.cpr_high ?? null, '#6366f1', 'CPR↑', 1, LineStyle.Dotted)
      addCPRLine((i) => data.cpr[i]?.cpr_low  ?? null, '#6366f1', 'CPR↓', 1, LineStyle.Dotted)
      // Resistance levels: progressively lighter green, sparse dots
      addCPRLine((i) => data.cpr[i]?.r1 ?? null, '#4ade80', 'R1', 1, LineStyle.SparseDotted)
      addCPRLine((i) => data.cpr[i]?.r2 ?? null, '#22c55e', 'R2', 1, LineStyle.SparseDotted)
      addCPRLine((i) => data.cpr[i]?.r3 ?? null, '#16a34a', 'R3', 1, LineStyle.SparseDotted)
      // Support levels: progressively stronger red, sparse dots
      addCPRLine((i) => data.cpr[i]?.s1 ?? null, '#f87171', 'S1', 1, LineStyle.SparseDotted)
      addCPRLine((i) => data.cpr[i]?.s2 ?? null, '#ef4444', 'S2', 1, LineStyle.SparseDotted)
      addCPRLine((i) => data.cpr[i]?.s3 ?? null, '#dc2626', 'S3', 1, LineStyle.SparseDotted)
    }

    const crosshairHandler = (param: { time?: Time; seriesData: Map<unknown, unknown> }) => {
      if (!param.time) {
        setHoverSnapshot(null)
        return
      }
      const point = param.seriesData.get(candleSeries) as
        | { open: number; high: number; low: number; close: number }
        | undefined
      if (!point) {
        setHoverSnapshot(null)
        return
      }
      setHoverSnapshot({
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        timeLabel: formatLocalTimeLabel(param.time),
      })
    }
    chart.subscribeCrosshairMove(crosshairHandler)

    chart.timeScale().fitContent()
    if (rangeWindow === '1D') {
      // ~8 hourly bars per trading day
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, data.bars.length - 10),
        to: data.bars.length + 1,
      })
    } else if (rangeWindow === '5D') {
      // ~50 hourly bars for 5 trading days
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, data.bars.length - 50),
        to: data.bars.length + 1,
      })
    } else if (rangeWindow === '1M') {
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, data.bars.length - (interval === '1h' ? 200 : 30)),
        to: data.bars.length + 1,
      })
    } else if (rangeWindow === '3M') {
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, data.bars.length - 90),
        to: data.bars.length + 1,
      })
    } else {
      chart.timeScale().fitContent()
    }

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry && chartRef.current) {
        chartRef.current.applyOptions({ width: entry.contentRect.width })
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
  }, [data, rangeWindow, showSma20, showSma50, showSma200, showVolume, showCPR, interval])

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
      <div ref={containerRef} />
    </div>
  )
}
