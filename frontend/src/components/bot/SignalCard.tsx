import { useState } from 'react'
import type { OrderIntent, SignalEvent } from '../../types/bot'
import { api } from '../../services/api'

interface Props {
  signal: SignalEvent
  intent: OrderIntent | null
  onUpdated: () => void
}

export function SignalCard({ signal, intent, onUpdated }: Props) {
  const [loading, setLoading] = useState(false)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [error, setError] = useState('')

  const isBuy = signal.signal_type === 'BUY'
  const isSell = signal.signal_type === 'SELL'
  const isNone = signal.signal_type === 'NONE'

  const confidencePct = Math.round(signal.confidence * 100)

  let signalColor = 'border-border text-text-muted'
  let signalBg = 'bg-surface'
  let signalLabel = 'No Signal'
  if (isBuy) {
    signalColor = 'border-green-500/40 text-green-400'
    signalBg = 'bg-green-500/5'
    signalLabel = 'BUY'
  } else if (isSell) {
    signalColor = 'border-red-500/40 text-red-400'
    signalBg = 'bg-red-500/5'
    signalLabel = 'SELL'
  }

  const intentStatus = intent?.status

  const handleApprove = async () => {
    if (!intent) return
    setLoading(true)
    setError('')
    try {
      await api.approveOrder(intent.intent_id, true)
      await api.executeOrder(intent.intent_id)
      setShowApproveModal(false)
      onUpdated()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to approve and execute order.')
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    if (!intent) return
    setLoading(true)
    setError('')
    try {
      await api.approveOrder(intent.intent_id, false)
      onUpdated()
    } catch (e: any) {
      setError('Failed to reject order.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className={`rounded-xl border p-4 space-y-3 ${signalColor} ${signalBg}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {!isNone && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${signalColor} uppercase`}>
                {signalLabel}
              </span>
            )}
            <span className="text-sm font-semibold text-text-primary">{signal.symbol}</span>
            {signal.price > 0 && (
              <span className="text-xs text-text-muted font-mono">
                ₹{signal.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            )}
          </div>
          {!isNone && (
            <div className="text-right">
              <p className="text-[10px] text-text-muted">Confidence</p>
              <p className="text-sm font-bold text-text-primary">{confidencePct}%</p>
            </div>
          )}
        </div>

        <p className="text-xs text-text-muted leading-relaxed">{signal.reason}</p>

        <div className="flex items-center gap-2 text-[10px] text-text-muted">
          <span>{new Date(signal.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
          {intent && (
            <span className="ml-auto px-2 py-0.5 rounded-full border border-border capitalize">
              {intentStatus?.replace('_', ' ').toLowerCase()}
            </span>
          )}
        </div>

        {intent && intentStatus === 'PENDING_APPROVAL' && !isNone && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setShowApproveModal(true)}
              disabled={loading}
              className="flex-1 py-2 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-500 disabled:opacity-60 transition-colors"
            >
              Approve & Execute
            </button>
            <button
              onClick={handleReject}
              disabled={loading}
              className="flex-1 py-2 text-xs font-medium rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-60 transition-colors"
            >
              Reject
            </button>
          </div>
        )}

        {intentStatus === 'APPROVED' && (
          <p className="text-xs text-green-400 bg-green-500/10 rounded-lg px-3 py-1.5">
            Order approved and submitted.
          </p>
        )}
        {intentStatus === 'REJECTED' && (
          <p className="text-xs text-text-muted bg-surface rounded-lg px-3 py-1.5">
            Signal rejected.
          </p>
        )}
        {intentStatus === 'EXECUTED' && (
          <p className="text-xs text-blue-400 bg-blue-500/10 rounded-lg px-3 py-1.5">
            Order executed successfully.
          </p>
        )}

        {error && (
          <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>

      {showApproveModal && intent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface border border-border rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-semibold text-text-primary">Confirm Order</h3>
            <div className="rounded-lg bg-bg border border-border p-4 space-y-2 text-sm">
              <Row label="What" value={`${intent.side} ${intent.symbol}`} />
              <Row label="Quantity" value={`${intent.quantity} unit(s)`} />
              <Row label="Order type" value={intent.order_type} />
              <Row label="Mode" value={intentStatus?.includes('PAPER') ? 'Paper (simulated)' : 'Live'} />
              {signal.price > 0 && (
                <Row
                  label="Approx. price"
                  value={`₹${signal.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
                />
              )}
            </div>
            <p className="text-xs text-text-muted">
              Once approved, this order will be sent immediately. Double-check before confirming.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleApprove}
                disabled={loading}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-green-600 text-white hover:bg-green-500 disabled:opacity-60 transition-colors"
              >
                {loading ? 'Submitting...' : 'Confirm & Submit'}
              </button>
              <button
                onClick={() => setShowApproveModal(false)}
                disabled={loading}
                className="flex-1 py-2.5 text-sm rounded-xl border border-border text-text-muted hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
            </div>
            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-text-muted">{label}</span>
      <span className="font-medium text-text-primary">{value}</span>
    </div>
  )
}
