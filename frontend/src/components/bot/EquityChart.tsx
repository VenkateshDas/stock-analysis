import { useMemo } from 'react'
import type { EquityPoint } from '../../types/bot'

interface Props {
  points: EquityPoint[]
  initialCapital: number
  height?: number
}

const MAX_POINTS = 100

export function EquityChart({ points, initialCapital, height = 120 }: Props) {
  const data = useMemo(() => {
    if (points.length === 0) return []
    // Downsample to MAX_POINTS
    if (points.length <= MAX_POINTS) return points
    const step = Math.ceil(points.length / MAX_POINTS)
    const sampled: EquityPoint[] = []
    for (let i = 0; i < points.length; i += step) {
      sampled.push(points[i])
    }
    // Always include the last point
    if (sampled[sampled.length - 1] !== points[points.length - 1]) {
      sampled.push(points[points.length - 1])
    }
    return sampled
  }, [points])

  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-xs text-text-muted bg-bg/50 rounded-lg border border-border"
        style={{ height }}
      >
        Not enough data to draw chart
      </div>
    )
  }

  const values = data.map((p) => p.equity)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range = maxVal - minVal || 1

  const W = 600
  const H = height
  const PAD_X = 0
  const PAD_Y = 8

  const toX = (i: number) => PAD_X + (i / (data.length - 1)) * (W - PAD_X * 2)
  const toY = (v: number) => PAD_Y + (1 - (v - minVal) / range) * (H - PAD_Y * 2)

  const pathD = data
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p.equity).toFixed(1)}`)
    .join(' ')

  const areaD =
    pathD +
    ` L ${toX(data.length - 1).toFixed(1)} ${H} L ${toX(0).toFixed(1)} ${H} Z`

  const finalEquity = values[values.length - 1]
  const isProfit = finalEquity >= initialCapital
  const color = isProfit ? '#22c55e' : '#ef4444'
  const colorFade = isProfit ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'

  // Zero line (initial capital)
  const zeroY = toY(initialCapital)
  const showZeroLine = initialCapital >= minVal && initialCapital <= maxVal

  const pnl = finalEquity - initialCapital
  const pnlPct = ((pnl / initialCapital) * 100).toFixed(2)

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-muted">Account balance over time</span>
        <span className={`font-semibold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
          {isProfit ? '+' : ''}₹{pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })} ({pnlPct}%)
        </span>
      </div>
      <div className="rounded-lg overflow-hidden border border-border bg-bg/50" style={{ height }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          width="100%"
          height={height}
          className="block"
        >
          {showZeroLine && (
            <line
              x1={0}
              y1={zeroY}
              x2={W}
              y2={zeroY}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          )}
          <path d={areaD} fill={colorFade} />
          <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" />
        </svg>
      </div>
      <div className="flex items-center justify-between text-[10px] text-text-muted">
        <span>₹{minVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
        <span>₹{maxVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
      </div>
    </div>
  )
}
