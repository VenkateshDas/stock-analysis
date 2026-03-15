interface Props {
  usedPct: number
  label?: string
}

export function RiskGauge({ usedPct, label = 'Daily risk used' }: Props) {
  const clamped = Math.min(Math.max(usedPct, 0), 100)

  let color = 'bg-green-500'
  let textColor = 'text-green-400'
  if (clamped >= 75) {
    color = 'bg-red-500'
    textColor = 'text-red-400'
  } else if (clamped >= 40) {
    color = 'bg-yellow-500'
    textColor = 'text-yellow-400'
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-muted">{label}</span>
        <span className={`font-semibold ${textColor}`}>{clamped.toFixed(1)}%</span>
      </div>
      <div className="w-full h-2 bg-bg rounded-full overflow-hidden border border-border">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-text-muted">
        <span>Safe</span>
        <span>Caution</span>
        <span>Stop</span>
      </div>
    </div>
  )
}
