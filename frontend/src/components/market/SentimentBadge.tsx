interface SentimentBadgeProps {
  signal: 'overbought' | 'oversold' | 'neutral' | string
  rsi?: number | null
}

const LABELS: Record<string, string> = {
  overbought: 'High buying pressure',
  oversold: 'High selling pressure',
  neutral: 'Normal momentum',
}

const COLORS: Record<string, string> = {
  overbought: 'text-down bg-down/10 border-down/30',
  oversold: 'text-up bg-up/10 border-up/30',
  neutral: 'text-neutral bg-neutral/10 border-neutral/30',
}

export function SentimentBadge({ signal, rsi }: SentimentBadgeProps) {
  const label = LABELS[signal] ?? signal
  const color = COLORS[signal] ?? COLORS.neutral

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      {rsi != null && <span className="font-mono opacity-70">RSI {rsi.toFixed(0)}</span>}
      <span>{label}</span>
    </span>
  )
}
