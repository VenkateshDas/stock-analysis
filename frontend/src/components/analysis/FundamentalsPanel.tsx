import type { StockFundamentals } from '../../types/market'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null, decimals = 1, suffix = ''): string {
  if (n == null) return '—'
  return n.toFixed(decimals) + suffix
}

function fmtMarketCap(n: number | null, currency: string): string {
  if (n == null) return '—'
  if (n >= 1e12) return `${currency} ${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9)  return `${currency} ${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6)  return `${currency} ${(n / 1e6).toFixed(2)}M`
  return `${currency} ${n.toLocaleString()}`
}

type Signal = 'positive' | 'negative' | 'neutral' | 'none'

function growthColor(val: number | null): string {
  if (val == null) return 'text-text-muted'
  if (val > 10) return 'text-up'
  if (val < 0)  return 'text-down'
  return 'text-neutral'
}

// ── Metric row ────────────────────────────────────────────────────────────────

function Row({ label, value, signal = 'none', subtext }: {
  label: string
  value: string
  signal?: Signal
  subtext?: string
}) {
  const valueColor =
    signal === 'positive' ? 'text-up' :
    signal === 'negative' ? 'text-down' :
    signal === 'neutral'  ? 'text-neutral' : 'text-text-primary'

  return (
    <div className="flex items-start justify-between gap-2 py-1">
      <div>
        <span className="text-[11px] text-text-muted">{label}</span>
        {subtext && <p className="text-[10px] text-text-muted/50">{subtext}</p>}
      </div>
      <span className={`text-xs font-mono font-semibold flex-shrink-0 ${valueColor}`}>{value}</span>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  data: StockFundamentals
  loading?: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FundamentalsPanel({ data, loading }: Props) {
  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70 mb-3">
          Fundamentals
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="h-10 rounded-xl bg-border/30 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">

      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-border flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-text-primary">Fundamentals</p>
          <p className="text-[11px] text-text-muted mt-0.5">
            {fmtMarketCap(data.market_cap, data.currency)} market cap
          </p>
        </div>
        {data.beta != null && (
          <span className={`text-xs font-mono font-bold px-3 py-1.5 rounded-full border ${
            data.beta > 1.3 ? 'text-down bg-down/10 border-down/30' :
            data.beta < 0.7 ? 'text-up bg-up/10 border-up/30' :
            'text-neutral bg-neutral/10 border-neutral/30'
          }`}>
            β {fmt(data.beta, 2)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">

        {/* ── Column 1: Valuation ── */}
        <div className="px-5 py-4 space-y-0.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70 mb-2">Valuation</p>
          <Row label="Price / Earnings (trailing)" value={fmt(data.trailing_pe) + 'x'} />
          <Row label="Price / Earnings (forward)"  value={fmt(data.forward_pe) + 'x'} />
          <Row label="Price / Book"                value={fmt(data.price_to_book, 2) + 'x'} />
          <Row label="EV / EBITDA"                 value={fmt(data.ev_to_ebitda) + 'x'} />
          {data.dividend_yield != null && (
            <Row
              label="Dividend Yield"
              value={fmt(data.dividend_yield, 2) + '%'}
              signal={data.dividend_yield > 3 ? 'positive' : 'neutral'}
            />
          )}
        </div>

        {/* ── Column 2: Growth & Profitability ── */}
        <div className="px-5 py-4 space-y-0.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70 mb-2">Growth & Margins</p>
          <div className="flex items-center justify-between py-1">
            <span className="text-[11px] text-text-muted">Earnings growth (YoY)</span>
            <span className={`text-xs font-mono font-semibold ${growthColor(data.earnings_growth)}`}>
              {data.earnings_growth != null
                ? (data.earnings_growth >= 0 ? '+' : '') + fmt(data.earnings_growth) + '%'
                : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-[11px] text-text-muted">Revenue growth (YoY)</span>
            <span className={`text-xs font-mono font-semibold ${growthColor(data.revenue_growth)}`}>
              {data.revenue_growth != null
                ? (data.revenue_growth >= 0 ? '+' : '') + fmt(data.revenue_growth) + '%'
                : '—'}
            </span>
          </div>
          <Row
            label="Net profit margin"
            value={fmt(data.profit_margins) + '%'}
            signal={data.profit_margins != null ? (data.profit_margins > 15 ? 'positive' : data.profit_margins < 5 ? 'negative' : 'neutral') : 'none'}
          />
          {data.return_on_equity != null && (
            <Row
              label="Return on Equity"
              value={fmt(data.return_on_equity) + '%'}
              signal={data.return_on_equity > 15 ? 'positive' : data.return_on_equity < 8 ? 'negative' : 'neutral'}
            />
          )}
        </div>

        {/* ── Column 3: Financial Health ── */}
        <div className="px-5 py-4 space-y-0.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70 mb-2">Financial Health</p>
          <Row
            label="Debt / Equity"
            value={fmt(data.debt_to_equity)}
            signal={data.debt_to_equity != null
              ? data.debt_to_equity > 2 ? 'negative' : data.debt_to_equity < 0.5 ? 'positive' : 'neutral'
              : 'none'}
          />
          <Row
            label="Current ratio"
            value={fmt(data.current_ratio, 2) + 'x'}
            signal={data.current_ratio != null
              ? data.current_ratio >= 2 ? 'positive' : data.current_ratio < 1 ? 'negative' : 'neutral'
              : 'none'}
            subtext="≥2x strong, <1x risky"
          />
          {data.payout_ratio != null && (
            <Row
              label="Payout ratio"
              value={fmt(data.payout_ratio) + '%'}
              signal={data.payout_ratio > 80 ? 'negative' : data.payout_ratio > 0 ? 'positive' : 'neutral'}
            />
          )}
        </div>
      </div>
    </div>
  )
}
