import { useState } from 'react'
import { useMarketStore } from '../../store/useMarketStore'
import { useAuthStore } from '../../store/useAuthStore'
import { Link, useNavigate } from 'react-router-dom'

export function Header() {
  const { lastRefresh, indicesLoading, refreshAll } = useMarketStore()
  const { isAuthenticated, username, logout } = useAuthStore()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

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
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
        {/* Brand */}
        <div className="min-w-0 flex-shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/"
              className="text-base sm:text-xl font-extrabold text-text-primary tracking-tight hover:text-accent transition-colors"
            >
              Market Lens
            </Link>
            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.14em] hidden lg:block">
              Data-first dashboard
            </p>
          </div>
          <p className="text-xs sm:text-sm text-text-muted mt-0.5 truncate hidden sm:block">{dateStr}</p>
        </div>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-2.5 sm:gap-3 flex-wrap justify-end flex-1 min-w-0">
          <div className="hidden md:block rounded-xl border border-border bg-surface px-3 py-2 shadow-panel flex-shrink-0">
            <p className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">Last updated</p>
            <p className="text-sm text-text-primary font-mono">{refreshStr}</p>
          </div>
          <div className="hidden sm:flex items-center rounded-xl border border-border bg-surface p-1 shadow-panel">
            <Link
              to="/"
              className="text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg text-text-primary hover:bg-bg transition-colors"
            >
              Dashboard
            </Link>
            <Link
              to="/screener"
              className="text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg text-text-secondary hover:bg-bg transition-colors"
            >
              Screener
            </Link>
            <Link
              to="/paper-trades"
              className="text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg text-text-secondary hover:bg-bg transition-colors"
            >
              <span className="hidden md:inline">My Trades</span>
              <span className="md:hidden">Trades</span>
            </Link>
            <Link
              to="/bot"
              className="text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg text-accent hover:bg-accent/10 transition-colors"
            >
              Bot Lab
            </Link>
          </div>
          <button
            onClick={() => refreshAll()}
            disabled={indicesLoading}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 rounded-lg bg-accent text-white text-sm font-semibold
                       hover:bg-accent/90 transition-colors shadow-panel
                       disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
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
            <span className="hidden xs:inline">Refresh</span>
          </button>
          {isAuthenticated ? (
            <div className="hidden md:flex items-center gap-2 text-xs text-text-muted flex-shrink-0">
              <span className="font-medium text-text-secondary truncate max-w-[80px]">{username}</span>
              <button
                onClick={() => { logout(); navigate('/login') }}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-surface text-text-secondary hover:text-text-primary hover:bg-bg transition-colors whitespace-nowrap"
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="hidden md:block px-3 sm:px-3.5 py-2 rounded-lg border border-accent text-accent text-sm font-semibold hover:bg-accent hover:text-white transition-colors flex-shrink-0"
            >
              Sign in
            </Link>
          )}
        </div>

        {/* Mobile right side */}
        <div className="flex sm:hidden items-center gap-2">
          <button
            onClick={() => refreshAll()}
            disabled={indicesLoading}
            className="p-2 rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
            aria-label="Refresh"
          >
            <svg
              className={`w-4 h-4 ${indicesLoading ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="p-2 rounded-lg border border-border bg-surface text-text-muted hover:text-text-primary transition-colors"
            aria-label="Menu"
          >
            {menuOpen ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu drawer */}
      {menuOpen && (
        <div className="sm:hidden border-t border-border/80 bg-bg/95 backdrop-blur px-4 py-3 space-y-1">
          {[
            { to: '/', label: 'Dashboard' },
            { to: '/screener', label: 'Screener' },
            { to: '/paper-trades', label: 'My Trades' },
            { to: '/bot', label: 'Bot Lab' },
          ].map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-text-primary hover:bg-surface hover:text-accent transition-colors"
            >
              {label}
            </Link>
          ))}
          <div className="pt-2 border-t border-border/60 flex items-center justify-between">
            <span className="text-xs text-text-muted">Updated: <span className="font-mono">{refreshStr}</span></span>
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">{username}</span>
                <button
                  onClick={() => { logout(); navigate('/login'); setMenuOpen(false) }}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-border bg-surface text-text-secondary"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                onClick={() => setMenuOpen(false)}
                className="text-xs px-3 py-1.5 rounded-lg border border-accent text-accent font-semibold"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
