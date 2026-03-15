import { Header } from './Header'

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <Header />
      <main className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
      <footer className="border-t border-border/90 mt-12 py-5 text-center text-xs text-text-muted">
        Data via Yahoo Finance · Analysis powered by pandas-ta · LLM via OpenRouter
      </footer>
    </div>
  )
}
