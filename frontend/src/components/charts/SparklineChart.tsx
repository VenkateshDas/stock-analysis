interface SparklineChartProps {
  closes: number[]
  positive: boolean
  width?: number
  height?: number
}

export function SparklineChart({ closes, positive, width = 120, height = 40 }: SparklineChartProps) {
  if (!closes || closes.length < 2) {
    return <div style={{ width, height }} className="bg-surface rounded" />
  }

  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const range = max - min || 1

  const pts = closes.map((v, i) => {
    const x = (i / (closes.length - 1)) * width
    const y = height - ((v - min) / range) * height * 0.85 - height * 0.075
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const polyline = pts.join(' ')
  const color = positive ? '#26B856' : '#EF5350'
  const fillColor = positive ? '#26B85620' : '#EF535020'

  // Close the area for fill
  const fillPts = `0,${height} ${polyline} ${width},${height}`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polygon points={fillPts} fill={fillColor} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
