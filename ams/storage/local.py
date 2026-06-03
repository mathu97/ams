"""Local-disk storage. Mirrors the S3 layout under a directory so the same
frontend code can read either. Useful for development and demos."""

from __future__ import annotations

import json
import os
from pathlib import Path

from ..schema import Session


class LocalStorage:
    def __init__(self, root: str = "./ams-data"):
        self.root = Path(root)

    @classmethod
    def from_env(cls) -> "LocalStorage":
        return cls(root=os.environ.get("AMS_LOCAL_DIR", "./ams-data"))

    def put_session(self, session: Session) -> str:
        date = session.start_time[:10].replace("-", "/")
        session_path = (
            self.root / "sessions" / date / f"{session.session_id}.json"
        )
        index_path = self.root / "index" / f"{session.session_id}.json"
        session_path.parent.mkdir(parents=True, exist_ok=True)
        index_path.parent.mkdir(parents=True, exist_ok=True)
        session_path.write_text(
            session.model_dump_json(exclude_none=True, indent=2), encoding="utf-8"
        )
        index_path.write_text(
            json.dumps(session.summary(), indent=2), encoding="utf-8"
        )
        return str(session_path)
