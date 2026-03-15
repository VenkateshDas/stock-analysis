import { useState } from 'react'
import type { KiteStatus } from '../../types/bot'
import { api } from '../../services/api'

interface Props {
  kiteStatus: KiteStatus | null
  onStatusChange: () => void
}

export function ConnectionCard({ kiteStatus, onStatusChange }: Props) {
  const [showCredForm, setShowCredForm] = useState(false)
  const [showTokenForm, setShowTokenForm] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [requestToken, setRequestToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSaveCredentials = async () => {
    if (!apiKey.trim() || !apiSecret.trim()) return
    setLoading(true)
    setError('')
    try {
      await api.saveKiteCredentials(apiKey.trim(), apiSecret.trim())
      setApiKey('')
      setApiSecret('')
      setShowCredForm(false)
      onStatusChange()
    } catch {
      setError('Failed to save credentials. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleConnectClick = async () => {
    setLoading(true)
    setError('')
    try {
      const { login_url } = await api.getKiteLoginUrl()
      window.open(login_url, '_blank', 'noopener,noreferrer')
      setShowTokenForm(true)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Please save your API credentials first.')
    } finally {
      setLoading(false)
    }
  }

  const handleCompleteLogin = async () => {
    if (!requestToken.trim()) return
    setLoading(true)
    setError('')
    try {
      await api.kiteCallback('', '', requestToken.trim())
      setRequestToken('')
      setShowTokenForm(false)
      onStatusChange()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Login failed. Check the request token and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    setLoading(true)
    try {
      await api.kiteDisconnect()
      onStatusChange()
    } finally {
      setLoading(false)
    }
  }

  const isConnected = kiteStatus?.connected
  const hasCreds = kiteStatus?.has_credentials

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Step 1 — Connect Your Broker</h3>
          <p className="text-xs text-text-muted mt-0.5">
            Connect Zerodha to place real orders. Without it, everything runs in Paper Mode (no real money).
          </p>
        </div>
        {isConnected ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Live — {kiteStatus.profile_name || 'Connected'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
            Paper Mode
          </span>
        )}
      </div>

      {isConnected && (
        <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-300 space-y-1">
          <p className="font-medium">Connected as {kiteStatus.profile_name}</p>
          {kiteStatus.available_margin != null && (
            <p className="text-xs text-green-400/80">
              Available margin: ₹{kiteStatus.available_margin.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
          )}
          <button
            onClick={handleDisconnect}
            disabled={loading}
            className="mt-2 text-xs underline text-green-400/70 hover:text-green-400 transition-colors"
          >
            Disconnect
          </button>
        </div>
      )}

      {!isConnected && (
        <div className="rounded-lg bg-surface border border-border px-4 py-3 space-y-3">
          <p className="text-xs text-text-muted">
            <strong className="text-text-primary">Paper Mode is active.</strong> All trades are simulated — no real money is used.
            Connect Zerodha to unlock live trading.
          </p>

          {!hasCreds && !showCredForm && (
            <button
              onClick={() => setShowCredForm(true)}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-accent/40 text-accent hover:bg-accent/10 transition-colors"
            >
              Enter API Credentials
            </button>
          )}

          {hasCreds && !showCredForm && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-text-muted">
                API Key: <span className="font-mono text-text-primary">{kiteStatus?.masked_api_key}</span>
              </span>
              <button
                onClick={handleConnectClick}
                disabled={loading}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent/80 transition-colors disabled:opacity-60"
              >
                {loading ? 'Opening...' : 'Connect Zerodha Account'}
              </button>
              <button
                onClick={() => setShowCredForm(true)}
                className="text-xs text-text-muted hover:text-text-primary underline"
              >
                Update credentials
              </button>
            </div>
          )}

          {showCredForm && (
            <div className="space-y-2">
              <p className="text-xs text-text-muted">
                Get your API key from <span className="text-accent">developers.kite.trade</span>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="API Key"
                  className="bg-bg border border-border rounded-lg px-3 py-2 text-sm font-mono"
                />
                <input
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="API Secret"
                  type="password"
                  className="bg-bg border border-border rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveCredentials}
                  disabled={loading || !apiKey || !apiSecret}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-60 transition-colors"
                >
                  {loading ? 'Saving...' : 'Save Credentials'}
                </button>
                <button
                  onClick={() => { setShowCredForm(false); setError('') }}
                  className="px-4 py-2 text-xs text-text-muted hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {showTokenForm && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs text-text-muted">
                After logging in on Zerodha, you'll be redirected to a URL containing
                <span className="font-mono text-text-primary"> ?request_token=XXXX</span>.
                Paste that token below.
              </p>
              <div className="flex gap-2">
                <input
                  value={requestToken}
                  onChange={(e) => setRequestToken(e.target.value)}
                  placeholder="Paste request_token here"
                  className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm font-mono"
                />
                <button
                  onClick={handleCompleteLogin}
                  disabled={loading || !requestToken}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-500 disabled:opacity-60 transition-colors"
                >
                  {loading ? 'Connecting...' : 'Complete Login'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  )
}
