"""Pluggable storage. A backend just needs to accept a finished Session."""

from __future__ import annotations

import os
from typing import Protocol, runtime_checkable

from ..schema import Session
from .local import LocalStorage
from .s3 import S3Storage


@runtime_checkable
class Storage(Protocol):
    def put_session(self, session: Session) -> str: ...


def from_env() -> Storage:
    """Pick a backend from the environment.

    Defaults to S3-compatible blob storage. Set `AMS_STORAGE=local` (or leave
    `AMS_S3_BUCKET` unset) to write JSON to a local directory instead.
    """
    backend = os.environ.get("AMS_STORAGE", "").lower()
    if backend == "local" or (not backend and not os.environ.get("AMS_S3_BUCKET")):
        return LocalStorage.from_env()
    return S3Storage.from_env()


__all__ = ["Storage", "S3Storage", "LocalStorage", "from_env"]
