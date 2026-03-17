import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import type { MacroTickerDetail } from '../types/market'

// ── Helpers ───────────────────────────────────────────────────────────────────

const dirArrow = (dir: MacroTickerDetail['direction']) =>
  dir === 'rising' ? '↑' : dir === 'falling' ? '↓' : '→'

const invertedKeys = ['india_vix']

const dirColor = (dir: MacroTickerDetail['direction'], key: string) => {
  const negative = invertedKeys.includes(key) ? dir === 'rising' : dir === 'falling'
  const positive = invertedKeys.includes(key) ? dir === 'falling' : dir === 'rising'
  if (positive) return 'text-up'
  if (negative) return 'text-down'
  return 'text-text-muted'
}

function fmtValue(key: string, value: number | null): string {
  if (value === null) return '—'
  if (key === 'gold') return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return value.toFixed(2)
}

function fmtUnit(key: string): string {
  if (key === 'us_10y') return '%'
  if (key === 'gold') return 'USD/oz'
  if (key === 'brent') return 'USD/bbl'
  if (key === 'usd_inr') return '₹'
  return ''
}

// ── What-this-means explainer text ───────────────────────────────────────────

const EXPLAINERS: Record<string, { what: string; whyItMatters: string }> = {
  india_vix: {
    what: 'India VIX (Volatility Index) measures the market\'s expectation of near-term volatility in the Nifty 50. It is derived from option prices — when traders buy more put options for protection, VIX rises.',
    whyItMatters: 'A rising VIX signals fear and uncertainty. High VIX (> 20) often precedes or accompanies sharp market falls. Low VIX (< 14) suggests complacency — markets may be underpricing risk. Traders use VIX to gauge sentiment and hedge portfolios.',
  },
  us_10y: {
    what: 'The US 10-Year Treasury Yield is the return investors earn by holding US government bonds for 10 years. It is a global benchmark interest rate that influences borrowing costs worldwide.',
    whyItMatters: 'Rising yields make bonds more attractive relative to stocks, compressing equity valuations. They also increase borrowing costs for companies. For India, higher US yields can trigger FII outflows as global capital chases safe, high-yield US debt.',
  },
  usd_inr: {
    what: 'The USD/INR exchange rate shows how many Indian Rupees one US Dollar can buy. A higher number means the Rupee has weakened against the Dollar.',
    whyItMatters: 'Rupee weakening raises the cost of imports (especially oil) and can spark inflation. It creates pressure on Foreign Institutional Investors (FIIs) who earn in Rupees but report in USD — widening losses in dollar terms often triggers selling. Strengthening Rupee has the opposite, positive effect.',
  },
  brent: {
    what: 'Brent Crude is the global benchmark price for oil, set in London. It reflects the cost of extracting and delivering North Sea oil and is used to price roughly two-thirds of global oil contracts.',
    whyItMatters: 'India imports about 85% of its oil needs. Rising crude raises the import bill, widens the current account deficit, weakens the Rupee, and stokes inflation — all negative for equities and the economy. Falling crude does the opposite.',
  },
  gold: {
    what: 'Gold is a globally traded commodity and traditional safe-haven asset. Its price is denominated in USD and is sensitive to real interest rates, the Dollar, and risk appetite.',
    whyItMatters: 'Gold rising sharply usually signals risk-off sentiment — investors fleeing equities for safety. When gold falls alongside rising stocks, it often confirms a risk-on environment. Gold also affects India\'s import bill and the Rupee (India is one of the world\'s largest gold importers).',
  },
  dxy: {
    what: 'The US Dollar Index (DXY) measures the Dollar\'s strength against a basket of six major currencies (EUR, JPY, GBP, CAD, SEK, CHF). A rising DXY means a stronger Dollar.',
    whyItMatters: 'A strong Dollar is typically negative for emerging markets including India. It draws capital away from EM assets into USD-denominated investments, weakens EM currencies, and raises the cost of Dollar-denominated debt. A weakening Dollar tends to boost EM inflows and equity markets.',
  },
}

// ── Line Chart ────────────────────────────────────────────────────────────────

function LineChart({ dates, closes }: { dates: string[]; closes: number[] }) {
  if (closes.length < 2) return null

  const W = 600, H = 160
  const padL = 8, padR = 8, padT = 8, padB = 24

  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const range = max - min || 1

  const toX = (i: number) => padL + (i / (closes.length - 1)) * (W - padL - padR)
  const toY = (v: number) => padT + (1 - (v - min) / range) * (H - padT - padB)

  const pts = closes.map((c, i) => `${toX(i).toFixed(1)},${toY(c).toFixed(1)}`).join(' ')

  // Area fill path
  const areaPath = [
    `M ${toX(0).toFixed(1)},${toY(closes[0]).toFixed(1)}`,
    ...closes.slice(1).map((c, i) => `L ${toX(i + 1).toFixed(1)},${toY(c).toFixed(1)}`),
    `L ${toX(closes.length - 1).toFixed(1)},${(H - padB).toFixed(1)}`,
    `L ${toX(0).toFixed(1)},${(H - padB).toFixed(1)}`,
    'Z',
  ].join(' ')

  const isPositive = closes[closes.length - 1] >= closes[0]
  const lineColor = isPositive ? 'var(--color-up, #22c55e)' : 'var(--color-down, #ef4444)'
  const fillColor = isPositive ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'

  // Y-axis labels (3 levels)
  const yLevels = [min, (min + max) / 2, max]

  // X-axis: show ~5 evenly spaced date labels
  const xIndices = [0, Math.floor(closes.length * 0.25), Math.floor(closes.length * 0.5), Math.floor(closes.length * 0.75), closes.length - 1]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height: 160 }}
      preserveAspectRatio="none"
    >
      {/* Horizontal grid lines */}
      {yLevels.map((v, i) => (
        <line
          key={i}
          x1={padL}
          x2={W - padR}
          y1={toY(v)}
          y2={toY(v)}
          stroke="currentColor"
          strokeOpacity="0.08"
          strokeWidth="1"
        />
      ))}

      {/* Area fill */}
      <path d={areaPath} fill={fillColor} />

      {/* Line */}
      <polyline
        points={pts}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Last point dot */}
      <circle
        cx={toX(closes.length - 1)}
        cy={toY(closes[closes.length - 1])}
        r="3"
        fill={lineColor}
      />

      {/* X-axis date labels */}
      {xIndices.map((idx) => (
        <text
          key={idx}
          x={toX(idx)}
          y={H - 4}
          textAnchor={idx === 0 ? 'start' : idx === closes.length - 1 ? 'end' : 'middle'}
          fontSize="9"
          fill="currentColor"
          opacity="0.4"
        >
          {dates[idx]?.slice(5) ?? ''}
        </text>
      ))}
    </svg>
  )
}

// ── Return pill ───────────────────────────────────────────────────────────────

function ReturnPill({
  label,
  value,
}: {
  label: string
  value: number | null
}) {
  if (value === null) {
    return (
      <div className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl border border-border bg-bg/60">
        <p className="text-[10px] text-text-muted/60 uppercase tracking-wider">{label}</p>
        <p className="text-lg font-black font-mono text-text-muted">—</p>
      </div>
    )
  }
  const pos = value >= 0
  return (
    <div
      className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl border ${pos ? 'border-up/30 bg-up/5' : 'border-down/30 bg-down/5'}`}
    >
      <p className="text-[10px] text-text-muted/60 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-black font-mono ${pos ? 'text-up' : 'text-down'}`}>
        {pos ? '+' : ''}{value.toFixed(2)}%
      </p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function MacroDetail() {
  const { key } = useParams<{ key: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<MacroTickerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!key) return
    setLoading(true)
    setError(null)
    api
      .getMacroDetail(key)
      .then(setData)
      .catch(() => setError('Failed to load indicator data'))
      .finally(() => setLoading(false))
  }, [key])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-text-muted text-sm">Loading indicator data...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-down font-medium">{error ?? 'Indicator not found'}</p>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold"
        >
          Go Back
        </button>
      </div>
    )
  }

  const arrowColor = dirColor(data.direction, data.key)
  const explainer = EXPLAINERS[data.key]

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-text-muted hover:text-text-primary text-sm transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* Hero */}
      <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted/60">{data.key}</p>
            <h1 className="text-2xl font-extrabold text-text-primary mt-1">{data.label}</h1>
          </div>
          <span className={`text-4xl font-black ${arrowColor}`}>{dirArrow(data.direction)}</span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-black font-mono text-text-primary">
            {fmtValue(data.key, data.value)}
          </span>
          {fmtUnit(data.key) && (
            <span className="text-base text-text-muted">{fmtUnit(data.key)}</span>
          )}
        </div>

        <p className="text-sm text-text-muted leading-relaxed">{data.context}</p>
      </div>

      {/* Returns */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <p className="text-sm font-semibold text-text-primary mb-4">Performance Across Timeframes</p>
        <div className="grid grid-cols-3 gap-3">
          <ReturnPill label="1 Week" value={data.change_1w_pct} />
          <ReturnPill label="1 Month" value={data.change_1m_pct} />
          <ReturnPill label="3 Months" value={data.change_3m_pct} />
        </div>
      </div>

      {/* Chart */}
      {data.history_closes.length >= 2 && (
        <div className="bg-surface border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-text-primary">90-Day Price History</p>
            <p className="text-[11px] text-text-muted">
              {data.history_dates[0]} → {data.history_dates[data.history_dates.length - 1]}
            </p>
          </div>
          <div className="text-text-muted">
            <LineChart dates={data.history_dates} closes={data.history_closes} />
          </div>
          <div className="flex justify-between mt-1">
            <p className="text-[10px] text-text-muted font-mono">
              Low: {fmtValue(data.key, Math.min(...data.history_closes))} {fmtUnit(data.key)}
            </p>
            <p className="text-[10px] text-text-muted font-mono">
              High: {fmtValue(data.key, Math.max(...data.history_closes))} {fmtUnit(data.key)}
            </p>
          </div>
        </div>
      )}

      {/* Explainer */}
      {explainer && (
        <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
          <p className="text-sm font-semibold text-text-primary">Understanding {data.label}</p>
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted/60 mb-1">What it is</p>
              <p className="text-sm text-text-muted leading-relaxed">{explainer.what}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted/60 mb-1">Why it matters</p>
              <p className="text-sm text-text-muted leading-relaxed">{explainer.whyItMatters}</p>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-text-muted text-center">Data via Yahoo Finance · refreshed every 5 minutes</p>
    </div>
  )
}
