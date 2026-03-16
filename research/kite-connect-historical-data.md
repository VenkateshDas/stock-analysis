# Kite Connect v3 — Historical Data API Reference

**For: stock-prediction model training pipeline**
**Last updated:** 2026-03-16

---

## Overview

Zerodha Kite Connect v3 is the preferred data source for NSE historical data over
yfinance because:

| Property | Kite Connect | yfinance |
|---|---|---|
| Corporate action accuracy | Official NSE adjustments | Partial (bonus issues sometimes wrong) |
| Rights issue adjustment | Yes | No |
| Data latency | Real-time / EoD | 15-min delay / EoD |
| Intraday history depth | 3 years (1-min) | ~60 days (1-min) |
| Daily history depth | Late 1990s for NSE | 2000 for most; sparse pre-2010 |
| Rate limits | ~3 req/sec (manageable) | IP bans for bulk downloads |
| Point-in-time data | Yes (no retroactive restating) | No (retroactive adjustments) |
| Requires auth | Yes (OAuth2 access token) | No |

---

## Authentication

Kite Connect uses a 3-step OAuth2 flow:

```
1. Redirect user to:
   https://kite.zerodha.com/connect/login?api_key=<API_KEY>&v=3

2. User logs in → Kite redirects back to your redirect_url with ?request_token=<TOKEN>

3. Exchange request_token for access_token:
   kite.generate_session(request_token, api_secret=<API_SECRET>)
   → returns { access_token, user_id, user_name, ... }
```

The `access_token` is valid for **one trading day** (expires at midnight IST).
It must be refreshed each day via a new login.  The existing Bot Lab Kite Connect
OAuth flow (`KiteAuthManager`) handles this.

```python
from app.bot.auth.kite_auth import KiteAuthManager

auth = KiteAuthManager(user_id="alice")
kite = auth.get_kite_client()   # None if not logged in
```

---

## Historical Data Endpoint

```
GET /instruments/historical/{instrument_token}/{interval}
    ?from=<datetime>&to=<datetime>[&continuous=1][&oi=1]
```

### Python SDK (pykiteconnect)

```python
records = kite.historical_data(
    instrument_token=256265,          # NIFTY 50
    from_date="2024-01-01 09:15:00",  # string or datetime object
    to_date="2024-03-31 15:30:00",
    interval="15minute",
    continuous=False,                 # True for continuous futures
    oi=False,                         # True to include open interest
)
```

Returns a **list of dicts**:

```python
[
    {
        "date":   datetime(2024, 1, 1, 9, 15, tzinfo=IST),
        "open":   21723.50,
        "high":   21745.00,
        "low":    21710.25,
        "close":  21738.40,
        "volume": 123456,
        # "oi": 0   ← only if oi=True
    },
    ...
]
```

Raw API JSON (what the SDK parses):

```json
{
  "status": "success",
  "data": {
    "candles": [
      ["2024-01-01T09:15:00+0530", 21723.5, 21745.0, 21710.25, 21738.4, 123456],
      ["2024-01-01T09:16:00+0530", 21738.4, 21750.0, 21730.0,  21745.1,  98765]
    ]
  }
}
```

---

## Supported Intervals & Date Range Limits

Each single API request is capped by interval:

| Interval string | Max days per request | Typical use |
|---|---|---|
| `"minute"`    | 60 days   | 1-min intraday bars |
| `"2minute"`   | 60 days   | 2-min bars |
| `"3minute"`   | 100 days  | 3-min bars |
| `"5minute"`   | 100 days  | 5-min strategy bars |
| `"10minute"`  | 100 days  | 10-min bars |
| `"15minute"`  | 200 days  | 15-min swing / ORB |
| `"30minute"`  | 200 days  | 30-min bars |
| `"60minute"`  | 400 days  | Hourly bars |
| `"day"`       | 2000 days | **Daily candles — primary for ML training** |
| `"week"`      | 2000 days | Weekly bars |

For training a weekly-rebalancing momentum model on 10 years of daily data:
→ Use `interval="day"`, single request covers 2000 days (> 10 years) ✓

For intraday backtesting (1-min or 5-min over 3 years):
→ Chunk requests into 60-day or 100-day windows — `KiteProvider.fetch()` does this automatically.

---

## Instrument Tokens

Every NSE security has a unique integer `instrument_token`.

### Well-known index tokens

| Index | Token |
|---|---|
| NIFTY 50 | `256265` |
| NIFTY BANK | `260105` |
| NIFTY 100 | `261889` |
| SENSEX | `265` |

### Equity tokens (dynamic)

Download the instrument master once per day:

```python
instruments = kite.instruments("NSE")  # returns list of dicts
df = pd.DataFrame(instruments)
# Columns: instrument_token, exchange_token, tradingsymbol, name,
#          last_price, expiry, strike, tick_size, lot_size,
#          instrument_type, segment, exchange

# Look up RELIANCE
reliance = df[df["tradingsymbol"] == "RELIANCE"]
token = int(reliance[reliance["series"] == "EQ"].iloc[0]["instrument_token"])
```

**Critical**: F&O instrument tokens change every expiry.  Always download fresh
instrument master for current contracts.  `KiteProvider` caches it for 24 hours.

### NIFTY 100 constituent tokens (for momentum universe)

```python
from app.services.data_providers.kite import build_kite_provider

provider = build_kite_provider(user_id="alice")
nifty100_symbols = [...]  # e.g. from niftyindices.com constituent list
universe = provider.fetch_universe(
    symbols=nifty100_symbols,
    from_date=date(2015, 1, 1),
    to_date=date(2025, 12, 31),
    interval="day",
)
# universe["RELIANCE"] → DataFrame[Open, High, Low, Close, Volume]
```

---

## Rate Limits

- **~3 requests per second** on historical API (enforced server-side)
- `KiteProvider` sleeps **0.35 s** between chunked requests by default
- For bulk universe download (~100 stocks): expect ~35 seconds total
- Do not parallelize Kite historical calls — connection pooling can trigger bans

---

## Data Quality vs. yfinance

| Issue | Kite | yfinance |
|---|---|---|
| Bonus issue adjustment | ✅ Official NSE adjustments | ⚠️ Partial, errors for mid/small-cap |
| Rights issue adjustment | ✅ Yes | ❌ Not handled |
| Retroactive restatements | ❌ No (point-in-time) | ⚠️ Yes (look-ahead bias) |
| `financials` timeliness | N/A | ❌ No availability timestamps |
| Pre-2010 daily data | ✅ Back to late 1990s | ⚠️ Sparse/unreliable |
| Intraday history (1-min) | ✅ 3 years | ⚠️ ~60 days |

---

## Using `KiteProvider` in the Codebase

### Building the provider

```python
from app.services.data_providers.kite import build_kite_provider

# Reads session from data/bot/<user_id>/kite_session.json
provider = build_kite_provider(user_id="alice")
```

### Daily OHLCV for a single symbol

```python
from datetime import date

df = provider.fetch_by_symbol(
    symbol="RELIANCE",
    from_date=date(2015, 1, 1),
    to_date=date(2025, 12, 31),
    interval="day",
)
# df.columns = [Open, High, Low, Close, Volume]
# df.index   = DatetimeIndex (Asia/Kolkata)
```

### 5-minute intraday bars (auto-chunked)

```python
df = provider.fetch_by_symbol(
    symbol="INFY",
    from_date=date(2023, 1, 1),
    to_date=date(2025, 12, 31),
    interval="5minute",     # chunks into 100-day windows automatically
)
```

### Bulk download for momentum universe

```python
nifty100 = ["RELIANCE", "TCS", "HDFCBANK", "INFY", ...]  # 100 symbols

universe = provider.fetch_universe(
    symbols=nifty100,
    from_date=date(2015, 1, 1),
    to_date=date(2025, 12, 31),
    interval="day",
)
# ~35 seconds for 100 symbols; built-in 0.35s rate-limit sleep
```

### Via `IndiaMarketDataAdapter` (auto-selects Kite or yfinance)

```python
from app.bot.data.market_data import default_data_adapter

adapter = default_data_adapter(user_id="alice")

# Daily data — uses Kite if session active, else yfinance
df = adapter.fetch_daily("RELIANCE", date(2015, 1, 1), date(2025, 12, 31))

# Intraday
df = adapter.fetch_intraday("NIFTY", date(2024, 1, 1), date(2024, 3, 31), interval="5minute")

# Bulk universe
universe = adapter.fetch_universe_daily(
    symbols=["RELIANCE", "TCS", "INFY"],
    from_date=date(2015, 1, 1),
    to_date=date(2025, 12, 31),
)
```

---

## Model Training Pipeline Sketch

```python
from datetime import date
from app.services.data_providers.kite import build_kite_provider
import pandas as pd

# 1. Connect
provider = build_kite_provider(user_id="alice")

# 2. Download NIFTY 100 universe daily data
nifty100_symbols = [...]  # load from niftyindices.com constituent CSV
universe = provider.fetch_universe(
    symbols=nifty100_symbols,
    from_date=date(2015, 1, 1),
    to_date=date(2025, 12, 31),
    interval="day",
)

# 3. Build a panel DataFrame
panel = pd.concat(
    {sym: df["Close"] for sym, df in universe.items()},
    axis=1
)
panel.index = panel.index.normalize()  # date-only index for daily

# 4. Compute momentum features
returns = panel.pct_change()
mom_12_1 = panel.shift(21) / panel.shift(252) - 1     # 12-1 month momentum
vol_1m   = returns.rolling(21).std() * (252 ** 0.5)   # annualised vol
# ... RSI, volume ratio, 52w-high proximity via ta library

# 5. Build feature matrix X, target y (1-month forward return)
# 6. Walk-forward train/test splits with 4-week embargo
# 7. Train LightGBM ranker per fold, evaluate rank IC
```

---

## Environment Setup

The `kiteconnect` package is already in `backend/requirements.txt`:
```
kiteconnect>=5.0.1
```

No additional environment variables needed for the data provider itself —
credentials are stored in the per-user session file (`data/bot/<user_id>/kite_session.json`)
managed by the existing Bot Lab OAuth flow.

---

## Sources

- [Kite Connect v3 historical API docs](https://kite.trade/docs/connect/v3/historical/) (requires login)
- [pykiteconnect GitHub — connect.py](https://github.com/zerodha/pykiteconnect/blob/master/kiteconnect/connect.py)
- [Kite forum: interval date range limits](https://kite.trade/forum/discussion/11460/kite-historical-data-interval-date-range)
- [Kite forum: data retention policy](https://kite.trade/forum/discussion/14149/historical-data-retention-policy)
- [kiteconnect-ts API reference](https://kiteconnect.anuragroy.dev/classes/KiteConnect)
