import asyncio
import gc
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.v1.router import api_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Global Market Analysis API",
        description=(
            "Professional stock market analysis dashboard backend. "
            "Provides technical indicators, statistical metrics, and LLM commentary "
            "for major global indices."
        ),
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_url, "http://localhost:5173", "http://localhost:3000"],
        allow_origin_regex=r"https://.*\.vercel\.app",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix="/api/v1")

    @app.get("/health")
    async def health():
        return {"status": "ok", "version": "1.0.0"}

    @app.on_event("startup")
    async def startup():
        logger.info("Global Market Analysis API started")
        logger.info(f"OpenRouter API key configured: {bool(settings.openrouter_api_key)}")
        logger.info(f"Cache TTL: {settings.cache_ttl_seconds}s")
        asyncio.create_task(_periodic_cache_cleanup())

    async def _periodic_cache_cleanup():
        """Sweep all TTL caches every 5 minutes and release memory."""
        from app.services.cache import (
            market_cache, analysis_cache, llm_cache, trend_cache,
            opening_range_cache, stock_info_cache, heatmap_cache,
            pcr_cache, opportunities_cache, screener_cache,
        )
        all_caches = [
            market_cache, analysis_cache, llm_cache, trend_cache,
            opening_range_cache, stock_info_cache, heatmap_cache,
            pcr_cache, opportunities_cache, screener_cache,
        ]
        while True:
            await asyncio.sleep(300)  # every 5 minutes
            try:
                total_evicted = sum(c.evict_expired() for c in all_caches)
                if total_evicted:
                    gc.collect()
                    logger.info(f"Cache cleanup: evicted {total_evicted} expired entries")
            except Exception as exc:
                logger.warning(f"Cache cleanup error: {exc}")

    return app


app = create_app()
