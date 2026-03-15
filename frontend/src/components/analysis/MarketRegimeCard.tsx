import type { MarketRegimeResult } from '../../types/market'

const REGIME_CONFIG: Record<
  MarketRegimeResult['regime'],
  { label: string; bg: string; border: string; text: string; dot: string }
> = {
  bull_trending: {
    label: 'Bull Trending',
    bg: 'bg-up/10',
    border: 'border-up/30',
    text: 'text-up',
    dot: 'bg-up',
  },
  bear_trending: {
    label: 'Bear Trending',
    bg: 'bg-down/10',
    border: 'border-down/30',
    text: 'text-down',
    dot: 'bg-down',
  },
  volatile: {
    label: 'Volatile',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    text: 'text-yellow-400',
    dot: 'bg-yellow-400',
  },
  consolidating: {
    label: 'Consolidating',
    bg: 'bg-neutral/10',
    border: 'border-neutral/30',
    text: 'text-text-muted',
    dot: 'bg-text-muted',
  },
}

const BIAS_LABEL: Record<MarketRegimeResult['action_bias'], string> = {
  buy_dips: 'BUY DIPS',
  sell_rallies: 'SELL RALLIES',
  wait: 'WAIT',
  breakout_watch: 'BREAKOUT WATCH',
}

const BIAS_COLOR: Record<MarketRegimeResult['action_bias'], string> = {
  buy_dips: 'text-up bg-up/10 border-up/30',
  sell_rallies: 'text-down bg-down/10 border-down/30',
  wait: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  breakout_watch: 'text-accent bg-accent/10 border-accent/30',
}

interface Props {
  regime: MarketRegimeResult | null
}

export function MarketRegimeCard({ regime }: Props) {
  if (!regime) return null

  const cfg = REGIME_CONFIG[regime.regime]

  return (
    <div className={`rounded-2xl border p-5 space-y-4 ${cfg.bg} ${cfg.border}`}>
      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${cfg.dot}`} />
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted/70 mb-0.5">
              Market Regime
            </p>
            <p className={`text-2xl font-black leading-none ${cfg.text}`}>{cfg.label}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Action bias */}
          <span
            className={`text-xs font-black px-3 py-1.5 rounded-full border tracking-wider ${BIAS_COLOR[regime.action_bias]}`}
          >
            {BIAS_LABEL[regime.action_bias]}
          </span>

          {/* Phase badge */}
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-surface text-text-primary capitalize">
            {regime.phase} phase
          </span>
        </div>
      </div>

      {/* ── Confidence bar ─────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-text-muted font-semibold uppercase tracking-widest">Signal strength</span>
          <span className={`font-black font-mono ${cfg.text}`}>{(regime.confidence * 100).toFixed(0)}%</span>
        </div>
        <div className="h-2 bg-bg rounded-full overflow-hidden border border-border/50">
          <div
            className={`h-full rounded-full transition-all duration-700 ${cfg.dot}`}
            style={{ width: `${regime.confidence * 100}%` }}
          />
        </div>
      </div>

      {/* ── Key levels ─────────────────────────────────────────────────────── */}
      {(regime.key_support != null || regime.key_resistance != null) && (
        <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-border/30">
          {regime.key_support != null && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-text-muted">Support</span>
              <span className="font-mono font-bold text-up">
                {regime.key_support.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          )}
          {regime.key_resistance != null && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-text-muted">Resistance</span>
              <span className="font-mono font-bold text-down">
                {regime.key_resistance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Evidence & caution ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-border/30">
        {regime.drivers.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted/70">Why this regime</p>
            <ul className="space-y-1">
              {regime.drivers.map((d, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] text-text-primary leading-snug">
                  <span className={`mt-0.5 flex-shrink-0 font-black ${cfg.text}`}>›</span>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}

        {regime.caution.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted/70">Watch for</p>
            <ul className="space-y-1">
              {regime.caution.map((c, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] text-text-muted leading-snug">
                  <span className="mt-0.5 flex-shrink-0 text-yellow-400 font-black">!</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
