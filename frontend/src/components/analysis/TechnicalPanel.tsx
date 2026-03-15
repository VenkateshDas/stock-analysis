import type { TechnicalIndicators } from '../../types/market'

interface TechnicalPanelProps {
  data: TechnicalIndicators
  currency: string
}

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—'
  return v.toFixed(decimals)
}

// Pill badge with automatic colour
function Signal({ value, positive }: { value: string; positive: boolean }) {
  const color = positive
    ? 'text-up bg-up/10 border-up/30'
    : 'text-down bg-down/10 border-down/30'
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${color}`}>
      {value}
    </span>
  )
}

// Small italic "what this means" hint
function Hint({ text }: { text: string }) {
  return <p className="text-xs text-text-muted/70 italic mt-1">{text}</p>
}

// Section divider with title
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

function RSIGauge({ rsi }: { rsi: number | null }) {
  const value = rsi ?? 50
  const pct = Math.min(100, Math.max(0, value))
  const color = value >= 70 ? '#EF5350' : value <= 30 ? '#26B856' : '#2F81F7'

  return (
    <div>
      <div className="flex justify-between text-xs text-text-muted mb-1.5">
        <span>Oversold (30)</span>
        <span className="font-mono text-text-primary font-bold">{fmt(rsi, 1)}</span>
        <span>Overbought (70)</span>
      </div>
      <div className="h-2.5 bg-bg rounded-full overflow-hidden relative">
        <div className="absolute left-[30%] top-0 bottom-0 w-px bg-border/80" />
        <div className="absolute left-[70%] top-0 bottom-0 w-px bg-border/80" />
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

// Map raw signals to plain-English phrases
const RSI_MEANING: Record<string, string> = {
  overbought: 'A lot of buyers have pushed the price up quickly — it may slow down or pull back soon.',
  oversold: 'Heavy selling has pushed the price down — it may bounce back soon.',
  neutral: 'Buying and selling activity is balanced. No extreme pressure in either direction.',
}

const MACD_MEANING: Record<string, string> = {
  bullish: 'Short-term upward momentum is building — buyers are gaining control.',
  bearish: 'Short-term downward momentum is building — sellers are gaining control.',
  neutral: 'No clear momentum in either direction right now.',
}

const ADX_MEANING: Record<string, string> = {
  strong_trend: 'The current direction (up or down) is very strong and likely to continue.',
  moderate_trend: 'A moderate trend is in place — not super strong, but it has direction.',
  weak_trend: "There's a slight trend but it's not convincing yet.",
  no_trend: 'The market is moving sideways with no clear direction.',
}

const BB_MEANING: Record<string, string> = {
  above_upper: 'Price has stretched well above its normal range — may pull back.',
  below_lower: 'Price has dropped below its normal range — may bounce back.',
  near_upper: 'Price is near the top of its recent trading range.',
  near_lower: 'Price is near the bottom of its recent trading range.',
  middle: "Price is in the middle of its normal range — no extreme position.",
}

const OBV_MEANING: Record<string, string> = {
  rising: 'More investors are putting money in over time — a positive sign.',
  falling: 'Investors are gradually pulling money out — watch carefully.',
  flat: "Money flow isn't clearly going in or out.",
}

export function TechnicalPanel({ data, currency: _currency }: TechnicalPanelProps) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-0">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Indicator Breakdown</h3>

      {/* ── 1. BUYING PRESSURE (RSI) ────────────────────────────────── */}
      <Section title="Buying Pressure  ·  RSI (14)">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-primary font-medium">
            {data.rsi_signal === 'overbought'
              ? 'High buying pressure'
              : data.rsi_signal === 'oversold'
              ? 'High selling pressure'
              : 'Normal activity'}
          </span>
          <Signal
            value={data.rsi_signal === 'neutral' ? 'Neutral' : data.rsi_signal === 'overbought' ? 'Overbought' : 'Oversold'}
            positive={data.rsi_signal === 'oversold'}
          />
        </div>
        <RSIGauge rsi={data.rsi} />
        <Hint text={RSI_MEANING[data.rsi_signal] ?? ''} />
      </Section>

      {/* ── 2. TREND DIRECTION (MACD) ───────────────────────────────── */}
      <Section title="Trend Direction  ·  MACD (12, 26, 9)">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-primary font-medium">
            {data.macd_signal === 'bullish'
              ? 'Upward momentum building'
              : data.macd_signal === 'bearish'
              ? 'Downward momentum building'
              : 'No clear direction'}
          </span>
          <Signal
            value={data.macd_signal === 'bullish' ? 'Bullish' : data.macd_signal === 'bearish' ? 'Bearish' : 'Neutral'}
            positive={data.macd_signal === 'bullish'}
          />
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {[
            { label: 'MACD line', val: data.macd.macd },
            { label: 'Signal line', val: data.macd.signal },
            { label: 'Difference', val: data.macd.histogram },
          ].map(({ label, val }) => (
            <div key={label} className="bg-bg rounded-lg p-2 text-center">
              <p className="text-[10px] text-text-muted mb-0.5">{label}</p>
              <p className={`text-sm font-mono font-bold ${val != null && val >= 0 ? 'text-up' : 'text-down'}`}>
                {fmt(val, 2)}
              </p>
            </div>
          ))}
        </div>
        <Hint text={MACD_MEANING[data.macd_signal] ?? ''} />
      </Section>

      {/* ── 3. TREND STRENGTH (ADX) ─────────────────────────────────── */}
      <Section title="Trend Strength  ·  ADX (14)">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-primary font-medium">
            {data.adx_signal === 'strong_trend'
              ? 'Very strong trend'
              : data.adx_signal === 'moderate_trend'
              ? 'Moderate trend'
              : data.adx_signal === 'weak_trend'
              ? 'Weak trend'
              : 'No clear trend (sideways)'}
          </span>
          <span className="text-xs text-text-muted font-mono">ADX {fmt(data.adx, 1)}</span>
        </div>
        {/* ADX strength bar */}
        <div className="h-2 bg-bg rounded-full overflow-hidden mb-1.5">
          <div
            className="h-full rounded-full bg-accent transition-all duration-700"
            style={{ width: `${Math.min(100, ((data.adx ?? 0) / 60) * 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-text-muted mb-1">
          <span>Sideways (0)</span>
          <span>Strong (40+)</span>
        </div>
        {/* Direction: +DI vs -DI */}
        {data.plus_di != null && data.minus_di != null && (
          <div className="flex gap-3 mt-2">
            <div className="flex-1 bg-bg rounded-lg p-2 text-center border border-up/20">
              <p className="text-[10px] text-text-muted mb-0.5">Upward force</p>
              <p className="text-sm font-mono font-bold text-up">{fmt(data.plus_di, 1)}</p>
            </div>
            <div className="flex-1 bg-bg rounded-lg p-2 text-center border border-down/20">
              <p className="text-[10px] text-text-muted mb-0.5">Downward force</p>
              <p className="text-sm font-mono font-bold text-down">{fmt(data.minus_di, 1)}</p>
            </div>
          </div>
        )}
        <Hint text={ADX_MEANING[data.adx_signal] ?? ''} />
      </Section>

      {/* ── 4. PRICE POSITION IN RANGE (Bollinger Bands) ───────────── */}
      <Section title="Price Position in Range  ·  Bollinger Bands (20, 2σ)">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-primary font-medium">
            {data.bb_signal === 'above_upper'
              ? 'Above normal range'
              : data.bb_signal === 'below_lower'
              ? 'Below normal range'
              : data.bb_signal === 'near_upper'
              ? 'Near top of range'
              : data.bb_signal === 'near_lower'
              ? 'Near bottom of range'
              : 'Middle of range'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Upper band', val: data.bollinger.upper },
            { label: 'Middle (avg)', val: data.bollinger.middle },
            { label: 'Lower band', val: data.bollinger.lower },
          ].map(({ label, val }) => (
            <div key={label} className="bg-bg rounded-lg p-2 text-center">
              <p className="text-[10px] text-text-muted mb-0.5">{label}</p>
              <p className="text-sm font-mono text-text-primary">{fmt(val, 2)}</p>
            </div>
          ))}
        </div>
        {data.bollinger.percent_b != null && (
          <div className="mt-2">
            <div className="flex justify-between text-xs text-text-muted mb-1">
              <span>Lower band</span>
              <span className="font-mono text-accent">{(data.bollinger.percent_b * 100).toFixed(0)}% of range</span>
              <span>Upper band</span>
            </div>
            <div className="h-2 bg-bg rounded-full overflow-hidden border border-border">
              <div
                className="h-full bg-accent rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, Math.max(0, data.bollinger.percent_b * 100))}%` }}
              />
            </div>
          </div>
        )}
        <Hint text={BB_MEANING[data.bb_signal] ?? ''} />
      </Section>

      {/* ── 5. PRICE VS HISTORICAL AVERAGES (SMA) ───────────────────── */}
      <Section title="Price vs Historical Averages  ·  Moving Averages">
        <p className="text-xs text-text-muted mb-2">
          Is the current price above or below its own average over different time periods?
        </p>
        <div className="space-y-2">
          {[
            { label: '20-day avg (1 month)', val: data.sma20, signal: data.price_vs_sma20 },
            { label: '50-day avg (2 months)', val: data.sma50, signal: data.price_vs_sma50 },
            { label: '200-day avg (10 months)', val: data.sma200, signal: data.price_vs_sma200 },
          ].map(({ label, val, signal }) => (
            <div key={label} className="flex items-center justify-between bg-bg rounded-lg px-3 py-2">
              <div>
                <p className="text-xs text-text-muted">{label}</p>
                <p className="text-xs font-mono text-text-primary font-bold">{fmt(val, 2)}</p>
              </div>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full border flex-shrink-0
                            ${signal === 'above'
                              ? 'text-up bg-up/10 border-up/30'
                              : 'text-down bg-down/10 border-down/30'
                            }`}
              >
                {signal === 'above' ? '▲ Above average' : '▼ Below average'}
              </span>
            </div>
          ))}
        </div>
        <Hint text="Being above all three averages is a positive sign. Below all three is a caution sign." />
      </Section>

      {/* ── 6. VOLATILITY & VOLUME ──────────────────────────────────── */}
      <Section title="Volatility & Trading Activity">
        <div className="grid grid-cols-2 gap-3">
          {/* ATR */}
          <div className="bg-bg rounded-lg p-3">
            <p className="text-xs text-text-muted mb-1 font-medium">Daily Price Swing</p>
            <p className="text-sm font-mono text-text-primary font-bold">{fmt(data.atr, 2)}</p>
            {data.atr_pct != null && (
              <p className="text-xs text-text-muted">{data.atr_pct.toFixed(2)}% of price</p>
            )}
            <Hint text="Typical up/down range per day." />
          </div>

          {/* RVOL */}
          <div className="bg-bg rounded-lg p-3">
            <p className="text-xs text-text-muted mb-1 font-medium">Today's Volume</p>
            <p
              className={`text-sm font-mono font-bold ${
                data.rvol_signal === 'high'
                  ? 'text-up'
                  : data.rvol_signal === 'low'
                  ? 'text-text-muted'
                  : 'text-text-primary'
              }`}
            >
              {fmt(data.rvol, 2)}× normal
            </p>
            <p className="text-xs text-text-muted capitalize">
              {data.rvol_signal === 'high'
                ? 'Unusually busy day'
                : data.rvol_signal === 'low'
                ? 'Quiet trading day'
                : 'Normal trading day'}
            </p>
          </div>
        </div>

        {/* OBV */}
        <div className="flex items-center justify-between mt-3 bg-bg rounded-lg px-3 py-2">
          <div>
            <p className="text-xs text-text-muted font-medium">Money Flow Trend</p>
            <p className="text-xs text-text-muted">(Are more people buying or selling over time?)</p>
          </div>
          <span
            className={`text-xs font-semibold capitalize px-2 py-0.5 rounded-full border flex-shrink-0 ml-2
                        ${data.obv_trend === 'rising'
                          ? 'text-up bg-up/10 border-up/30'
                          : data.obv_trend === 'falling'
                          ? 'text-down bg-down/10 border-down/30'
                          : 'text-neutral bg-neutral/10 border-neutral/30'
                        }`}
          >
            {data.obv_trend === 'rising'
              ? 'Buying trend'
              : data.obv_trend === 'falling'
              ? 'Selling trend'
              : 'No clear trend'}
          </span>
        </div>
        <Hint text={OBV_MEANING[data.obv_trend] ?? ''} />
      </Section>
    </div>
  )
}
