import type { TradeSetup } from '../../types/market'

const INDEX_LABELS: Record<string, string> = {
  NSEI: 'Nifty 50',
  CNX100: 'Nifty 100',
  CNX200: 'Nifty 200',
  NSEBANK: 'Bank Nifty',
}

function QualityBadge({ quality }: { quality: 'A' | 'B' | 'C' }) {
  const cfg = {
    A: 'text-up bg-up/10 border-up/30',
    B: 'text-accent bg-accent/10 border-accent/30',
    C: 'text-text-muted bg-border/20 border-border',
  }[quality]
  return (
    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${cfg}`}>
      {quality}-grade
    </span>
  )
}

function SetupCard({ setup }: { setup: TradeSetup }) {
  const isLong = setup.direction === 'long'
  const dirBg = isLong ? 'border-up/20 bg-up/5' : 'border-down/20 bg-down/5'
  const dirText = isLong ? 'text-up' : 'text-down'
  const dirBadge = isLong
    ? 'text-up bg-up/10 border-up/30'
    : 'text-down bg-down/10 border-down/30'
  const rrColor = setup.risk_reward >= 2.5 ? 'text-up' : setup.risk_reward >= 2.0 ? 'text-accent' : 'text-text-muted'

  const alpha = setup.relative_return_1m
  const alphaSign = alpha >= 0 ? '+' : ''

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${dirBg}`}>
      {/* ── Stock header ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
            <span
              className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${dirBadge}`}
            >
              {setup.direction.toUpperCase()}
            </span>
            <QualityBadge quality={setup.quality} />
            <span className="text-[9px] text-text-muted bg-bg border border-border px-2 py-0.5 rounded-full">
              {setup.sector}
            </span>
          </div>
          <p className="text-sm font-bold text-text-primary truncate">{setup.name}</p>
          <p className="text-[10px] text-text-muted font-mono">{setup.symbol}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-[9px] text-text-muted">Weight</p>
          <p className="text-xs font-bold text-text-primary">{setup.weight_in_index.toFixed(1)}%</p>
          <p className={`text-[10px] font-mono ${alpha >= 0 ? 'text-up' : 'text-down'}`}>
            Alpha {alphaSign}{alpha.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* ── Price levels ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-bg/60 rounded-lg px-2 py-2 border border-border/50">
          <p className="text-[9px] text-text-muted uppercase tracking-widest">Entry</p>
          <p className="text-sm font-black font-mono text-text-primary">
            {setup.entry_price.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="bg-down/5 rounded-lg px-2 py-2 border border-down/20">
          <p className="text-[9px] text-text-muted uppercase tracking-widest">Stop</p>
          <p className="text-sm font-black font-mono text-down">
            {setup.stop_loss.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="bg-up/5 rounded-lg px-2 py-2 border border-up/20">
          <p className="text-[9px] text-text-muted uppercase tracking-widest">Target</p>
          <p className="text-sm font-black font-mono text-up">
            {setup.target.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* ── Risk/Reward ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className={`text-xs font-black px-3 py-1 rounded-full border ${dirBadge} ${dirText}`}>
          {setup.risk_reward.toFixed(1)}:1 R/R
        </span>
        <span className={`text-[10px] font-semibold ${rrColor}`}>
          {setup.risk_reward >= 2.5 ? 'Excellent' : setup.risk_reward >= 2.0 ? 'Good' : 'Acceptable'}
        </span>
      </div>

      {/* ── Evidence ───────────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted/70">Evidence</p>
        <ul className="space-y-0.5">
          {setup.reasons.map((r, i) => (
            <li key={i} className={`flex items-start gap-1.5 text-[10px] leading-snug`}>
              <span className={`mt-0.5 flex-shrink-0 font-black ${dirText}`}>›</span>
              <span className="text-text-primary">{r}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Risks ───────────────────────────────────────────────────────────── */}
      <div className="space-y-1 pt-2 border-t border-border/30">
        <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted/70">Risks</p>
        <ul className="space-y-0.5">
          {setup.risks.map((r, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[10px] leading-snug">
              <span className="mt-0.5 flex-shrink-0 text-yellow-400 font-black">!</span>
              <span className="text-text-muted">{r}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

interface Props {
  symbol: string
  setups: TradeSetup[]
  loading: boolean
}

export function OpportunitiesPanel({ symbol, setups, loading }: Props) {
  const indexLabel = INDEX_LABELS[symbol] ?? symbol

  const longs = setups.filter((s) => s.direction === 'long')
  const shorts = setups.filter((s) => s.direction === 'short')

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 space-y-5">
      <div>
        <h3 className="text-sm font-extrabold text-text-primary">Top Setups in {indexLabel}</h3>
        <p className="text-xs text-text-muted mt-0.5">
          Scanned from index constituents · Entry, stop, and target computed from price structure
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-64 rounded-xl border border-border bg-bg animate-pulse" />
          ))}
        </div>
      ) : setups.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-text-muted text-sm">No high-quality setups found right now.</p>
          <p className="text-text-muted/60 text-xs mt-1">
            Markets may be in transition — check back when a clearer trend emerges.
          </p>
        </div>
      ) : (
        <>
          {longs.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-up flex-shrink-0" />
                <p className="text-xs font-bold text-up uppercase tracking-widest">Long Setups</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {longs.map((s) => (
                  <SetupCard key={s.symbol} setup={s} />
                ))}
              </div>
            </div>
          )}

          {shorts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-down flex-shrink-0" />
                <p className="text-xs font-bold text-down uppercase tracking-widest">Short Setups</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {shorts.map((s) => (
                  <SetupCard key={s.symbol} setup={s} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
