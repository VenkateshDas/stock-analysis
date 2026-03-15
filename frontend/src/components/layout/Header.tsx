import { useMarketStore } from '../../store/useMarketStore'
import { useAuthStore } from '../../store/useAuthStore'
import { Link, useNavigate } from 'react-router-dom'

export function Header() {
  const { lastRefresh, indicesLoading, refreshAll } = useMarketStore()
  const { isAuthenticated, username, logout } = useAuthStore()
  const navigate = useNavigate()

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const refreshStr = lastRefresh
    ? lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <header className="sticky top-0 z-30 bg-bg/90 backdrop-blur border-b border-border/80">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/"
              className="text-lg sm:text-xl font-extrabold text-text-primary tracking-tight hover:text-accent transition-colors"
            >
              Market Lens
            </Link>
            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.14em] hidden sm:block">
              Data-first dashboard
            </p>
          </div>
          <p className="text-sm text-text-muted mt-0.5 truncate">{dateStr}</p>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="flex sm:hidden items-center gap-1.5">
            <Link
              to="/screener"
              className="text-xs font-semibold px-2.5 py-2 rounded-lg border border-border bg-surface text-text-secondary"
            >
              Screen
            </Link>
            <Link
              to="/paper-trades"
              className="text-xs font-semibold px-2.5 py-2 rounded-lg border border-border bg-surface text-text-secondary"
            >
              Trades
            </Link>
            <Link
              to="/bot"
              className="text-xs font-semibold px-2.5 py-2 rounded-lg border border-border bg-surface text-accent"
            >
              Bot
            </Link>
          </div>
          <div className="hidden sm:block rounded-xl border border-border bg-surface px-3 py-2 shadow-panel">
            <p className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">Last updated</p>
            <p className="text-sm text-text-primary font-mono">{refreshStr}</p>
          </div>
          <div className="hidden sm:flex items-center rounded-xl border border-border bg-surface p-1 shadow-panel">
            <Link
              to="/"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-text-primary hover:bg-bg transition-colors"
            >
              Dashboard
            </Link>
            <Link
              to="/screener"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-text-secondary hover:bg-bg transition-colors"
            >
              Screener
            </Link>
            <Link
              to="/paper-trades"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-text-secondary hover:bg-bg transition-colors"
            >
              My Trades
            </Link>
            <Link
              to="/bot"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-accent hover:bg-accent/10 transition-colors"
            >
              Bot Lab
            </Link>
          </div>
          <button
            onClick={() => refreshAll()}
            disabled={indicesLoading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-accent text-white text-sm font-semibold
                       hover:bg-accent/90 transition-colors shadow-panel
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              className={`w-4 h-4 ${indicesLoading ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </button>
          {isAuthenticated && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-text-muted">
              <span className="font-medium text-text-secondary">{username}</span>
              <button
                onClick={() => { logout(); navigate('/login') }}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-surface text-text-secondary hover:text-text-primary hover:bg-bg transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
