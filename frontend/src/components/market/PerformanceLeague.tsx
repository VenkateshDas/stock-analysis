/**
 * PerformanceLeague — ranks all tracked indices by their most-recent 30-day
 * return (derived from the spark_closes array already in IndexSnapshot) and
 * renders a compact sorted table with a mini SVG sparkline.
 */
import type { IndexSnapshot } from '../../types/market'

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ closes, positive }: { closes: number[]; positive: boolean }) {
  if (closes.length < 2) return null
  const W = 64, H = 24
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const range = max - min || 1
  const pts = closes.map((c, i) => {
    const x = (i / (closes.length - 1)) * W
    const y = H - ((c - min) / range) * H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="flex-shrink-0">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={positive ? 'var(--color-up, #22c55e)' : 'var(--color-down, #ef4444)'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function monthlyReturn(snap: IndexSnapshot): number | null {
  const s = snap.spark_closes
  if (!s || s.length < 2) return null
  const start = s[0]
  const end   = s[s.length - 1]
  if (!start) return null
  return ((end - start) / start) * 100
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  indices: IndexSnapshot[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PerformanceLeague({ indices }: Props) {
  // Compute monthly return and rank
  const ranked = indices
    .map((snap) => ({ snap, ret: monthlyReturn(snap) }))
    .filter((r): r is { snap: IndexSnapshot; ret: number } => r.ret !== null)
    .sort((a, b) => b.ret - a.ret)

  if (ranked.length === 0) return null

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden flex flex-col h-full">
      <div className="px-5 pt-4 pb-3 border-b border-border flex-shrink-0">
        <p className="text-sm font-semibold text-text-primary">30-Day Performance</p>
        <p className="text-[11px] text-text-muted mt-0.5">Indices ranked by monthly return</p>
      </div>

      <div className="divide-y divide-border/50 overflow-y-auto flex-1">
        {ranked.map(({ snap, ret }, idx) => (
          <div key={snap.symbol} className="flex items-center gap-3 px-5 py-2.5 hover:bg-white/[0.02] transition-colors">
            {/* Rank */}
            <span className="text-[10px] text-text-muted/50 w-4 text-right flex-shrink-0">{idx + 1}</span>

            {/* Index name + country */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-text-primary truncate">{snap.name}</p>
              <p className="text-[10px] text-text-muted font-mono">{snap.symbol}</p>
            </div>

            {/* Sparkline */}
            <Sparkline closes={snap.spark_closes} positive={ret >= 0} />

            {/* Return + today's change */}
            <div className="text-right flex-shrink-0 w-20">
              <p className={`text-sm font-mono font-bold ${ret >= 0 ? 'text-up' : 'text-down'}`}>
                {ret >= 0 ? '+' : ''}{ret.toFixed(1)}%
              </p>
              <p className={`text-[10px] font-mono ${snap.change_pct >= 0 ? 'text-up/70' : 'text-down/70'}`}>
                {snap.change_pct >= 0 ? '+' : ''}{snap.change_pct.toFixed(2)}% today
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
