import { useNavigate } from 'react-router-dom'
import type { IndexSnapshot } from '../../types/market'
import { SparklineChart } from '../charts/SparklineChart'
import { useMarketStore } from '../../store/useMarketStore'

interface IndexCardProps {
  index: IndexSnapshot
}

const REGION_MAP: Record<string, string> = {
  N225: 'Japan',
  HSI: 'Hong Kong',
  KS11: 'South Korea',
  AXJO: 'Australia',
  NSEI: 'India',
  CNX100: 'India',
  CNX200: 'India',
  NSEBANK: 'India',
  FTSE: 'United Kingdom',
  GDAXI: 'Germany',
  FCHI: 'France',
  GSPC: 'United States',
  DJI: 'United States',
  NDX: 'United States',
}

function formatPrice(price: number, currency: string): string {
  const locale = currency === 'JPY' ? 'ja-JP' : 'en-US'
  return price.toLocaleString(locale, {
    minimumFractionDigits: currency === 'JPY' ? 0 : 2,
    maximumFractionDigits: currency === 'JPY' ? 0 : 2,
  })
}

function formatVolume(vol: number): string {
  if (vol >= 1e9) return `${(vol / 1e9).toFixed(2)}B`
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(2)}M`
  return vol.toLocaleString()
}

function sentimentTone(sentiment: string | undefined) {
  if (sentiment === 'bullish') return 'text-up bg-up/10 border-up/25'
  if (sentiment === 'bearish') return 'text-down bg-down/10 border-down/25'
  return 'text-neutral bg-neutral/10 border-neutral/25'
}

function momentumLabel(rsiSignal: string) {
  if (rsiSignal === 'overbought') return 'High buying pressure'
  if (rsiSignal === 'oversold') return 'High selling pressure'
  return 'Balanced'
}

export function IndexCard({ index }: IndexCardProps) {
  const navigate = useNavigate()
  const { analysis } = useMarketStore()
  const analysisData = analysis[index.symbol]
  const rsiSignal = analysisData?.technical?.rsi_signal ?? 'neutral'
  const sentiment = analysisData?.overall_sentiment
  const isPositive = index.change_pct >= 0
  const moveTone = isPositive ? 'text-up' : 'text-down'
  const region = REGION_MAP[index.symbol]

  return (
    <article
      onClick={() => navigate(`/${index.symbol}`)}
      className="rounded-2xl border border-border bg-surface p-4 shadow-panel cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-text-muted">{index.symbol}</p>
          <h3 className="text-sm font-bold text-text-primary mt-1 leading-tight">{index.name}</h3>
          {region && <p className="text-xs text-text-muted mt-1">{region}</p>}
        </div>
        <span className="text-[11px] px-2 py-1 rounded-lg bg-bg border border-border text-text-muted font-mono">
          {index.currency}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2 items-end">
        <p className="text-2xl font-extrabold text-text-primary font-mono">
          {formatPrice(index.last_close, index.currency)}
        </p>
        <p className={`text-sm font-bold font-mono ${moveTone}`}>
          {isPositive ? '+' : ''}
          {index.change_pct.toFixed(2)}%
        </p>
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <p className={`text-xs font-semibold font-mono ${moveTone}`}>
          {isPositive ? '+' : ''}
          {index.change_pts.toLocaleString(undefined, { maximumFractionDigits: 2 })} pts
        </p>
        <p className="text-xs text-text-muted">{index.trade_date}</p>
      </div>

      <div className="mt-3 rounded-xl border border-border/90 bg-bg/70 p-2">
        <SparklineChart closes={index.spark_closes} positive={isPositive} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-border bg-bg/60 p-2">
          <p className="text-text-muted">Volume</p>
          <p className="mt-0.5 font-semibold text-text-primary font-mono">{formatVolume(index.volume)}</p>
        </div>
        <div className="rounded-lg border border-border bg-bg/60 p-2">
          <p className="text-text-muted">Previous close</p>
          <p className="mt-0.5 font-semibold text-text-primary font-mono">
            {formatPrice(index.prev_close, index.currency)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-text-muted">{momentumLabel(rsiSignal)}</span>
        <span className={`text-[11px] capitalize font-semibold px-2.5 py-1 rounded-full border ${sentimentTone(sentiment)}`}>
          {sentiment ?? 'neutral'}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-[11px] text-text-muted">Tap for full analysis</p>
        {index.tradingview_url && (
          <a
            href={index.tradingview_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] font-semibold text-accent hover:text-accent/80"
          >
            TradingView
          </a>
        )}
      </div>
    </article>
  )
}
