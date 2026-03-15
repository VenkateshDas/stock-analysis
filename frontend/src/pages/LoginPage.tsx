import { useState, FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'

type Mode = 'login' | 'signup'

function extractError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
    if (detail) return detail
  }
  if (err instanceof Error) return err.message
  return fallback
}

export function LoginPage() {
  const { login, signup } = useAuthStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect') || '/'

  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setPassword('')
    setConfirmPassword('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'login') {
        await login(username, password)
      } else {
        await signup(username, password, inviteCode)
      }
      navigate(redirect, { replace: true })
    } catch (err) {
      setError(extractError(err, mode === 'login' ? 'Login failed' : 'Sign up failed'))
    } finally {
      setSubmitting(false)
    }
  }

  const isLogin = mode === 'login'

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">Market Lens</h1>
          <p className="text-sm text-text-muted mt-1">
            {isLogin ? 'Sign in to access your trading dashboard' : 'Create your account'}
          </p>
        </div>

        {/* Mode tabs */}
        <div className="flex rounded-xl border border-border bg-surface p-1 mb-4 shadow-panel">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-colors ${
              isLogin ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => switchMode('signup')}
            className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-colors ${
              !isLogin ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Create account
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface border border-border rounded-2xl p-6 shadow-panel space-y-4"
        >
          {/* Username */}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary
                         focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent
                         placeholder:text-text-muted"
              placeholder="your username"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary
                         focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent
                         placeholder:text-text-muted"
              placeholder="••••••••"
            />
          </div>

          {/* Confirm password — signup only */}
          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                Confirm password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary
                           focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent
                           placeholder:text-text-muted"
                placeholder="••••••••"
              />
            </div>
          )}

          {/* Invite code — signup only, shown always so user can fill if required */}
          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                Invite code <span className="normal-case font-normal">(if required)</span>
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                autoComplete="off"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary
                           focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent
                           placeholder:text-text-muted"
                placeholder="leave blank if not needed"
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-accent text-white text-sm font-semibold py-2.5 rounded-lg
                       hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting
              ? isLogin ? 'Signing in...' : 'Creating account...'
              : isLogin ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}
