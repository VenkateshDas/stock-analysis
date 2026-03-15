import logging
from typing import Optional

from app.config import INDICES, settings
from app.models.analysis import AnalysisResult
from app.services.data_providers.yahoo import yahoo_provider
from app.services.analysis.technical import technical_service
from app.services.analysis.statistical import statistical_service
from app.services.analysis.regime import regime_service
from app.services.cache import analysis_cache

logger = logging.getLogger(__name__)
ANALYSIS_TTL_SECONDS = 300


class PreviousDayAnalysisOrchestrator:
    """
    Orchestrates full analysis for a given index symbol.
    Caches results with TTL.
    """

    def get_analysis(self, symbol: str) -> Optional[AnalysisResult]:
        cache_key = f"analysis:{symbol}"
        cached = analysis_cache.get(cache_key)
        if cached is not None:
            return cached

        config = INDICES.get(symbol)
        if config is None:
            return None

        # Fetch enough data for 200-period SMA and 252-day returns
        df = yahoo_provider.get_history(config.ticker, period_days=settings.analysis_lookback_days)
        if df.empty or len(df) < 20:
            logger.warning(f"Insufficient data for analysis of {symbol}")
            return None

        technical = technical_service.compute(df)
        statistical = statistical_service.compute(df, atr=technical.atr)

        last_close = float(df["Close"].iloc[-1])
        last_open = float(df["Open"].iloc[-1]) if "Open" in df.columns else None
        last_volume = float(df["Volume"].iloc[-1]) if "Volume" in df.columns else None
        trade_date = df.index[-1].strftime("%Y-%m-%d")

        sentiment_score = self._compute_sentiment(technical)
        if sentiment_score >= 0.2:
            overall_sentiment = "bullish"
        elif sentiment_score <= -0.2:
            overall_sentiment = "bearish"
        else:
            overall_sentiment = "neutral"

        try:
            regime = regime_service.compute(technical, statistical, last_close)
        except Exception:
            regime = None

        result = AnalysisResult(
            symbol=symbol,
            trade_date=trade_date,
            last_close=last_close,
            last_open=last_open,
            last_volume=last_volume,
            currency=config.currency,
            technical=technical,
            statistical=statistical,
            overall_sentiment=overall_sentiment,
            sentiment_score=round(sentiment_score, 4),
            regime=regime,
        )

        analysis_cache.set(cache_key, result, ttl=ANALYSIS_TTL_SECONDS)
        return result

    def get_analysis_for_ticker(
        self,
        symbol: str,
        ticker: str,
        currency: str = "USD",
    ) -> Optional[AnalysisResult]:
        """Compute full analysis for any Yahoo ticker (stock/ETF/index-like asset)."""
        cache_key = f"analysis:asset:{symbol}:{ticker}:{currency}"
        cached = analysis_cache.get(cache_key)
        if cached is not None:
            return cached

        df = yahoo_provider.get_history(ticker, period_days=settings.analysis_lookback_days)
        if df.empty or len(df) < 20:
            logger.warning(f"Insufficient data for analysis of {symbol} ({ticker})")
            return None

        technical = technical_service.compute(df)
        statistical = statistical_service.compute(df, atr=technical.atr)

        last_close = float(df["Close"].iloc[-1])
        last_open = float(df["Open"].iloc[-1]) if "Open" in df.columns else None
        last_volume = float(df["Volume"].iloc[-1]) if "Volume" in df.columns else None
        trade_date = df.index[-1].strftime("%Y-%m-%d")

        sentiment_score = self._compute_sentiment(technical)
        if sentiment_score >= 0.2:
            overall_sentiment = "bullish"
        elif sentiment_score <= -0.2:
            overall_sentiment = "bearish"
        else:
            overall_sentiment = "neutral"

        try:
            regime = regime_service.compute(technical, statistical, last_close)
        except Exception:
            regime = None

        result = AnalysisResult(
            symbol=symbol,
            trade_date=trade_date,
            last_close=last_close,
            last_open=last_open,
            last_volume=last_volume,
            currency=currency,
            technical=technical,
            statistical=statistical,
            overall_sentiment=overall_sentiment,
            sentiment_score=round(sentiment_score, 4),
            regime=regime,
        )
        analysis_cache.set(cache_key, result, ttl=ANALYSIS_TTL_SECONDS)
        return result

    def get_analysis_for_ticker_with_interval(
        self,
        symbol: str,
        ticker: str,
        currency: str = "USD",
        interval: str = "1d",
    ) -> Optional[AnalysisResult]:
        """Compute analysis for any ticker using a specific interval.

        For intraday intervals (15m, 1h) fetches the appropriate intraday bars
        so that RSI/MACD/ADX are computed on shorter timeframe data suitable
        for intraday and swing screener modes.  Falls back to daily analysis
        when insufficient bars are available.
        """
        if interval == "1d":
            return self.get_analysis_for_ticker(symbol, ticker, currency)

        cache_key = f"analysis:asset:{symbol}:{ticker}:{currency}:{interval}"
        cached = analysis_cache.get(cache_key)
        if cached is not None:
            return cached

        days_back = 30 if interval == "1h" else 10  # 15m or others
        df = yahoo_provider.get_history_intraday(ticker, interval=interval, days_back=days_back)
        if df.empty or len(df) < 20:
            logger.warning(f"Insufficient {interval} data for {symbol} ({ticker}), falling back to 1d")
            return self.get_analysis_for_ticker(symbol, ticker, currency)

        technical = technical_service.compute(df)
        statistical = statistical_service.compute(df, atr=technical.atr)

        last_close = float(df["Close"].iloc[-1])
        last_open = float(df["Open"].iloc[-1]) if "Open" in df.columns else None
        last_volume = float(df["Volume"].iloc[-1]) if "Volume" in df.columns else None
        trade_date = df.index[-1].strftime("%Y-%m-%d %H:%M")

        sentiment_score = self._compute_sentiment(technical)
        if sentiment_score >= 0.2:
            overall_sentiment = "bullish"
        elif sentiment_score <= -0.2:
            overall_sentiment = "bearish"
        else:
            overall_sentiment = "neutral"

        try:
            regime = regime_service.compute(technical, statistical, last_close)
        except Exception:
            regime = None

        result = AnalysisResult(
            symbol=symbol,
            trade_date=trade_date,
            last_close=last_close,
            last_open=last_open,
            last_volume=last_volume,
            currency=currency,
            technical=technical,
            statistical=statistical,
            overall_sentiment=overall_sentiment,
            sentiment_score=round(sentiment_score, 4),
            regime=regime,
        )
        analysis_cache.set(cache_key, result, ttl=ANALYSIS_TTL_SECONDS)
        return result

    def _compute_sentiment(self, t) -> float:
        """Aggregate indicator signals into a score from -1 to +1."""
        score = 0.0
        count = 0

        # RSI
        if t.rsi is not None:
            if t.rsi_signal == "overbought":
                score -= 0.5
            elif t.rsi_signal == "oversold":
                score += 0.5
            else:
                # Lean bullish if above 50
                score += 0.3 if t.rsi > 50 else -0.3
            count += 1

        # MACD
        if t.macd.macd is not None:
            score += 1.0 if t.macd_signal == "bullish" else -1.0 if t.macd_signal == "bearish" else 0.0
            count += 1

        # ADX trend + DI
        if t.adx is not None and t.plus_di is not None and t.minus_di is not None:
            if t.adx_signal in ("strong_trend", "moderate_trend"):
                score += 1.0 if t.plus_di > t.minus_di else -1.0
                count += 1

        # Price vs SMAs
        for signal in [t.price_vs_sma20, t.price_vs_sma50, t.price_vs_sma200]:
            if signal == "above":
                score += 0.5
            else:
                score -= 0.5
            count += 1

        # BB position
        if t.bb_signal == "above_upper":
            score -= 0.3
        elif t.bb_signal == "below_lower":
            score += 0.3
        elif t.bb_signal == "near_upper":
            score += 0.2
        elif t.bb_signal == "near_lower":
            score -= 0.2
        count += 1

        if count == 0:
            return 0.0
        raw = score / count
        # Clamp to [-1, 1]
        return max(-1.0, min(1.0, raw))


analysis_orchestrator = PreviousDayAnalysisOrchestrator()
