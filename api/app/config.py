import os
from functools import lru_cache


class Config:
    """Runtime config. Storage itself is configured via the AMS_* env vars that
    `ams.storage.from_env()` reads (AMS_S3_BUCKET / AMS_S3_PREFIX / ... or
    AMS_LOCAL_DIR); this only adds the HTTP-layer knobs."""

    def __init__(self) -> None:
        self.cache_ttl: float = float(os.environ.get("AMS_API_CACHE_TTL", "30"))
        origins = os.environ.get("AMS_API_CORS_ORIGINS", "*")
        self.cors_origins: list[str] = [o.strip() for o in origins.split(",") if o.strip()]


@lru_cache(maxsize=1)
def get_config() -> Config:
    return Config()
