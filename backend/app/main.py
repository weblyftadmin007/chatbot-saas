from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
from datetime import datetime, timezone

from app.config import settings
from app.database import lifespan
from app.middleware.tenant import TenantMiddleware
from app.api import widget, tenant, admin


# Configure logging
logging.basicConfig(level=getattr(logging, settings.log_level))
logger = logging.getLogger(__name__)


app = FastAPI(
    title="Multi-Tenant AI Chatbot API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
# The widget is designed to be embedded on arbitrary customer sites (wildcard
# origins). Credentials are never needed for the widget; tenant/admin APIs use
# bearer tokens, so we only enable credentials for explicitly-listed origins.
cors_origins = ["*"] if settings.widget_cors_origins == "*" else [o.strip() for o in settings.widget_cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=cors_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Tenant middleware
app.add_middleware(TenantMiddleware)

# Include routers
app.include_router(widget.router)
app.include_router(tenant.router)
app.include_router(admin.router)


@app.get("/")
async def root():
    return {
        "name": "Multi-Tenant AI Chatbot API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health():
    """Liveness probe used by Docker HEALTHCHECK, nginx and the HF keep-alive"""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "timestamp": int(datetime.now(timezone.utc).timestamp())
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)