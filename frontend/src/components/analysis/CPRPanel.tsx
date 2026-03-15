import { useMemo } from 'react'
import type { CPRBar, PCRResult } from '../../types/market'

interface CPRPanelProps {
  cpr: (CPRBar | null)[]
  lastClose: number
  currency: string
  pcr?: PCRResult | null
  pcrLoading?: boolean
  pcrUnavailable?: boolean
}

function fmt(v: number): string {
  return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function distPct(price: number, ref: number): string {
  const d = ((price - ref) / ref) * 100
  return `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`
}

// ── Zone classification using normalised cpr_low / cpr_high ────────────────
type Zone = 'above_r1' | 'above_cpr' | 'inside_cpr' | 'below_cpr' | 'below_s1'

function getZone(close: number, c: CPRBar): Zone {
  if (close >= c.r1)      return 'above_r1'
  if (close > c.cpr_high) return 'above_cpr'
  if (close >= c.cpr_low) return 'inside_cpr'
  if (close > c.s1)       return 'below_cpr'
  return 'below_s1'
}

const ZONE_INFO: Record<Zone, {
  badge: string
  cls: string
  headline: string
  hint: string
}> = {
  above_r1: {
    badge: '↑ Breakout',
    cls: 'text-up bg-up/10 border-up/30',
    headline: 'Price has broken above resistance',
    hint: 'Strong upward momentum. R2 is the next level to watch for.',
  },
  above_cpr: {
    badge: '↑ Bullish',
    cls: 'text-up bg-up/10 border-up/30',
    headline: 'Price is above the pivot zone',
    hint: 'Market has an upward bias. The pivot zone below acts as support on dips.',
  },
  inside_cpr: {
    badge: '→ Neutral',
    cls: 'text-accent bg-accent/10 border-accent/30',
    headline: 'Price is inside the pivot zone',
    hint: 'Market is undecided. A close above TC is bullish; a close below BC is bearish.',
  },
  below_cpr: {
    badge: '↓ Bearish',
    cls: 'text-down bg-down/10 border-down/30',
    headline: 'Price is below the pivot zone',
    hint: 'Market has a downward bias. The pivot zone above acts as resistance on bounces.',
  },
  below_s1: {
    badge: '↓ Breakdown',
    cls: 'text-down bg-down/10 border-down/30',
    headline: 'Price has broken below support',
    hint: 'Strong downward momentum. S2 is the next level to watch for.',
  },
}

const WIDTH_TEXT: Record<CPRBar['width_signal'], { color: string; text: string }> = {
  narrow: {
    color: 'text-up',
    text: "Yesterday was a tight, balanced session — expect a strong directional move today.",
  },
  moderate: {
    color: 'text-text-muted',
    text: "Mixed signals from yesterday — wait for a break above TC or below BC to confirm direction.",
  },
  wide: {
    color: 'text-text-muted',
    text: "Yesterday had a wide price range — today is likely to be choppy and range-bound.",
  },
}

const WIDTH_BADGE: Record<CPRBar['width_signal'], string> = {
  narrow:   'Trending Day',
  moderate: 'Mixed',
  wide:     'Range Day',
}

// ── Level row types ────────────────────────────────────────────────────────
type RowType = 'res' | 'cpr-high' | 'pivot' | 'cpr-low' | 'sup' | 'price'
interface LevelRow { key: string; value: number; type: RowType }

function rowLabelColor(type: RowType): string {
  if (type === 'res')      return 'text-down'
  if (type === 'sup')      return 'text-up'
  if (type === 'pivot')    return 'text-accent'
  if (type === 'cpr-high') return 'text-up'
  if (type === 'cpr-low')  return 'text-down'
  return 'text-accent'
}

// ── PCR signal helpers ─────────────────────────────────────────────────────
type SignalTone = 'up' | 'down' | 'neutral' | 'accent'

const VOL_SIGNAL_LABEL: Record<PCRResult['vol_signal'], string> = {
  fearful:     'Fearful',
  neutral:     'Neutral',
  complacent:  'Complacent',
  unavailable: 'N/A',
}

const OI_SIGNAL_LABEL: Record<PCRResult['oi_signal'], string> = {
  heavy_hedging:  'Heavy Hedging',
  neutral:        'Neutral',
  call_dominant:  'Call-Dominant',
}

function volSignalTone(s: PCRResult['vol_signal']): SignalTone {
  if (s === 'fearful')    return 'up'
  if (s === 'complacent') return 'down'
  return 'neutral'
}

function oiSignalTone(s: PCRResult['oi_signal']): SignalTone {
  if (s === 'heavy_hedging')  return 'up'
  if (s === 'call_dominant')  return 'down'
  return 'neutral'
}

function toneClass(t: SignalTone): string {
  if (t === 'up')     return 'text-up bg-up/10 border-up/30'
  if (t === 'down')   return 'text-down bg-down/10 border-down/30'
  if (t === 'accent') return 'text-accent bg-accent/10 border-accent/30'
  return 'text-text-muted bg-bg border-border'
}

// ── Combined CPR × PCR reading ────────────────────────────────────────────
type CombinedTone = 'up' | 'down' | 'neutral' | 'accent'

interface CombinedReading {
  tone: CombinedTone
  badge: string
  text: string
}

function getCombinedReading(zone: Zone, pcrSignal: PCRResult['overall_signal']): CombinedReading {
  const isBullishZone = zone === 'above_r1' || zone === 'above_cpr'
  const isBearishZone = zone === 'below_cpr' || zone === 'below_s1'

  if (isBullishZone && pcrSignal === 'contrarian_bullish') {
    return { tone: 'accent', badge: '↑ Breakout Confirmed', text: "Breakout confirmed by options positioning — both price structure and heavy put hedging support further upside." }
  }
  if (isBullishZone && pcrSignal === 'neutral') {
    return { tone: 'up', badge: '↑ Bullish', text: "Price is bullish. Options market is neutral — momentum may continue but watch for exhaustion." }
  }
  if (isBullishZone && pcrSignal === 'contrarian_bearish') {
    return { tone: 'down', badge: '⚠ Bullish With Risk', text: "Price is bullish but options traders are unusually complacent — risk of a sharp reversal." }
  }
  if (zone === 'inside_cpr' && pcrSignal === 'contrarian_bullish') {
    return { tone: 'up', badge: '↑ Watch for Bounce', text: "Price is at a decision point, but heavy put hedging is a contrarian buy signal. Watch for a bounce." }
  }
  if (zone === 'inside_cpr' && pcrSignal === 'neutral') {
    return { tone: 'neutral', badge: '→ Wait and See', text: "Neither CPR nor options give a directional edge. Wait for a confirmed breakout above TC or below BC." }
  }
  if (zone === 'inside_cpr' && pcrSignal === 'contrarian_bearish') {
    return { tone: 'down', badge: '↓ Caution', text: "Price is undecided and options traders are complacent — a downside break may catch many off guard." }
  }
  if (isBearishZone && pcrSignal === 'contrarian_bullish') {
    return { tone: 'up', badge: '↑ Potential Floor', text: "Price is under pressure, but extreme put hedging suggests a potential floor forming. Watch for reversal signals." }
  }
  if (isBearishZone && pcrSignal === 'neutral') {
    return { tone: 'down', badge: '↓ Bearish', text: "Price is bearish. Options market is neutral — trend likely continues lower." }
  }
  // isBearishZone && contrarian_bearish
  return { tone: 'accent', badge: '↓ Double Bearish', text: "Double bearish signal — price below pivot and call-dominant options positioning signals high risk of further decline." }
}

// ── Component ──────────────────────────────────────────────────────────────
export function CPRPanel({ cpr, lastClose, pcr, pcrLoading = false, pcrUnavailable = false }: CPRPanelProps) {
  const latest = useMemo(
    () => [...cpr].reverse().find((c) => c != null) ?? null,
    [cpr],
  )

  if (!latest) return null

  const zone    = getZone(lastClose, latest)
  const zInfo   = ZONE_INFO[zone]
  const wInfo   = WIDTH_TEXT[latest.width_signal]
  const wBadge  = WIDTH_BADGE[latest.width_signal]

  // 5 key levels + current price, sorted high → low
  const rows: LevelRow[] = [
    { key: 'R1',  value: latest.r1,       type: 'res'      as const },
    { key: 'TC',  value: latest.cpr_high, type: 'cpr-high' as const },
    { key: 'PP',  value: latest.pp,       type: 'pivot'    as const },
    { key: 'BC',  value: latest.cpr_low,  type: 'cpr-low'  as const },
    { key: 'S1',  value: latest.s1,       type: 'sup'      as const },
    { key: 'NOW', value: lastClose,       type: 'price'    as const },
  ].sort((a, b) => b.value - a.value)

  // Width sparkline — last 10 sessions
  const widthHistory = useMemo(
    () => cpr.filter(Boolean).slice(-10) as CPRBar[],
    [cpr],
  )
  const maxWidth = useMemo(
    () => Math.max(...widthHistory.map((c) => c.width_pct), 0.01),
    [widthHistory],
  )

  const combined = pcr ? getCombinedReading(zone, pcr.overall_signal) : null

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-text-primary">Today's Pivot Intelligence</h3>
          <p className="text-[11px] text-text-muted mt-0.5">
            CPR from yesterday{pcr ? ' \u00b7 Options from today\u2019s market' : ''}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
          {latest.is_virgin && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-accent/40 text-accent bg-accent/10 whitespace-nowrap">
              Virgin
            </span>
          )}
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border whitespace-nowrap ${
            latest.width_signal === 'narrow'
              ? 'text-up bg-up/10 border-up/30'
              : latest.width_signal === 'wide'
              ? 'text-text-muted bg-bg border-border'
              : 'text-accent bg-accent/10 border-accent/30'
          }`}>
            {wBadge}
          </span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${zInfo.cls}`}>
            {zInfo.badge}
          </span>
        </div>
      </div>

      {/* ── Position card ── */}
      <div className={`rounded-lg border px-3 py-2.5 ${zInfo.cls}`}>
        <p className="text-xs font-bold leading-snug">{zInfo.headline}</p>
        <p className="text-[11px] mt-1 opacity-75 leading-snug">{zInfo.hint}</p>
      </div>

      {/* ── Day type expectation ── */}
      <p className={`text-[11px] leading-relaxed ${wInfo.color}`}>
        {wInfo.text}
      </p>

      {/* ── Level strip ── */}
      <div className="space-y-0.5 pt-1 border-t border-border">
        {rows.map(({ key, value, type }) => {
          if (type === 'price') {
            return (
              <div
                key="NOW"
                className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-accent/10 border border-accent/25"
              >
                <span className="text-[10px] font-bold text-accent w-7 flex-shrink-0">NOW</span>
                <div className="flex-1 h-px border-t border-accent border-dashed opacity-60" />
                <span className="font-mono font-bold text-accent text-xs">{fmt(value)}</span>
                <span className="text-[10px] text-accent/60 w-10 text-right">close</span>
              </div>
            )
          }

          const isCPRZone = type === 'cpr-high' || type === 'cpr-low' || type === 'pivot'
          const labelColor = rowLabelColor(type)
          const isAbove = value > lastClose
          const distCls = isAbove ? 'text-down' : 'text-up'

          return (
            <div
              key={key}
              className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
                isCPRZone ? 'bg-accent/5 border border-accent/10' : ''
              }`}
            >
              <span className={`font-bold flex-shrink-0 w-7 ${labelColor}`}>{key}</span>
              <div className={`flex-1 h-px ${
                type === 'res'      ? 'bg-down/20' :
                type === 'sup'      ? 'bg-up/20'   :
                                      'bg-accent/20'
              }`} />
              <span className={`font-mono font-bold text-right ${labelColor}`}>{fmt(value)}</span>
              <span className={`text-[10px] w-10 text-right tabular-nums ${distCls}`}>
                {distPct(value, lastClose)}
              </span>
            </div>
          )
        })}
      </div>

      {/* ── Width sparkline ── */}
      {widthHistory.length > 3 && (
        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] text-text-muted">
              CPR width — last {widthHistory.length} sessions
            </p>
            <p className="text-[10px] text-text-muted opacity-60">
              green = trending · red = choppy
            </p>
          </div>
          <div className="flex items-end gap-0.5 h-5">
            {widthHistory.map((w, i) => {
              const isLast = i === widthHistory.length - 1
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col justify-end h-full"
                  title={`${w.width_signal} · ${w.width_pct.toFixed(3)}%`}
                >
                  <div
                    style={{
                      height: `${Math.max(10, (w.width_pct / maxWidth) * 100)}%`,
                      backgroundColor:
                        w.width_signal === 'narrow' ? '#22c55e'
                        : w.width_signal === 'wide'  ? '#ef4444'
                        : '#6366f1',
                      borderRadius: '1px',
                      opacity: isLast ? 1 : 0.5,
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── PCR Section ── */}
      {pcrLoading && (
        <div className="pt-3 border-t border-border">
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <div className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
            Fetching options market data…
          </div>
        </div>
      )}
      {!pcrLoading && pcrUnavailable && !pcr && (
        <div className="pt-3 border-t border-border">
          <p className="text-[10px] text-text-muted italic">
            Options positioning not available for this index (no liquid proxy ETF).
          </p>
        </div>
      )}
      {pcr && (
        <div className="pt-3 border-t border-border space-y-2.5">
          {/* PCR header */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-text-primary">Options Market Positioning</p>
            <div className="flex items-center gap-1.5">
              {pcr.is_thin_market && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-accent/40 text-accent bg-accent/10 whitespace-nowrap">
                  Indicative only
                </span>
              )}
              <span className="text-[10px] text-text-muted whitespace-nowrap">
                {pcr.proxy_ticker} · {pcr.near_expiry_count} near-term{pcr.near_expiry_count !== 1 ? '' : ''}
              </span>
            </div>
          </div>

          {/* Vol PCR + OI PCR tiles */}
          <div className="grid grid-cols-2 gap-2">
            {/* Vol PCR tile */}
            <div className={`rounded-lg border px-3 py-2 ${
              pcr.vol_signal === 'unavailable'
                ? 'border-border bg-bg'
                : toneClass(volSignalTone(pcr.vol_signal))
            }`}>
              <p className="text-[9px] font-bold uppercase tracking-widest opacity-60 mb-1">
                Near-term Vol PCR
              </p>
              <p className="text-lg font-black font-mono leading-none">
                {pcr.pcr_volume != null ? pcr.pcr_volume.toFixed(2) : '—'}
              </p>
              <p className="text-[10px] font-semibold mt-1">
                {pcr.vol_signal === 'unavailable'
                  ? 'Not available'
                  : VOL_SIGNAL_LABEL[pcr.vol_signal]}
              </p>
            </div>

            {/* OI PCR tile */}
            <div className={`rounded-lg border px-3 py-2 ${toneClass(oiSignalTone(pcr.oi_signal))}`}>
              <p className="text-[9px] font-bold uppercase tracking-widest opacity-60 mb-1">
                Structural OI PCR
              </p>
              <p className="text-lg font-black font-mono leading-none">
                {pcr.pcr_oi.toFixed(2)}
              </p>
              <p className="text-[10px] font-semibold mt-1">
                {OI_SIGNAL_LABEL[pcr.oi_signal]}
              </p>
            </div>
          </div>

          {/* Plain-English interpretation */}
          <p className="text-[11px] text-text-muted leading-relaxed">
            {pcr.signal_label}
          </p>

          {pcr.is_thin_market && (
            <p className="text-[10px] text-text-muted opacity-60 italic">
              Options data via {pcr.proxy_ticker} ETF (thin market — volume PCR omitted as unreliable).
            </p>
          )}
        </div>
      )}

      {/* ── Combined Signal ── */}
      {pcr && combined && (
        <div className="pt-3 border-t border-border space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70">
            Combined Signal
          </p>
          <div className={`rounded-lg border px-3 py-2.5 ${toneClass(combined.tone)}`}>
            <p className="text-xs font-black leading-snug">{combined.badge}</p>
            <p className="text-[11px] mt-1.5 leading-relaxed opacity-85">{combined.text}</p>
          </div>
        </div>
      )}
    </div>
  )
}
