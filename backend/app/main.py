from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

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

    return app


app = create_app()
