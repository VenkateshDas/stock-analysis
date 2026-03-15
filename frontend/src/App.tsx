import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { RequireAuth } from './components/auth/RequireAuth'
import { Dashboard } from './pages/Dashboard'
import { IndexDetail } from './pages/IndexDetail'
import { StockDetail } from './pages/StockDetail'
import { BotLab } from './pages/BotLab'
import { Screener } from './pages/Screener'
import { PaperTrades } from './pages/PaperTrades'
import { LoginPage } from './pages/LoginPage'
import { useAuthStore } from './store/useAuthStore'

export default function App() {
  const { hydrate } = useAuthStore()

  useEffect(() => {
    hydrate()
  }, [hydrate])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/screener" element={<Screener />} />
                <Route
                  path="/bot"
                  element={
                    <RequireAuth>
                      <BotLab />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/paper-trades"
                  element={
                    <RequireAuth>
                      <PaperTrades />
                    </RequireAuth>
                  }
                />
                <Route path="/stock/:ticker" element={<StockDetail />} />
                <Route path="/:symbol" element={<IndexDetail />} />
              </Routes>
            </Layout>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
