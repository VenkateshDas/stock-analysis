import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { Dashboard } from './pages/Dashboard'
import { IndexDetail } from './pages/IndexDetail'
import { StockDetail } from './pages/StockDetail'
import { BotLab } from './pages/BotLab'
import { Screener } from './pages/Screener'
import { PaperTrades } from './pages/PaperTrades'

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/bot" element={<BotLab />} />
          <Route path="/screener" element={<Screener />} />
          <Route path="/paper-trades" element={<PaperTrades />} />
          <Route path="/stock/:ticker" element={<StockDetail />} />
          <Route path="/:symbol" element={<IndexDetail />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
