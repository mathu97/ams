"""S3-compatible storage. Works against AWS S3, Cloudflare R2, MinIO, etc. —
anything that speaks the S3 API. Point `AMS_S3_ENDPOINT_URL` at your provider.

Layout under the bucket:
    {prefix}/sessions/{YYYY}/{MM}/{DD}/{session_id}.json   full session
    {prefix}/index/{session_id}.json                        compact summary
    {prefix}/activities/{activity_id}.json                  standalone event
    {prefix}/facets/{key}/{value}/members/{ref}.json        entity membership

The frontend lists the small `index/` objects to build a searchable session
list, then fetches a full session on demand. It lists `facets/{key}/` to
browse entities (threads, tenants, ...) and a value's `members/` to pull
every session and activity belonging to that entity.
"""

from __future__ import annotations

import json
import os
from typing import Optional
from urllib.parse import quote, unquote

from ..schema import Activity, FacetMember, Session
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

    def session_key(self, session: Session) -> str:
        date = session.start_time[:10].replace("-", "/")
        return f"{self.prefix}/sessions/{date}/{session.session_id}.json"

    def activity_key(self, activity: Activity) -> str:
        return f"{self.prefix}/activities/{activity.id}.json"

    def _index_key(self, session: Session) -> str:
        return f"{self.prefix}/index/{session.session_id}.json"

    def _facet_member_key(self, facet: str, value: str, ref: str) -> str:
        return (
            f"{self.prefix}/facets/{quote(facet, safe='')}"
            f"/{quote(value, safe='')}/members/{quote(ref, safe='')}.json"
        )

    def put_session(self, session: Session) -> str:
        body = session.model_dump_json(exclude_none=True, indent=2, by_alias=True)
        session_key = self.session_key(session)
        self._put(session_key, body)
        self._put(self._index_key(session), json.dumps(session.summary(), indent=2))
        self._upsert_agent_registry(session)
        return f"s3://{self.bucket}/{session_key}"

    def put_activity(self, activity: Activity) -> str:
        key = self.activity_key(activity)
        self._put(key, activity.model_dump_json(exclude_none=True, indent=2))
        return f"s3://{self.bucket}/{key}"

    def put_facet_member(self, facet: str, value: str, member: FacetMember) -> str:
        key = self._facet_member_key(facet, value, member.ref)
        self._put(key, member.model_dump_json(exclude_none=True, indent=2))
        return f"s3://{self.bucket}/{key}"

    def list_facet_values(self, facet: str) -> list[str]:
        prefix = f"{self.prefix}/facets/{quote(facet, safe='')}/"
        return sorted(unquote(p) for p in self._list_common_prefixes(prefix))

    def list_facet_members(self, facet: str, value: str) -> list[FacetMember]:
        prefix = (
            f"{self.prefix}/facets/{quote(facet, safe='')}"
            f"/{quote(value, safe='')}/members/"
        )
        members: list[FacetMember] = []
        for key in self._list_keys(prefix):
            raw = self.read_record(key)
            if raw is not None:
                members.append(FacetMember.model_validate(raw))
        members.sort(key=lambda m: m.timestamp)
        return members

    def read_record(self, key: str) -> Optional[dict]:
        try:
            return json.loads(self._read(key))
        except Exception:
            return None

    def _list_common_prefixes(self, prefix: str) -> list[str]:
        out: list[str] = []
        token: Optional[str] = None
        while True:
            kwargs = {"Bucket": self.bucket, "Prefix": prefix, "Delimiter": "/"}
            if token:
                kwargs["ContinuationToken"] = token
            resp = self._client.list_objects_v2(**kwargs)
            for cp in resp.get("CommonPrefixes", []):
                name = cp["Prefix"][len(prefix):].rstrip("/")
                if name:
                    out.append(name)
            if not resp.get("IsTruncated"):
                break
            token = resp.get("NextContinuationToken")
        return out

    def _list_keys(self, prefix: str) -> list[str]:
        out: list[str] = []
        token: Optional[str] = None
        while True:
            kwargs = {"Bucket": self.bucket, "Prefix": prefix}
            if token:
                kwargs["ContinuationToken"] = token
            resp = self._client.list_objects_v2(**kwargs)
            for obj in resp.get("Contents", []):
                out.append(obj["Key"])
            if not resp.get("IsTruncated"):
                break
            token = resp.get("NextContinuationToken")
        return out

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
