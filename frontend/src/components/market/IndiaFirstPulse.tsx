import type { IndexSnapshot, OverviewResponse, AnalysisResult } from '../../types/market'
import { buildGlobalPulse, buildIndiaMood } from '../../utils/playbook'

interface IndiaFirstPulseProps {
  indices: IndexSnapshot[]
  overview: OverviewResponse | null
  analysisBySymbol: Record<string, AnalysisResult>
}

export function IndiaFirstPulse({ indices, overview, analysisBySymbol }: IndiaFirstPulseProps) {
  const globalPulse = buildGlobalPulse({
    indices,
    overview,
    analysisBySymbol,
  })
  const indiaMood = buildIndiaMood({
    indices,
    analysisBySymbol,
  })

  if (!indiaMood && !globalPulse) {
    return null
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-4">
        {indiaMood && (
          <div className="rounded-xl border border-border bg-bg/65 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-text-muted">India Mood Meter</p>
              <p className="text-sm font-bold text-text-primary">
                {indiaMood.score}/100
              </p>
            </div>
            <div className="h-2.5 bg-surface rounded-full overflow-hidden border border-border">
              <div
                className={`${indiaMood.score >= 65 ? 'bg-up' : indiaMood.score >= 40 ? 'bg-accent' : 'bg-down'} h-full`}
                style={{ width: `${indiaMood.score}%` }}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <p className="text-text-muted">Momentum <span className="text-text-primary">{indiaMood.components.momentum}</span></p>
              <p className="text-text-muted">Breadth <span className="text-text-primary">{indiaMood.components.breadth}</span></p>
              <p className="text-text-muted">Volatility <span className="text-text-primary">{indiaMood.components.volatility}</span></p>
              <p className="text-text-muted">Trend <span className="text-text-primary">{indiaMood.components.trendHealth}</span></p>
            </div>
            <p className="text-sm text-text-primary">{indiaMood.summary}</p>
            <p className="text-sm text-text-primary font-semibold">{indiaMood.action}</p>
          </div>
        )}

        {globalPulse && (
          <div className="rounded-xl border border-border bg-bg/65 p-4 space-y-3">
            <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-text-muted">Global Context</p>
            <p className="text-sm text-text-primary">{globalPulse.headline}</p>
            <p className="text-sm text-text-primary">{globalPulse.beginnerAction}</p>
            <p className="text-xs text-text-muted">{globalPulse.breadthText}</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-text-muted font-semibold mb-1">Leaders</p>
                {globalPulse.leaders.map((leader) => (
                  <p key={leader.symbol} className="text-text-primary">
                    <span className="font-mono">{leader.symbol}</span> {leader.movePct >= 0 ? '+' : ''}
                    {leader.movePct.toFixed(2)}%
                  </p>
                ))}
              </div>
              <div>
                <p className="text-text-muted font-semibold mb-1">Laggards</p>
                {globalPulse.laggards.map((laggard) => (
                  <p key={laggard.symbol} className="text-text-primary">
                    <span className="font-mono">{laggard.symbol}</span> {laggard.movePct >= 0 ? '+' : ''}
                    {laggard.movePct.toFixed(2)}%
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}
    </div>
  )
}
