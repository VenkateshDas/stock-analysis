const INDEX_SYMBOL_MAP: Record<string, string> = {
  NSEI: 'NSE:NIFTY50',
  CNX100: 'NSE:CNX100',
  CNX200: 'NSE:CNX200',
  NSEBANK: 'NSE:BANKNIFTY',
  GSPC: 'SP:SPX',
  DJI: 'DJ:DJI',
  NDX: 'NASDAQ:NDX',
}

export function extractTradingViewSymbolFromUrl(url?: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const symbol = parsed.searchParams.get('symbol')
    return symbol ? decodeURIComponent(symbol) : null
  } catch {
    return null
  }
}

export function toTradingViewSymbol(raw: string): string {
  const symbol = raw.trim().toUpperCase()
  if (!symbol) return symbol
  if (symbol.includes(':')) return symbol
  if (INDEX_SYMBOL_MAP[symbol]) return INDEX_SYMBOL_MAP[symbol]

  if (symbol.endsWith('.NS')) return `NSE:${symbol.replace('.NS', '')}`
  if (symbol.endsWith('.BO')) return `BSE:${symbol.replace('.BO', '')}`
  if (symbol.endsWith('.T')) return `TSE:${symbol.replace('.T', '')}`
  if (symbol.endsWith('.HK')) return `HKEX:${symbol.replace('.HK', '')}`
  if (symbol.startsWith('^')) return symbol.slice(1)

  return symbol
}

export function resolveTradingViewSymbol(input: {
  symbol: string
  tradingviewUrl?: string | null
}): string {
  const fromUrl = extractTradingViewSymbolFromUrl(input.tradingviewUrl)
  if (fromUrl) return fromUrl
  return toTradingViewSymbol(input.symbol)
}
