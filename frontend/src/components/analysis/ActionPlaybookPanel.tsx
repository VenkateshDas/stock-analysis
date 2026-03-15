import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AnalysisResult, IndexSnapshot, MultiTimeframeTrend } from '../../types/market'
import type { IndexSectorAnalysis } from '../../types/sector'
import { buildIndexPlaybook, type StockAction, type StockIdea } from '../../utils/playbook'

interface ActionPlaybookPanelProps {
  indexData: IndexSnapshot | undefined
  analysis: AnalysisResult | null
  trend: MultiTimeframeTrend | null
  sectorData: IndexSectorAnalysis | null
  loading: boolean
  assetType?: 'index' | 'stock'
}

function actionBadgeClasses(action: StockAction): string {
  if (action === 'buy') return 'text-up bg-up/10 border-up/30'
  if (action === 'trim') return 'text-down bg-down/10 border-down/30'
  return 'text-neutral bg-neutral/10 border-neutral/30'
}

function actionLabel(action: StockAction): string {
  if (action === 'buy') return 'Buy Candidate'
  if (action === 'trim') return 'Reduce Risk'
  return 'Watchlist'
}

function StockIdeaRow({ idea }: { idea: StockIdea }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navigate(`/stock/${encodeURIComponent(idea.symbol)}`)}
      className="w-full text-left rounded-lg border border-border bg-bg/60 p-3 space-y-1.5 hover:border-accent/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-text-primary leading-tight">{idea.symbol}</p>
          <p className="text-[11px] text-text-muted leading-tight">{idea.name}</p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${actionBadgeClasses(idea.action)}`}>
          {actionLabel(idea.action)}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        <span className="text-text-muted">{idea.sector}</span>
        <span className={idea.changePct >= 0 ? 'text-up font-mono' : 'text-down font-mono'}>
          {idea.changePct >= 0 ? '+' : ''}
          {idea.changePct.toFixed(2)}%
        </span>
        <span className="text-text-muted font-mono">wt {idea.weight.toFixed(2)}%</span>
        <span className={idea.contributionPct >= 0 ? 'text-up font-mono' : 'text-down font-mono'}>
          contrib {idea.contributionPct >= 0 ? '+' : ''}
          {idea.contributionPct.toFixed(3)}%
        </span>
      </div>

      <p className="text-xs text-text-muted leading-relaxed">{idea.reason}</p>
    </button>
  )
}

function IdeaColumn({
  title,
  action,
  ideas,
  emptyText,
}: {
  title: string
  action: StockAction
  ideas: StockIdea[]
  emptyText: string
}) {
  const filtered = ideas.filter((idea) => idea.action === action)

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{title}</p>
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-bg/40 p-3 text-xs text-text-muted italic">{emptyText}</div>
      ) : (
        filtered.map((idea) => <StockIdeaRow key={idea.symbol} idea={idea} />)
      )}
    </div>
  )
}

export function ActionPlaybookPanel({
  indexData,
  analysis,
  trend,
  sectorData,
  loading,
  assetType = 'index',
}: ActionPlaybookPanelProps) {
  const playbook = useMemo(
    () => buildIndexPlaybook({ index: indexData, analysis, trend, sectorData }),
    [indexData, analysis, trend, sectorData],
  )

  if (assetType !== 'index') return null

  if (loading && !analysis && !trend) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-surface border border-border rounded-xl h-48 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <IdeaColumn
        title="Buy Candidates"
        action="buy"
        ideas={playbook.stockIdeas}
        emptyText="No high-conviction buys right now. Prefer waiting for cleaner setups."
      />
      <IdeaColumn
        title="Watchlist"
        action="watch"
        ideas={playbook.stockIdeas}
        emptyText="No priority watch names from current sector data."
      />
      <IdeaColumn
        title="Reduce / Avoid"
        action="trim"
        ideas={playbook.stockIdeas}
        emptyText="No major risk names identified from current sector contribution data."
      />
    </div>
  )
}
