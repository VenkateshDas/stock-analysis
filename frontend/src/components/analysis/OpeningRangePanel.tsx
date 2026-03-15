import type { OpeningRangeResult, HistoricalGapDay } from '../../types/market'

interface OpeningRangePanelProps {
  data: OpeningRangeResult | null
  loading: boolean
}

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—'
  return v.toFixed(decimals)
}

function fmtPrice(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-4 border-t border-border first:border-0 first:pt-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/60 mb-3">
        {title}
      </p>
      {children}
    </div>
  )
}

function Hint({ text }: { text: string }) {
  return <p className="text-xs text-text-muted/70 italic mt-1">{text}</p>
}

// ── Gap section ──────────────────────────────────────────────────────────────
function GapSection({ data }: { data: OpeningRangeResult }) {
  const { gap } = data
  const isUp = gap.gap_type === 'GAP_UP'
  const isDown = gap.gap_type === 'GAP_DOWN'

  const badgeColor = isUp
    ? 'text-up bg-up/10 border-up/30'
    : isDown
    ? 'text-down bg-down/10 border-down/30'
    : 'text-neutral bg-neutral/10 border-neutral/30'

  const sign = gap.gap_pct >= 0 ? '+' : ''

  return (
    <Section title="Today's Opening Gap">
      <div className="flex items-start gap-4">
        {/* Badge */}
        <div
          className={`flex-shrink-0 rounded-lg border px-3 py-2 text-center min-w-[90px] ${badgeColor}`}
        >
          <p className="text-xs font-bold leading-none mb-1">
            {isUp ? 'GAP UP' : isDown ? 'GAP DOWN' : 'FLAT'}
          </p>
          <p className="text-base font-mono font-bold">
            {sign}{fmt(gap.gap_pct, 2)}%
          </p>
        </div>

        {/* Details */}
        <div className="space-y-1 text-xs">
          <div className="flex gap-3">
            <span className="text-text-muted w-20">Prev Close</span>
            <span className="font-mono text-text-primary font-semibold">
              {fmtPrice(gap.prev_close)}
            </span>
          </div>
          <div className="flex gap-3">
            <span className="text-text-muted w-20">Today's Open</span>
            <span className="font-mono text-text-primary font-semibold">
              {fmtPrice(gap.open_price)}
            </span>
          </div>
          <div className="flex gap-3">
            <span className="text-text-muted w-20">Gap</span>
            <span className={`font-mono font-semibold ${isUp ? 'text-up' : isDown ? 'text-down' : 'text-neutral'}`}>
              {sign}{fmtPrice(gap.gap_pts)} pts ({sign}{fmt(gap.gap_pct, 2)}%)
            </span>
          </div>
        </div>
      </div>

      <Hint
        text={
          isUp
            ? 'Opened higher than yesterday — buyers pushed price up before market open.'
            : isDown
            ? 'Opened lower than yesterday — sellers pushed price down before market open.'
            : 'Opened nearly at the same level as yesterday — no significant gap.'
        }
      />
    </Section>
  )
}

// ── OHOL section ─────────────────────────────────────────────────────────────
function OHOLSection({ data }: { data: OpeningRangeResult }) {
  const current = data.ohol_current ?? data.ohol
  const previous = data.ohol_previous
  const bothUnavailable =
    current.signal === 'UNAVAILABLE' &&
    (!previous || previous.signal === 'UNAVAILABLE')

  if (bothUnavailable) {
    return (
      <Section title="First 15 Minutes (3 x 5m)  ·  Open = High / Low">
        <p className="text-xs text-text-muted italic">
          Intraday data not available for this index.
        </p>
        {current.data_source && (
          <p className="text-[10px] text-text-muted/60 mt-1">Source: {current.data_source}</p>
        )}
      </Section>
    )
  }

  return (
    <Section title="First 15 Minutes (3 x 5m)  ·  Open = High / Low">
      <div className="space-y-3">
        <OHOLSignalCard label="Current Session" ohol={current} />
        {previous && <OHOLSignalCard label="Previous Session" ohol={previous} />}
      </div>
    </Section>
  )
}

function OHOLSignalCard({ label, ohol }: { label: string; ohol: OpeningRangeResult['ohol'] }) {
  if (ohol.signal === 'UNAVAILABLE') {
    return (
      <div className="border border-border rounded-lg p-3">
        <p className="text-[10px] uppercase tracking-wide text-text-muted/70 mb-1">
          {label}{ohol.session_date ? ` · ${ohol.session_date}` : ''}
        </p>
        <p className="text-xs text-text-muted italic">
          Intraday data unavailable for this session.
        </p>
      </div>
    )
  }

  const isBullish = ohol.signal === 'OPEN_LOW'
  const isBearish = ohol.signal === 'OPEN_HIGH'
  const isDoji = ohol.signal === 'DOJI'

  const signalLabel =
    isBullish
      ? 'OPEN = LOW  ←  Bullish'
      : isBearish
      ? 'OPEN = HIGH  ←  Bearish'
      : isDoji
      ? 'DOJI  ·  Open ≈ High ≈ Low'
      : 'No OHOL Signal'

  const signalColor = isBullish
    ? 'text-up bg-up/10 border-up/30'
    : isBearish
    ? 'text-down bg-down/10 border-down/30'
    : isDoji
    ? 'text-neutral bg-neutral/10 border-neutral/30'
    : 'text-text-muted bg-bg border-border'

  const hint = isBullish
    ? 'Price never went below the open — bulls were in full control from the first candle. Watch for a breakout above the session high.'
    : isBearish
    ? 'Price never went above the open — bears were in full control from the first candle. Watch for a breakdown below the session low.'
    : isDoji
    ? 'The first candle had almost no range — the market is undecided. Wait for a clearer directional move.'
    : 'The first candle has both a higher high and a lower low than the open — no clear OHOL setup.'

  return (
    <div className="border border-border rounded-lg p-3">
      <p className="text-[10px] uppercase tracking-wide text-text-muted/70 mb-2">
        {label}{ohol.session_date ? ` · ${ohol.session_date}` : ''}
      </p>
      {/* Signal badge */}
      <div className={`inline-block text-xs font-bold px-3 py-1 rounded-full border mb-3 ${signalColor}`}>
        {signalLabel}
      </div>

      {/* OHLC values */}
      {ohol.candle_open != null && (
        <div className="grid grid-cols-4 gap-2 mb-2">
          {[
            { label: 'Open', val: ohol.candle_open },
            { label: 'High', val: ohol.candle_high },
            { label: 'Low', val: ohol.candle_low },
            { label: 'Close', val: ohol.candle_close },
          ].map(({ label, val }) => (
            <div key={label} className="bg-bg rounded-lg p-2 text-center">
              <p className="text-[10px] text-text-muted mb-0.5">{label}</p>
              <p className="text-xs font-mono text-text-primary font-semibold">
                {fmtPrice(val)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Entry triggers */}
      {ohol.entry_trigger_long != null && (
        <div className="flex items-center gap-2 bg-up/5 border border-up/20 rounded-lg px-3 py-2 mb-1">
          <span className="text-xs text-up font-semibold">Long trigger:</span>
          <span className="text-xs font-mono text-up font-bold">
            Breakout above {fmtPrice(ohol.entry_trigger_long)}
          </span>
        </div>
      )}
      {ohol.entry_trigger_short != null && (
        <div className="flex items-center gap-2 bg-down/5 border border-down/20 rounded-lg px-3 py-2 mb-1">
          <span className="text-xs text-down font-semibold">Short trigger:</span>
          <span className="text-xs font-mono text-down font-bold">
            Breakdown below {fmtPrice(ohol.entry_trigger_short)}
          </span>
        </div>
      )}

      {ohol.candle_time && (
        <p className="text-[10px] text-text-muted/60 mt-1">
          Window: {ohol.window_minutes ?? 15}m ({ohol.bars_used ?? 0} x 5m bars) · {ohol.candle_time} · Source: {ohol.data_source}
        </p>
      )}

      <Hint text={hint} />
    </div>
  )
}

// ── Historical gap section ───────────────────────────────────────────────────
function GapHistorySection({ data }: { data: OpeningRangeResult }) {
  const flatPct = Math.max(0, 100 - data.gap_up_pct - data.gap_down_pct)

  return (
    <Section title="Last 30 Days  ·  Gap History">
      {/* Summary stats */}
      <div className="flex items-center gap-4 mb-3 text-xs">
        <span className="text-up font-semibold">{data.gap_up_pct}% Gap Up</span>
        <span className="text-border">|</span>
        <span className="text-down font-semibold">{data.gap_down_pct}% Gap Down</span>
        <span className="text-border">|</span>
        <span className="text-neutral font-semibold">{flatPct.toFixed(1)}% Flat</span>
      </div>
      <p className="text-xs text-text-muted mb-3">
        Avg gap size: <span className="font-mono text-text-primary">{fmt(data.avg_gap_pct, 2)}%</span>
      </p>

      {/* Mini bar chart */}
      <MiniBarChart gaps={data.historical_gaps} />
    </Section>
  )
}

function MiniBarChart({ gaps }: { gaps: HistoricalGapDay[] }) {
  if (gaps.length === 0) return null

  // Scale: 2% = full height
  const MAX_PCT = 2

  return (
    <div className="flex items-end gap-px h-10 rounded overflow-hidden">
      {gaps.map((day, i) => {
        const heightPct = Math.min(100, (Math.abs(day.gap_pct) / MAX_PCT) * 100)
        const minHeightPx = 3
        const bg =
          day.gap_type === 'GAP_UP'
            ? '#26B856'
            : day.gap_type === 'GAP_DOWN'
            ? '#EF5350'
            : '#6B7280'
        const sign = day.gap_pct >= 0 ? '+' : ''
        return (
          <div
            key={i}
            title={`${day.date}: ${sign}${day.gap_pct.toFixed(2)}% (${day.gap_type})`}
            className="flex-1 flex flex-col justify-end cursor-default"
            style={{ height: '100%' }}
          >
            <div
              style={{
                height: `max(${minHeightPx}px, ${heightPct}%)`,
                backgroundColor: bg,
                borderRadius: '1px',
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export function OpeningRangePanel({ data, loading }: OpeningRangePanelProps) {
  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-xl h-64 animate-pulse" />
    )
  }

  if (!data) {
    return (
      <div className="bg-surface border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Opening Range Analysis</h3>
        <p className="text-xs text-text-muted italic">Opening range data is unavailable for this index.</p>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-0">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Opening Range Analysis</h3>

      <GapSection data={data} />
      <OHOLSection data={data} />
      <GapHistorySection data={data} />

      {data.note && (
        <p className="text-[10px] text-text-muted/60 italic pt-3 border-t border-border">
          {data.note}
        </p>
      )}
    </div>
  )
}
