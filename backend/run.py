import os
import uvicorn
from app.config import settings

if __name__ == "__main__":
    port = int(os.environ.get("PORT", settings.backend_port))
    is_dev = "PORT" not in os.environ  # PORT is set by Koyeb/Render/etc in production
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=is_dev,
        log_level="info",
    )
