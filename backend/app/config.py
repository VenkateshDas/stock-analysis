from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Dict, List
from pathlib import Path

# Load .env from project root (two levels up from backend/app/)
_env_path = Path(__file__).parent.parent.parent / ".env"


class IndexConfig:
    def __init__(self, symbol: str, name: str, ticker: str, timezone: str, currency: str, note: str = "", tradingview_symbol: str = ""):
        self.symbol = symbol
        self.name = name
        self.ticker = ticker
        self.timezone = timezone
        self.currency = currency
        self.note = note
        self.tradingview_symbol = tradingview_symbol
    
    @property
    def tradingview_url(self) -> str:
        """Returns the TradingView chart URL for this index."""
        if self.tradingview_symbol:
            return f"https://www.tradingview.com/chart/?symbol={self.tradingview_symbol}"
        return ""


# Ordered by geographic session: Asia → Europe → Americas
# Cards are sorted by daily change % on the frontend.
# TradingView symbols use exchange:SYMBOL format (e.g., NSE:NIFTY50, TVC:SPX)
INDICES: Dict[str, IndexConfig] = {
    # ── Asia-Pacific ──────────────────────────────────────────────────
    "N225": IndexConfig(
        symbol="N225",
        name="Nikkei 225",
        ticker="^N225",
        timezone="Asia/Tokyo",
        currency="JPY",
        note="Japan's benchmark index — covers the Tokyo Stock Exchange's top 225 companies. "
             "Bellwether for Asian market sentiment.",
        tradingview_symbol="TVC:NI225",
    ),
    "HSI": IndexConfig(
        symbol="HSI",
        name="Hang Seng Index",
        ticker="^HSI",
        timezone="Asia/Hong_Kong",
        currency="HKD",
        note="Hong Kong's benchmark index — major gateway for China-related equity flows "
             "and a key barometer for Greater China economic sentiment.",
        tradingview_symbol="TVC:HSI",
    ),
    "KS11": IndexConfig(
        symbol="KS11",
        name="KOSPI",
        ticker="^KS11",
        timezone="Asia/Seoul",
        currency="KRW",
        note="South Korea's benchmark index. Heavily weighted in semiconductors "
             "(Samsung Electronics, SK Hynix) — a key proxy for global AI/chip demand.",
        tradingview_symbol="KRX:KOSPI",
    ),
    "AXJO": IndexConfig(
        symbol="AXJO",
        name="S&P/ASX 200",
        ticker="^AXJO",
        timezone="Australia/Sydney",
        currency="AUD",
        note="Australia's top 200 companies. Dominated by mining (BHP, Rio Tinto) and banks — "
             "widely used as a commodity demand proxy, especially for Chinese iron ore appetite.",
        tradingview_symbol="ASX:XJO",
    ),
    "NSEI": IndexConfig(
        symbol="NSEI",
        name="Nifty 50",
        ticker="^NSEI",
        timezone="Asia/Kolkata",
        currency="INR",
        note="India's NSE Nifty 50 — benchmark for the world's fastest-growing major economy. "
             "Tracks the 50 largest and most liquid companies listed on the National Stock Exchange.",
        tradingview_symbol="NSE:NIFTY50",
    ),
    "CNX100": IndexConfig(
        symbol="CNX100",
        name="Nifty 100",
        ticker="^CNX100",
        timezone="Asia/Kolkata",
        currency="INR",
        note="Nifty 100 = Nifty 50 + Nifty Next 50. Covers the top 100 companies by market cap on NSE, "
             "giving exposure to both large-cap leaders and the 'next 50' emerging blue-chips (ranks 51–100). "
             "Yahoo Finance does not offer a direct Nifty Next 50 ticker; this is the closest available proxy.",
        tradingview_symbol="NSE:CNX100",
    ),
    "CNX200": IndexConfig(
        symbol="CNX200",
        name="Nifty 200",
        ticker="^CNX200",
        timezone="Asia/Kolkata",
        currency="INR",
        note="Nifty 200 covers the top 200 companies by market cap on NSE, "
             "giving broader exposure than Nifty 50 or Nifty 100, including mid-cap stocks.",
        tradingview_symbol="NSE:CNX200",
    ),
    "CNX500": IndexConfig(
        symbol="CNX500",
        name="Nifty 500",
        ticker="^CRSLDX",
        timezone="Asia/Kolkata",
        currency="INR",
        note="India's broadest benchmark — covers the top 500 companies by market cap on NSE, "
             "representing ~92% of total NSE free-float market cap. The primary universe for swing trade screening.",
        tradingview_symbol="NSE:CNX500",
    ),
    "NSEBANK": IndexConfig(
        symbol="NSEBANK",
        name="Nifty Bank",
        ticker="^NSEBANK",
        timezone="Asia/Kolkata",
        currency="INR",
        note="India's banking sector benchmark — tracks the 12 most liquid bank stocks on NSE. "
             "Heavily influences the broader Nifty 50 and is the most actively traded index derivative in India.",
        tradingview_symbol="NSE:BANKNIFTY",
    ),
    # ── Europe ────────────────────────────────────────────────────────
    "FTSE": IndexConfig(
        symbol="FTSE",
        name="FTSE 100",
        ticker="^FTSE",
        timezone="Europe/London",
        currency="GBP",
        note="UK's top 100 companies. ~80% of revenues come from overseas, making it one of "
             "the most internationally diversified indices in the world. First major Western market to open.",
        tradingview_symbol="TVC:UKX",
    ),
    "GDAXI": IndexConfig(
        symbol="GDAXI",
        name="DAX 40",
        ticker="^GDAXI",
        timezone="Europe/Berlin",
        currency="EUR",
        note="Germany's top 40 companies — anchor benchmark for Europe's largest economy. "
             "Heavy in industrials, chemicals, and autos: a global trade and manufacturing bellwether.",
        tradingview_symbol="TVC:DAX",
    ),
    "FCHI": IndexConfig(
        symbol="FCHI",
        name="CAC 40",
        ticker="^FCHI",
        timezone="Europe/Paris",
        currency="EUR",
        note="France's top 40 companies — home to the world's largest luxury goods conglomerates "
             "(LVMH, Hermès, Kering, L'Oréal). Unique exposure to global high-end consumer spending.",
        tradingview_symbol="TVC:CAC40",
    ),
    # ── Americas ──────────────────────────────────────────────────────
    "GSPC": IndexConfig(
        symbol="GSPC",
        name="S&P 500",
        ticker="^GSPC",
        timezone="America/New_York",
        currency="USD",
        note="The world's most important equity benchmark — 500 leading US companies covering "
             "~80% of US market cap. Underpins the world's three largest ETFs (SPY, IVV, VOO).",
        tradingview_symbol="TVC:SPX",
    ),
    "DJI": IndexConfig(
        symbol="DJI",
        name="Dow Jones Industrial Average",
        ticker="^DJI",
        timezone="America/New_York",
        currency="USD",
        note="30 large-cap US blue-chip companies. The oldest and most widely quoted US index "
             "in global media — a headline indicator of US economic health.",
        tradingview_symbol="TVC:DJI",
    ),
    "NDX": IndexConfig(
        symbol="NDX",
        name="Nasdaq 100",
        ticker="^NDX",
        timezone="America/New_York",
        currency="USD",
        note="Top 100 non-financial Nasdaq companies — dominated by mega-cap tech (Apple, "
             "Microsoft, Nvidia, Meta, Amazon, Google). The global benchmark for tech/growth equities.",
        tradingview_symbol="NASDAQ:NDX",
    ),
}


# Sector ETF configurations for global sector performance tracking
# Each region has sector ETFs that track specific market sectors
SECTOR_ETFS: Dict[str, Dict[str, str]] = {
    # Americas – US SPDR Sector ETFs
    "americas": {
        "Technology": "XLK",
        "Energy": "XLE",
        "Healthcare": "XLV",
        "Financials": "XLF",
        "Consumer Discretionary": "XLY",
        "Consumer Staples": "XLP",
        "Industrials": "XLI",
        "Materials": "XLB",
        "Real Estate": "XLRE",
        "Utilities": "XLU",
        "Communication Services": "XLC",
    },
    # Asia-Pacific – iShares MSCI sub-region / country ETFs
    # (one unique key per sector to avoid Python dict silently dropping duplicates)
    "asia-pacific": {
        "Technology": "SOXX",          # Semiconductor / tech proxy
        "Energy": "IXC",               # Global energy
        "Financials": "EUFN",          # Global financials proxy
        "Consumer Discretionary": "EMXC",  # EM ex-China consumer proxy
        "Healthcare": "IXJ",           # Global healthcare
        "Materials": "MXI",            # Global materials
        "Industrials": "EXI",          # Global industrials
    },
    # Europe – iShares STOXX sector ETFs (Xetra-listed)
    "europe": {
        "Technology": "EXS2.DE",
        "Financials": "EXF1.DE",
        "Healthcare": "EXH1.DE",
        "Industrials": "EXI1.DE",
        "Energy": "IQQE.L",
        "Consumer Discretionary": "IQQD.L",
    },
}


# Index proxy ETFs - Use these ETFs to get sector weightings for each index
INDEX_PROXY_ETFS: Dict[str, str] = {
    # Americas
    "GSPC": "SPY",       # S&P 500
    "NDX": "QQQ",       # Nasdaq 100
    "DJI": "DIA",       # Dow Jones
    # Europe
    "FTSE": "ISF.L",    # FTSE 100
    "GDAXI": "EXS1.DE", # DAX 40
    "FCHI": "MC.PA",    # CAC 40
    # Asia-Pacific
    "N225": "1320.T",   # Nikkei 225
    "HSI": "2800.HK",   # Hang Seng
    "KS11": "069500.KS", # KOSPI
    "AXJO": "IAA.AX",   # ASX 200
    "NSEI": "NIFTYBEES.NS",  # Nifty 50
    "CNX100": "N100BEES.NS", # Nifty 100
    "CNX200": "N200.NS",      # Nifty 200 (Mirae Asset Nifty 200 ETF, fallback if NSE API fails)
    "CNX500": "SETFNIF50.NS", # Nifty 500 proxy (SBI ETF Nifty 50, closest available liquid ETF)
    "NSEBANK": "BANKBEES.NS", # Nifty Bank
}


# Map indices to their regional classification for sector analysis
INDEX_REGION_MAP: Dict[str, str] = {
    # Asia-Pacific
    "N225": "asia-pacific",
    "HSI": "asia-pacific",
    "KS11": "asia-pacific",
    "AXJO": "asia-pacific",
    "NSEI": "asia-pacific",
    "CNX100": "asia-pacific",
    "CNX200": "asia-pacific",
    "CNX500": "asia-pacific",
    "NSEBANK": "asia-pacific",
    # Europe
    "FTSE": "europe",
    "GDAXI": "europe",
    "FCHI": "europe",
    # Americas
    "GSPC": "americas",
    "DJI": "americas",
    "NDX": "americas",
}


# Valid regions for sector analysis
VALID_REGIONS: List[str] = ["americas", "asia-pacific", "europe"]


# ETF proxies for valuation (PE, P/B, yield) — tested and confirmed to return reliable data.
# India ETFs return unreliable PE (~10x vs actual ~20x); use constituent-weighted for those.
VALUATION_ETF_PROXY: Dict[str, str] = {
    "GSPC": "SPY",
    "NDX": "QQQ",
    "DJI": "DIA",
    "FTSE": "ISF.L",
    "GDAXI": "EXS1.DE",
    "FCHI": "EXS1.DE",   # Euro STOXX proxy (closest reliable ETF)
    "N225": "1306.T",
    "HSI": "EWH",
    "KS11": "EWY",
    "AXJO": "STW.AX",
}
# India indices → constituent-weighted PE (ETF PE is ~10x, actual PE is ~20x)
INDIA_SYMBOLS = {"NSEI", "CNX100", "CNX200", "CNX500", "NSEBANK"}


# Top Nifty 50 constituents with approximate free-float weights (as of Mar 2025).
# Used for constituent-weighted PE when ETF proxy is unreliable.
NIFTY50_CONSTITUENTS: List[Dict] = [
    {"ticker": "RELIANCE.NS",    "weight": 0.082},
    {"ticker": "HDFCBANK.NS",    "weight": 0.075},
    {"ticker": "ICICIBANK.NS",   "weight": 0.071},
    {"ticker": "INFY.NS",        "weight": 0.062},
    {"ticker": "TCS.NS",         "weight": 0.058},
    {"ticker": "HINDUNILVR.NS",  "weight": 0.038},
    {"ticker": "BAJFINANCE.NS",  "weight": 0.034},
    {"ticker": "SBIN.NS",        "weight": 0.033},
    {"ticker": "AXISBANK.NS",    "weight": 0.026},
    {"ticker": "KOTAKBANK.NS",   "weight": 0.025},
    {"ticker": "BHARTIARTL.NS",  "weight": 0.024},
    {"ticker": "WIPRO.NS",       "weight": 0.018},
]

NSEBANK_CONSTITUENTS: List[Dict] = [
    {"ticker": "HDFCBANK.NS",    "weight": 0.280},
    {"ticker": "ICICIBANK.NS",   "weight": 0.265},
    {"ticker": "SBIN.NS",        "weight": 0.124},
    {"ticker": "AXISBANK.NS",    "weight": 0.097},
    {"ticker": "KOTAKBANK.NS",   "weight": 0.093},
    {"ticker": "INDUSINDBK.NS",  "weight": 0.066},
    {"ticker": "BANDHANBNK.NS",  "weight": 0.025},
    {"ticker": "FEDERALBNK.NS",  "weight": 0.020},
]

# Long-term average trailing PE per index (used to determine cheap/fair/stretched/expensive)
HISTORICAL_PE_AVG: Dict[str, float] = {
    "GSPC": 18.0,
    "NDX": 26.0,
    "DJI": 17.0,
    "FTSE": 14.0,
    "GDAXI": 15.0,
    "FCHI": 15.0,
    "N225": 17.0,
    "HSI": 12.0,
    "KS11": 12.0,
    "AXJO": 17.0,
    "NSEI": 20.0,
    "CNX100": 21.0,
    "CNX200": 21.0,
    "CNX500": 22.0,
    "NSEBANK": 18.0,
}


class Settings(BaseSettings):
    openrouter_api_key: str = Field(default="", alias="OPENROUTER_API_KEY")
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = "minimax/minimax-m2.5"

    cache_ttl_seconds: int = Field(default=3600, alias="CACHE_TTL_SECONDS")
    backend_port: int = Field(default=8000, alias="BACKEND_PORT")
    frontend_url: str = Field(default="http://localhost:5173", alias="FRONTEND_URL")

    history_days: int = 90
    analysis_lookback_days: int = 252   # ~1 trading year for indicators
    trend_lookback_days: int = 1260     # ~5 trading years for yearly trend (Theil-Sen + Hurst)

    model_config = {"env_file": str(_env_path), "populate_by_name": True}


settings = Settings()
