from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_config
from app.routers import agents, facets, health, sessions


def create_app() -> FastAPI:
    cfg = get_config()
    app = FastAPI(
        title="AMS Read API",
        version="0.1.0",
        description="Read API over AMS trace storage. Serves the dashboard; the "
        "service layer is framework-agnostic so a future MCP server reuses it.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origins,
        allow_credentials=False,
        allow_methods=["GET"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(agents.router)
    app.include_router(sessions.router)
    app.include_router(facets.router)
    return app


app = create_app()
