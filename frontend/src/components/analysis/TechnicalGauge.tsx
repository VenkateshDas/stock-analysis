import { useMemo, useState } from 'react'
import type { OHLCVBar, TechnicalIndicators } from '../../types/market'
import {
  computeTradingSignals,
  type SignalVerdict,
  type IndicatorVote,
  type TradingSignalResult,
} from '../../utils/signals'

// ── Verdict config ────────────────────────────────────────────────────────────
const VERDICT: Record<SignalVerdict, { label: string; color: string; textClass: string }> = {
  strong_buy:  { label: 'Strong Buy',  color: '#1D4ED8', textClass: 'text-blue-600' },
  buy:         { label: 'Buy',         color: '#22C55E', textClass: 'text-up' },
  neutral:     { label: 'Neutral',     color: '#9CA3AF', textClass: 'text-text-muted' },
  sell:        { label: 'Sell',        color: '#EF4444', textClass: 'text-down' },
  strong_sell: { label: 'Strong Sell', color: '#B91C1C', textClass: 'text-red-700' },
}

// Five equal 36° arc segments: Strong Sell → Sell → Neutral → Buy → Strong Buy
const SEGMENTS = [
  { from: 180, to: 144, color: '#B91C1C' }, // Strong Sell
  { from: 144, to: 108, color: '#FCA5A5' }, // Sell
  { from: 108, to:  72, color: '#D1D5DB' }, // Neutral
  { from:  72, to:  36, color: '#93C5FD' }, // Buy
  { from:  36, to:   0, color: '#1D4ED8' }, // Strong Buy
]

// ── SVG helpers ───────────────────────────────────────────────────────────────
// Point on circle at math-angle θ (0°=right, 90°=top, 180°=left) in SVG coords
function pt(cx: number, cy: number, r: number, tDeg: number) {
  const rad = (tDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) }
}

// Arc path from math-angle t1 to t2. sweep=0 = counterclockwise in SVG = visually over the top
function arc(cx: number, cy: number, r: number, t1: number, t2: number): string {
  const p1 = pt(cx, cy, r, t1)
  const p2 = pt(cx, cy, r, t2)
  const large = Math.abs(t1 - t2) > 180 ? 1 : 0
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
}

// score ∈ [-1,1] → math angle (180°=left/sell, 90°=top/neutral, 0°=right/buy)
function scoreAngle(score: number): number {
  return 90 * (1 - Math.max(-1, Math.min(1, score)))
}

// ── GaugeSVG ─────────────────────────────────────────────────────────────────
interface GaugeProps {
  score: number
  verdict: SignalVerdict
  size: 'lg' | 'sm'
}

function GaugeSVG({ score, verdict, size }: GaugeProps) {
  const W  = size === 'lg' ? 200 : 152
  const H  = size === 'lg' ? 116 : 88
  const cx = W / 2
  const cy = H - 6
  const r  = size === 'lg' ? 86 : 65
  const sw = size === 'lg' ? 15 : 11

  const needleLen  = r - Math.ceil(sw / 2) - 2
  const aDeg       = scoreAngle(score)
  const aRad       = (aDeg * Math.PI) / 180
  const nx         = cx + needleLen * Math.cos(aRad)
  const ny         = cy - needleLen * Math.sin(aRad)
  const dotR       = size === 'lg' ? 5 : 4
  const activeColor = VERDICT[verdict].color

  // Small dot on the arc at current needle position
  const arcTip = pt(cx, cy, r, aDeg)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {/* Background track */}
      <path
        d={arc(cx, cy, r, 180, 0)}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={sw + 2}
        strokeLinecap="butt"
      />
      {/* Colored segments */}
      {SEGMENTS.map(seg => (
        <path
          key={seg.from}
          d={arc(cx, cy, r, seg.from, seg.to)}
          fill="none"
          stroke={seg.color}
          strokeWidth={sw}
          strokeLinecap="butt"
        />
      ))}
      {/* Active position marker on arc */}
      <circle cx={arcTip.x} cy={arcTip.y} r={sw / 2 - 1} fill={activeColor} />
      {/* Needle */}
      <line
        x1={cx} y1={cy} x2={nx} y2={ny}
        stroke="#111827"
        strokeWidth={size === 'lg' ? 2.5 : 2}
        strokeLinecap="round"
      />
      {/* Pivot */}
      <circle cx={cx} cy={cy} r={dotR} fill="#111827" />
    </svg>
  )
}

// ── CountsRow ─────────────────────────────────────────────────────────────────
function CountsRow({ sell, neutral, buy }: { sell: number; neutral: number; buy: number }) {
  return (
    <div className="flex items-center justify-between text-xs mt-2 px-2">
      <div className="text-center min-w-[32px]">
        <p className="text-sm font-black text-down">{sell}</p>
        <p className="text-text-muted text-[10px]">Sell</p>
      </div>
      <div className="text-center min-w-[32px]">
        <p className="text-sm font-black text-text-muted">{neutral}</p>
        <p className="text-text-muted text-[10px]">Neutral</p>
      </div>
      <div className="text-center min-w-[32px]">
        <p className="text-sm font-black text-up">{buy}</p>
        <p className="text-text-muted text-[10px]">Buy</p>
      </div>
    </div>
  )
}

// ── SignalRow ─────────────────────────────────────────────────────────────────
const VOTE_CLS: Record<IndicatorVote, string> = {
  buy:     'text-up bg-up/10 border-up/30',
  sell:    'text-down bg-down/10 border-down/30',
  neutral: 'text-text-muted bg-bg border-border',
}

function SignalRow({ name, value, vote }: { name: string; value: string; vote: IndicatorVote }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-text-muted flex-1 mr-2 truncate">{name}</span>
      <span className="text-xs font-mono text-text-primary w-20 text-right mr-3 flex-shrink-0">{value}</span>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 capitalize w-16 text-center ${VOTE_CLS[vote]}`}>
        {vote}
      </span>
    </div>
  )
}

// ── Sub-gauge panel ───────────────────────────────────────────────────────────
function SubGauge({
  title, score, verdict, counts,
}: {
  title: string
  score: number
  verdict: SignalVerdict
  counts: { buy: number; neutral: number; sell: number }
}) {
  const cfg = VERDICT[verdict]
  return (
    <div className="text-center">
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/60 mb-1">{title}</p>
      <div className="max-w-[152px] mx-auto">
        <GaugeSVG score={score} verdict={verdict} size="sm" />
      </div>
      <p className={`text-sm font-black mt-0.5 ${cfg.textClass}`}>{cfg.label}</p>
      <CountsRow sell={counts.sell} neutral={counts.neutral} buy={counts.buy} />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
interface TechnicalGaugeProps {
  bars: OHLCVBar[]
  tech: TechnicalIndicators
}

function GaugePanel({ result }: { result: TradingSignalResult }) {
  const [open, setOpen] = useState(false)
  const summaryConfig = VERDICT[result.summaryVerdict]
  const total = result.oscillators.length + result.movingAverages.length

  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70 mb-5">
        Technical Signal Summary · {total} indicators
      </h3>

      {/* ── 3-gauge row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4 items-start">

        {/* Summary — large, centre */}
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/60 mb-1">Summary</p>
          <div className="max-w-[200px] mx-auto">
            <GaugeSVG score={result.summaryScore} verdict={result.summaryVerdict} size="lg" />
          </div>
          <p className={`text-xl font-black mt-0.5 ${summaryConfig.textClass}`}>{summaryConfig.label}</p>
          <CountsRow
            sell={result.summaryCounts.sell}
            neutral={result.summaryCounts.neutral}
            buy={result.summaryCounts.buy}
          />
        </div>

        {/* Oscillators */}
        <SubGauge
          title="Oscillators"
          score={result.oscillatorScore}
          verdict={result.oscillatorVerdict}
          counts={result.oscillatorCounts}
        />

        {/* Moving Averages */}
        <SubGauge
          title="Moving Averages"
          score={result.maScore}
          verdict={result.maVerdict}
          counts={result.maCounts}
        />
      </div>

      {/* ── Breakdown toggle ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        className="mt-5 w-full flex items-center justify-between text-xs text-text-muted hover:text-text-primary border-t border-border pt-3 transition-colors"
      >
        <span>View signal breakdown ({total} indicators)</span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-x-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/50 mb-2">
              Oscillators ({result.oscillators.length})
            </p>
            {result.oscillators.map(s => (
              <SignalRow key={s.name} name={s.name} value={s.value} vote={s.vote} />
            ))}
          </div>
          <div className="mt-4 lg:mt-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/50 mb-2">
              Moving Averages ({result.movingAverages.length})
            </p>
            {result.movingAverages.map(s => (
              <SignalRow key={s.name} name={s.name} value={s.value} vote={s.vote} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function TechnicalGauge({ bars, tech }: TechnicalGaugeProps) {
  const result = useMemo(
    () => computeTradingSignals(bars, tech),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bars.length, tech.rsi, tech.macd.macd, tech.adx],
  )
  return <GaugePanel result={result} />
}
