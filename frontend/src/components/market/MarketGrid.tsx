import type { IndexSnapshot } from '../../types/market'
import { IndexCard } from './IndexCard'

interface MarketGridProps {
  indices: IndexSnapshot[]
}

export function MarketGrid({ indices }: MarketGridProps) {
  if (indices.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-8 text-center text-sm text-text-muted shadow-panel">
        No indices available for this view.
      </div>
    )
  }

  // Sort: biggest gainers first → biggest losers last
  const sorted = [...indices].sort((a, b) => b.change_pct - a.change_pct)

  const gainers = sorted.filter((i) => i.change_pct >= 0)
  const losers = sorted.filter((i) => i.change_pct < 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-muted">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1">
          <span className="w-2 h-2 rounded-full bg-up" />
          {gainers.length} positive
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1">
          <span className="w-2 h-2 rounded-full bg-down" />
          {losers.length} negative
        </span>
        <span className="ml-auto text-[11px] uppercase tracking-wider font-semibold">Sorted by daily change</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {sorted.map((idx) => (
          <IndexCard key={idx.symbol} index={idx} />
        ))}
      </div>
    </div>
  )
}
