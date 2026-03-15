import time
from typing import Any, Dict, Optional

from app.config import settings


class TTLCache:
    """Simple in-memory TTL cache. Thread-safe for single-process use."""

    def __init__(self, ttl: int = None, max_size: Optional[int] = None):
        self._ttl = ttl or settings.cache_ttl_seconds
        self._max_size = max_size
        self._store: Dict[str, tuple[Any, float]] = {}

    def get(self, key: str) -> Optional[Any]:
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expires_at = entry
        if time.time() > expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        effective_ttl = ttl if ttl is not None else self._ttl
        self._store[key] = (value, time.time() + effective_ttl)
        if self._max_size and len(self._store) > self._max_size:
            # Evict the soonest-to-expire entry
            oldest_key = min(self._store, key=lambda k: self._store[k][1])
            del self._store[oldest_key]

    def delete(self, key: str) -> None:
        self._store.pop(key, None)

    def clear(self) -> None:
        self._store.clear()

    def keys(self):
        now = time.time()
        return [k for k, (_, exp) in list(self._store.items()) if exp > now]

    def evict_expired(self) -> int:
        """Remove all expired entries. Returns number of entries evicted."""
        now = time.time()
        expired = [k for k, (_, exp) in list(self._store.items()) if exp <= now]
        for k in expired:
            del self._store[k]
        return len(expired)


# Singleton caches
market_cache = TTLCache()
analysis_cache = TTLCache()
llm_cache = TTLCache(ttl=3600 * 6)       # LLM cache: 6 hours
trend_cache = TTLCache(ttl=3600 * 6)     # Trend cache: 6 hours (daily data only changes once/day)
opening_range_cache = TTLCache(ttl=600)  # 10-minute TTL (intraday data changes frequently)
stock_info_cache = TTLCache(ttl=3600 * 24, max_size=600)  # 24-hour TTL, capped at 600 symbols
heatmap_cache = TTLCache(ttl=900)           # 15-minute TTL (constituent price data)
pcr_cache = TTLCache(ttl=20 * 60)          # 20-minute TTL (options chain is slow)
opportunities_cache = TTLCache(ttl=3600)   # 1-hour TTL (constituent scan is expensive)
screener_cache = TTLCache(ttl=1800)        # 30-min TTL (screener scan is expensive)
