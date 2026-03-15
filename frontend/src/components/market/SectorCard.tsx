import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { IndexSectorAnalysis, SectorBreakdown, StockBreakdown } from '../../types/sector'

// ── Formatting helpers ────────────────────────────────────────────────────────

const fmt = (n: number, decimals = 2) => Math.abs(n).toFixed(decimals)
const sign = (n: number) => (n >= 0 ? '+' : '-')
const changeColor = (n: number) =>
  n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-neutral'

/** Strip exchange suffixes and leading ^ for cleaner display. */
const displaySym = (sym: string) =>
  sym.replace(/\.NS$/, '').replace(/\.T$/, '').replace(/\.HK$/, '').replace(/^\^/, '')

/** Truncate a long company name. */
const shortName = (name: string, max = 22) =>
  name.length > max ? name.slice(0, max) + '…' : name

// ── Colour palette for the weight bar ────────────────────────────────────────

const PALETTE = [
  'bg-accent',
  'bg-up',
  'bg-yellow-400',
  'bg-purple-500',
  'bg-pink-500',
  'bg-orange-400',
  'bg-teal-400',
  'bg-indigo-400',
  'bg-rose-400',
  'bg-lime-400',
  'bg-cyan-400',
  'bg-fuchsia-400',
]

// ── StockRow ─────────────────────────────────────────────────────────────────

const StockRow: React.FC<{ stock: StockBreakdown; rank?: number; onClick?: () => void }> = ({
  stock,
  rank,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full text-left flex items-center gap-2 py-1.5 px-3 hover:bg-white/[0.025] rounded transition-colors"
  >
    {rank !== undefined && (
      <span className="text-[10px] text-text-muted w-4 text-right shrink-0">{rank}</span>
    )}
    {/* Symbol */}
    <span className="font-mono text-xs text-text-muted w-20 shrink-0">
      {displaySym(stock.symbol)}
    </span>
    {/* Name */}
    <span className="text-xs text-text-muted flex-1 truncate" title={stock.name}>
      {shortName(stock.name)}
    </span>
    {/* Weight */}
    <span className="text-xs text-text-muted w-12 text-right shrink-0">
      {fmt(stock.weight)}%
    </span>
    {/* Daily change */}
    <span
      className={`text-xs font-mono w-16 text-right shrink-0 ${changeColor(stock.daily_change_pct)}`}
    >
      {sign(stock.daily_change_pct)}{fmt(stock.daily_change_pct)}%
    </span>
    {/* Contribution */}
    <span
      className={`text-xs font-mono w-16 text-right shrink-0 ${changeColor(stock.contribution_pct)}`}
    >
      {sign(stock.contribution_pct)}{fmt(stock.contribution_pct, 3)}%
    </span>
  </button>
)

// ── SectorRow (collapsible) ───────────────────────────────────────────────────

const SectorRow: React.FC<{ sector: SectorBreakdown; colorClass: string; onStockClick: (symbol: string) => void }> = ({
  sector,
  colorClass,
  onStockClick,
}) => {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b border-border/40 last:border-0">
      {/* Sector summary row */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-2 py-2.5 px-3 hover:bg-white/[0.03] rounded transition-colors text-left group"
      >
        {/* Colour dot */}
        <span className={`w-2 h-2 rounded-full shrink-0 ${colorClass}`} />

        {/* Expand chevron */}
        <svg
          className={`w-3 h-3 text-text-muted shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>

        {/* Sector name + stock count */}
        <span className="text-sm font-medium text-text-primary flex-1 text-left">
          {sector.sector}
        </span>
        <span className="text-xs text-text-muted mr-2 shrink-0">{sector.stock_count} stocks</span>

        {/* Weight */}
        <span className="text-xs text-text-muted w-12 text-right shrink-0">
          {fmt(sector.weight)}%
        </span>

        {/* Daily change */}
        <span
          className={`text-sm font-mono font-medium w-16 text-right shrink-0 ${changeColor(sector.daily_change_pct)}`}
        >
          {sign(sector.daily_change_pct)}{fmt(sector.daily_change_pct)}%
        </span>

        {/* Contribution */}
        <span
          className={`text-xs font-mono w-16 text-right shrink-0 ${changeColor(sector.contribution_pct)}`}
        >
          {sign(sector.contribution_pct)}{fmt(sector.contribution_pct, 3)}%
        </span>
      </button>

      {/* Expanded stock list */}
      {expanded && (
        <div className="pb-2 ml-4 border-l-2 border-border/60">
          {/* Column headers */}
          <div className="flex items-center gap-2 py-1 px-3 text-[10px] text-text-muted border-b border-border/40 mb-1">
            <span className="w-4 shrink-0" />
            <span className="w-20 shrink-0">Symbol</span>
            <span className="flex-1">Company</span>
            <span className="w-12 text-right shrink-0">Weight</span>
            <span className="w-16 text-right shrink-0">Change</span>
            <span className="w-16 text-right shrink-0">Contrib.</span>
          </div>
          {sector.stocks.map((stock, i) => (
            <StockRow
              key={stock.symbol}
              stock={stock}
              rank={i + 1}
              onClick={() => onStockClick(stock.symbol)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── MoverCard ─────────────────────────────────────────────────────────────────

const MoverCard: React.FC<{ stock: StockBreakdown; type: 'gain' | 'loss'; onClick?: () => void }> = ({
  stock,
  type,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full text-left flex items-center justify-between py-1 gap-2 rounded hover:bg-white/[0.03] transition-colors"
  >
    <div className="min-w-0 flex-1">
      <span className="font-mono text-xs text-text-primary">{displaySym(stock.symbol)}</span>
      <p className="text-[10px] text-text-muted truncate" title={stock.name}>
        {shortName(stock.name, 18)}
      </p>
    </div>
    <div className="text-right shrink-0">
      <p
        className={`text-sm font-mono font-bold ${
          type === 'gain' ? 'text-up' : 'text-down'
        }`}
      >
        {sign(stock.daily_change_pct)}{fmt(stock.daily_change_pct)}%
      </p>
      <p className="text-[10px] text-text-muted">{fmt(stock.weight)}% wt</p>
    </div>
  </button>
)

// ── Main SectorCard ───────────────────────────────────────────────────────────

interface SectorCardProps {
  data: IndexSectorAnalysis
}

export const SectorCard: React.FC<SectorCardProps> = ({ data }) => {
  const navigate = useNavigate()
  const {
    sectors,
    top_gainers,
    top_losers,
    positive_sector_count,
    negative_sector_count,
    analyzed_constituents,
    sector_count,
    data_source,
    total_constituents,
  } = data

  // Advance / decline from constituent-level data (already available)
  const allStocks = sectors.flatMap((s) => s.stocks)
  const advanceCount = allStocks.filter((s) => s.is_positive).length
  const declineCount = allStocks.filter((s) => !s.is_positive).length

  // Breadth: % above 200-day SMA (from backend field or computed locally)
  const pct200 = data.pct_above_sma200 ?? null

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h4 className="text-sm font-semibold text-text-primary">Sector Breakdown</h4>
          <p className="text-xs text-text-muted mt-0.5">
            {analyzed_constituents} of {total_constituents} stocks analysed
            {' '}across {sector_count} sectors
            <span className="ml-2 opacity-50">• {data_source.replace(/_/g, ' ')}</span>
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm font-medium">
          {/* Stock-level advance / decline */}
          {allStocks.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-text-muted border border-border rounded-lg px-2 py-1">
              <span className="text-up font-semibold">{advanceCount}↑</span>
              <span className="opacity-40">/</span>
              <span className="text-down font-semibold">{declineCount}↓</span>
              <span className="opacity-40 ml-0.5">stocks</span>
            </div>
          )}
          {/* Sector-level positive / negative */}
          <div className="flex items-center gap-2">
            <span className="text-up">▲ {positive_sector_count}</span>
            <span className="text-text-muted">/</span>
            <span className="text-down">▼ {negative_sector_count}</span>
            <span className="text-[10px] text-text-muted opacity-60">sectors</span>
          </div>
        </div>
      </div>

      {/* ── Breadth Bar: % above 200-day SMA ── */}
      {pct200 != null && (
        <div className="px-4 py-2.5 border-b border-border bg-bg/30 flex items-center gap-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/60 flex-shrink-0 w-44">
            Above 200-day avg
          </p>
          <div className="flex-1 relative h-2 bg-border/40 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                pct200 >= 60 ? 'bg-up' : pct200 >= 40 ? 'bg-neutral' : 'bg-down'
              }`}
              style={{ width: `${pct200}%` }}
            />
          </div>
          <span className={`text-xs font-mono font-bold flex-shrink-0 w-12 text-right ${
            pct200 >= 60 ? 'text-up' : pct200 >= 40 ? 'text-neutral' : 'text-down'
          }`}>
            {pct200.toFixed(0)}%
          </span>
        </div>
      )}

      {/* ── Top Movers ── */}
      {(top_gainers.length > 0 || top_losers.length > 0) && (
        <div className="grid grid-cols-2 gap-0 border-b border-border">
          {/* Gainers */}
          <div className="px-4 py-3 border-r border-border">
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
              Top Gainers
            </p>
            {top_gainers.map((s) => (
              <MoverCard
                key={s.symbol}
                stock={s}
                type="gain"
                onClick={() => navigate(`/stock/${encodeURIComponent(s.symbol)}`)}
              />
            ))}
          </div>
          {/* Losers */}
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
              Top Losers
            </p>
            {top_losers.map((s) => (
              <MoverCard
                key={s.symbol}
                stock={s}
                type="loss"
                onClick={() => navigate(`/stock/${encodeURIComponent(s.symbol)}`)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Sector table ── */}
      <div>
        {/* Column header */}
        <div className="flex items-center gap-2 px-3 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border bg-white/[0.02]">
          <span className="w-2 shrink-0" />
          <span className="w-3 shrink-0" />
          <span className="flex-1">Sector</span>
          <span className="mr-2 w-16 shrink-0 text-right invisible">stocks</span>
          <span className="w-12 text-right shrink-0">Weight</span>
          <span className="w-16 text-right shrink-0">Change</span>
          <span className="w-16 text-right shrink-0">Contrib.</span>
        </div>

        {sectors.length === 0 ? (
          <p className="text-center text-text-muted text-sm py-10">
            No sector data available for this index.
          </p>
        ) : (
          <div className="divide-y divide-border/0">
            {sectors.map((sector, i) => (
              <SectorRow
                key={sector.sector}
                sector={sector}
                colorClass={PALETTE[i % PALETTE.length]}
                onStockClick={(symbol) => navigate(`/stock/${encodeURIComponent(symbol)}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Weight distribution bar ── */}
      {sectors.length > 0 && (
        <div className="px-4 py-3 border-t border-border bg-white/[0.01]">
          {/* Bar */}
          <div className="flex h-2 rounded-full overflow-hidden bg-border/50 mb-2">
            {sectors.map((sector, i) => (
              <div
                key={sector.sector}
                className={PALETTE[i % PALETTE.length]}
                style={{ width: `${Math.min(Math.max(sector.weight, 0.5), 100)}%` }}
                title={`${sector.sector}: ${fmt(sector.weight)}%`}
              />
            ))}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {sectors.slice(0, 8).map((sector, i) => (
              <div key={sector.sector} className="flex items-center gap-1.5">
                <span
                  className={`inline-block w-2 h-2 rounded-full shrink-0 ${PALETTE[i % PALETTE.length]}`}
                />
                <span className="text-[10px] text-text-muted">
                  {sector.sector} <span className="opacity-60">{fmt(sector.weight)}%</span>
                </span>
              </div>
            ))}
            {sectors.length > 8 && (
              <span className="text-[10px] text-text-muted opacity-60">
                +{sectors.length - 8} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default SectorCard
