import type { LLMSummary } from '../../types/market'

interface LLMSummaryPanelProps {
  summary: LLMSummary | null
  loading: boolean
  onFetch?: () => void
}

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-4 bg-border rounded w-full" />
      <div className="h-4 bg-border rounded w-5/6" />
      <div className="h-4 bg-border rounded w-full" />
      <div className="h-4 bg-border rounded w-4/6" />
      <div className="h-4 bg-border rounded w-full" />
      <div className="h-4 bg-border rounded w-3/6" />
    </div>
  )
}

/**
 * Splits the LLM commentary on bullet lines starting with '•' and renders
 * each as its own paragraph so the structured output is readable.
 */
function CommentaryBody({ text }: { text: string }) {
  // Split on lines that start with the bullet character (after optional whitespace)
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  const bullets: string[] = []
  let current = ''

  for (const line of lines) {
    if (line.startsWith('•')) {
      if (current) bullets.push(current)
      current = line
    } else {
      // continuation of the current bullet (wrapped lines)
      current = current ? `${current} ${line}` : line
    }
  }
  if (current) bullets.push(current)

  // If the LLM returned bullet-formatted text, render each as a block
  if (bullets.length > 1) {
    return (
      <ul className="space-y-3">
        {bullets.map((bullet, i) => {
          // Split "• TOPIC: body" into topic and body for styling
          const withoutBullet = bullet.replace(/^•\s*/, '')
          const colonIdx = withoutBullet.indexOf(':')
          const hasTopic = colonIdx > 0 && colonIdx < 30
          const topic = hasTopic ? withoutBullet.slice(0, colonIdx) : null
          const body = hasTopic ? withoutBullet.slice(colonIdx + 1).trim() : withoutBullet

          return (
            <li key={i} className="flex gap-2 text-sm leading-relaxed">
              <span className="text-accent mt-0.5 flex-shrink-0">•</span>
              <span className="text-text-primary">
                {topic && (
                  <span className="font-semibold text-text-primary">{topic}:{' '}</span>
                )}
                {body}
              </span>
            </li>
          )
        })}
      </ul>
    )
  }

  // Fallback: plain paragraph (old 3-sentence format or unexpected output)
  return <p className="text-sm text-text-primary leading-relaxed">{text}</p>
}

export function LLMSummaryPanel({ summary, loading, onFetch }: LLMSummaryPanelProps) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Plain-English Summary</h3>
            <p className="text-xs text-text-muted">AI explains what the data means — no jargon</p>
          </div>
        </div>

        {!summary && !loading && onFetch && (
          <button
            onClick={onFetch}
            className="text-xs font-medium text-white bg-accent hover:bg-accent/80 px-3 py-1.5
                       rounded-lg transition-colors flex-shrink-0"
          >
            Explain this →
          </button>
        )}
      </div>

      {loading && (
        <div>
          <Skeleton />
          <p className="text-xs text-text-muted mt-3 italic">Analysing all indicators and trends…</p>
        </div>
      )}

      {!loading && !summary && (
        <p className="text-sm text-text-muted italic">
          Click "Explain this" to get a beginner-friendly breakdown of today's market data, indicators, and trend analysis.
        </p>
      )}

      {!loading && summary && (
        <div>
          <CommentaryBody text={summary.commentary} />
          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-text-muted">
              Powered by <span className="text-accent">{summary.model_used}</span>
            </p>
            <p className="text-xs text-text-muted font-mono">{summary.generated_at}</p>
          </div>
        </div>
      )}
    </div>
  )
}
