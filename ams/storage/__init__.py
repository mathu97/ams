"""Pluggable storage. A backend accepts finished Sessions, standalone
Activities, and the facet pointers that group both into browsable entities."""

from __future__ import annotations

import os
from typing import Optional, Protocol, runtime_checkable

from ..schema import Activity, FacetMember, Session
from .local import LocalStorage
from .s3 import S3Storage


@runtime_checkable
class Storage(Protocol):
    def put_session(self, session: Session) -> str: ...
    def put_activity(self, activity: Activity) -> str: ...
    def put_facet_member(self, facet: str, value: str, member: FacetMember) -> str: ...
    def list_facet_values(self, facet: str) -> list[str]: ...
    def list_facet_members(self, facet: str, value: str) -> list[FacetMember]: ...
    def read_record(self, key: str) -> Optional[dict]: ...
    def get_session(self, session_id: str) -> Optional[Session]: ...
    def list_session_indexes(self) -> list[dict]: ...
    def get_agent_registry(self, agent_name: str) -> Optional[dict]: ...
    def list_agent_registries(self) -> list[dict]: ...
    def session_key(self, session: Session) -> str: ...
    def activity_key(self, activity: Activity) -> str: ...


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
