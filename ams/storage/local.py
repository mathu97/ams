"""Local-disk storage. Mirrors the S3 layout under a directory so the same
frontend code can read either. Useful for development and demos."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional
from urllib.parse import quote, unquote

from ..schema import Activity, FacetMember, Session
from .registry import agent_registry_key, build_registry_record


class LocalStorage:
    def __init__(self, root: str = "./ams-data"):
        self.root = Path(root)

    @classmethod
    def from_env(cls) -> "LocalStorage":
        return cls(root=os.environ.get("AMS_LOCAL_DIR", "./ams-data"))

    def session_key(self, session: Session) -> str:
        date = session.start_time[:10].replace("-", "/")
        return f"sessions/{date}/{session.session_id}.json"

    def activity_key(self, activity: Activity) -> str:
        return f"activities/{activity.id}.json"

    def _facet_member_key(self, facet: str, value: str, ref: str) -> str:
        return (
            f"facets/{quote(facet, safe='')}/{quote(value, safe='')}"
            f"/members/{quote(ref, safe='')}.json"
        )

    def _write(self, key: str, body: str) -> Path:
        path = self.root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")
        return path

    def put_session(self, session: Session) -> str:
        path = self._write(
            self.session_key(session),
            session.model_dump_json(exclude_none=True, indent=2, by_alias=True),
        )
        self._write(
            f"index/{session.session_id}.json",
            json.dumps(session.summary(), indent=2),
        )
        self._upsert_agent_registry(session)
        return str(path)

    def put_activity(self, activity: Activity) -> str:
        path = self._write(
            self.activity_key(activity),
            activity.model_dump_json(exclude_none=True, indent=2),
        )
        return str(path)

    def put_facet_member(self, facet: str, value: str, member: FacetMember) -> str:
        path = self._write(
            self._facet_member_key(facet, value, member.ref),
            member.model_dump_json(exclude_none=True, indent=2),
        )
        return str(path)

    def list_facet_values(self, facet: str) -> list[str]:
        base = self.root / "facets" / quote(facet, safe="")
        if not base.is_dir():
            return []
        return sorted(unquote(p.name) for p in base.iterdir() if p.is_dir())

    def list_facet_members(self, facet: str, value: str) -> list[FacetMember]:
        base = (
            self.root / "facets" / quote(facet, safe="")
            / quote(value, safe="") / "members"
        )
        if not base.is_dir():
            return []
        members: list[FacetMember] = []
        for path in base.glob("*.json"):
            try:
                members.append(
                    FacetMember.model_validate_json(path.read_text(encoding="utf-8"))
                )
            except Exception:
                continue
        members.sort(key=lambda m: m.timestamp)
        return members

    def read_record(self, key: str) -> Optional[dict]:
        path = self.root / key
        if not path.is_file():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None

    def _upsert_agent_registry(self, session: Session) -> None:
        agent_name = session.agent.name
        if not agent_name:
            return
        from urllib.parse import quote

        key_path = self.root / "agents" / f"{quote(agent_name, safe='')}.json"
        key_path.parent.mkdir(parents=True, exist_ok=True)
        existing = None
        if key_path.exists():
            try:
                existing = json.loads(key_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                existing = None
        record = build_registry_record(session, existing)
        key_path.write_text(json.dumps(record, indent=2), encoding="utf-8")
