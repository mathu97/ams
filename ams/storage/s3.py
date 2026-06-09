"""S3-compatible storage. Works against AWS S3, Cloudflare R2, MinIO, etc. —
anything that speaks the S3 API. Point `AMS_S3_ENDPOINT_URL` at your provider.

Layout under the bucket:
    {prefix}/sessions/{YYYY}/{MM}/{DD}/{session_id}.json   full session
    {prefix}/index/{session_id}.json                        compact summary

The frontend lists the small `index/` objects to build a searchable session
list, then fetches a full session on demand.
"""

from __future__ import annotations

import json
import os
from typing import Optional

from ..schema import Session
from .registry import agent_registry_key, build_registry_record


class S3Storage:
    def __init__(
        self,
        bucket: str,
        prefix: str = "ams",
        endpoint_url: Optional[str] = None,
        region_name: Optional[str] = None,
        client=None,
    ):
        self.bucket = bucket
        self.prefix = prefix.strip("/")
        if client is not None:
            self._client = client
        else:
            import boto3  # imported lazily so `ams` stays importable without it

            self._client = boto3.client(
                "s3", endpoint_url=endpoint_url, region_name=region_name
            )

    @classmethod
    def from_env(cls) -> "S3Storage":
        bucket = os.environ.get("AMS_S3_BUCKET")
        if not bucket:
            raise RuntimeError(
                "AMS_S3_BUCKET is not set. Set it (and optionally "
                "AMS_S3_ENDPOINT_URL / AMS_S3_PREFIX / AMS_S3_REGION) or use "
                "LocalStorage."
            )
        return cls(
            bucket=bucket,
            prefix=os.environ.get("AMS_S3_PREFIX", "ams"),
            endpoint_url=os.environ.get("AMS_S3_ENDPOINT_URL"),
            region_name=os.environ.get("AMS_S3_REGION")
            or os.environ.get("AWS_REGION"),
        )

    def _session_key(self, session: Session) -> str:
        date = session.start_time[:10].replace("-", "/")
        return f"{self.prefix}/sessions/{date}/{session.session_id}.json"

    def _index_key(self, session: Session) -> str:
        return f"{self.prefix}/index/{session.session_id}.json"

    def put_session(self, session: Session) -> str:
        body = session.model_dump_json(exclude_none=True, indent=2, by_alias=True)
        session_key = self._session_key(session)
        self._put(session_key, body)
        self._put(self._index_key(session), json.dumps(session.summary(), indent=2))
        self._upsert_agent_registry(session)
        return f"s3://{self.bucket}/{session_key}"

    def _upsert_agent_registry(self, session: Session) -> None:
        agent_name = session.agent.name
        if not agent_name:
            return
        key = agent_registry_key(self.prefix, agent_name)
        existing = None
        try:
            existing_body = self._read(key)
            existing = json.loads(existing_body)
        except Exception:
            existing = None
        record = build_registry_record(session, existing)
        self._put(key, json.dumps(record, indent=2))

    def _read(self, key: str) -> str:
        response = self._client.get_object(Bucket=self.bucket, Key=key)
        body = response["Body"].read()
        return body.decode("utf-8")

    def _put(self, key: str, body: str) -> None:
        self._client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=body.encode("utf-8"),
            ContentType="application/json",
        )
