import os

from fastapi import APIRouter

router = APIRouter(tags=["health"])


def _data_source() -> str:
    backend = os.environ.get("AMS_STORAGE", "").lower()
    if backend in ("local", "s3"):
        return backend
    if os.environ.get("AMS_S3_BUCKET"):
        return "s3"
    if os.environ.get("AMS_LOCAL_DIR"):
        return "local"
    return "unconfigured"


@router.get("/healthz")
def healthz() -> dict:
    return {"status": "ok", "data_source": _data_source()}
