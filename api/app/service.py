"""Data access over the AMS package — the canonical read layer.

Deliberately free of any web framework: these functions are what the HTTP
routers call today and what a future MCP server will call too. All storage
access goes through the `ams` package (`ams.storage`, `ams.load_entity_timeline`)
so there is one implementation of "how AMS data is read", shared by the SDK,
this API, and the dashboard (which moves from reading R2 directly to calling
this API).

Reads are blocking (boto3); callers run them off the event loop. Hot list reads
are TTL-cached here so the dashboard stops pulling everything into memory on
every page load.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any, Optional

from ams import load_entity_timeline
from ams.schema import Session
from ams.storage import Storage, from_env

from app.cache import TTLCache
from app.config import get_config


@lru_cache(maxsize=1)
def _storage() -> Storage:
    return from_env()


@lru_cache(maxsize=1)
def _cache() -> TTLCache:
    return TTLCache(get_config().cache_ttl)


# --- agents -----------------------------------------------------------------

def list_agents() -> list[dict]:
    """Per-agent rollups. Uses the agent registry objects AMS already writes
    (O(agents)), not a full session scan (O(sessions)) — the latency fix."""
    return _cache().get_or_set("agents", _list_agents)


def _list_agents() -> list[dict]:
    registries = _storage().list_agent_registries()
    if registries:
        return sorted(
            registries, key=lambda r: str(r.get("last_seen", "")), reverse=True
        )
    return _aggregate_agents_from_indexes(_storage().list_session_indexes())


def get_agent(name: str) -> Optional[dict]:
    return _storage().get_agent_registry(name)


def _aggregate_agents_from_indexes(indexes: list[dict]) -> list[dict]:
    by_name: dict[str, list[dict]] = {}
    for index in indexes:
        name = (index.get("agent") or {}).get("name")
        if name:
            by_name.setdefault(name, []).append(index)
    out: list[dict] = []
    for name, rows in by_name.items():
        last_seen = max((str(r.get("start_time", "")) for r in rows), default="")
        out.append(
            {
                "agent": {"name": name},
                "session_count": len(rows),
                "error_count": sum(1 for r in rows if r.get("status") == "error"),
                "last_seen": last_seen,
            }
        )
    return sorted(out, key=lambda r: str(r.get("last_seen", "")), reverse=True)


# --- sessions ---------------------------------------------------------------

def list_session_indexes(agent: Optional[str] = None) -> list[dict]:
    """Compact session summaries (the index records), newest first. Optionally
    filtered to one agent. Never returns full event payloads."""
    key = f"sessions:{agent or '*'}"
    return _cache().get_or_set(key, lambda: _list_session_indexes(agent))


def _list_session_indexes(agent: Optional[str]) -> list[dict]:
    indexes = _storage().list_session_indexes()
    if agent:
        indexes = [i for i in indexes if (i.get("agent") or {}).get("name") == agent]
    indexes.sort(key=lambda i: str(i.get("start_time", "")), reverse=True)
    return indexes


def get_session(session_id: str) -> Optional[Session]:
    """The full session (events included). Not cached — large and rarely
    re-fetched in a burst."""
    return _storage().get_session(session_id)


# --- facets (entities: threads, tenants, ...) -------------------------------

def list_facet_entities(facet: str) -> list[dict]:
    """Every value of a facet with a member-pointer-only rollup, newest first."""
    return _cache().get_or_set(f"facet:{facet}", lambda: _list_facet_entities(facet))


def _list_facet_entities(facet: str) -> list[dict]:
    storage = _storage()
    out: list[dict] = []
    for value in storage.list_facet_values(facet):
        members = storage.list_facet_members(facet, value)
        last = members[-1] if members else None
        out.append(
            {
                "facet": facet,
                "value": value,
                "member_count": len(members),
                "session_count": sum(1 for m in members if m.kind == "session"),
                "activity_count": sum(1 for m in members if m.kind == "activity"),
                "last_activity": last.timestamp if last else None,
                "last_label": _member_label(last.summary) if last else None,
            }
        )
    out.sort(key=lambda e: e.get("last_activity") or "", reverse=True)
    return out


def get_entity_timeline(facet: str, value: str) -> list[dict]:
    """The merged, time-ordered timeline for one entity: sessions (as pointers)
    and activities (expanded to full records) that share this facet value."""
    items = load_entity_timeline(facet, value, storage=_storage(), expand=True)
    out: list[dict] = []
    for item in items:
        member = item["member"]
        out.append(
            {
                "kind": member.kind,
                "ref": member.ref,
                "timestamp": member.timestamp,
                "status": _status_str(member.status),
                "summary": member.summary,
                "activity": item["record"] if member.kind == "activity" else None,
            }
        )
    out.sort(key=lambda r: str(r["timestamp"]))
    return out


def _member_label(summary: dict[str, Any]) -> Optional[str]:
    name = summary.get("name")
    if isinstance(name, str) and name:
        return name
    type_ = summary.get("type")
    if isinstance(type_, str) and type_:
        return type_
    return None


def _status_str(status: Any) -> str:
    return status.value if hasattr(status, "value") else str(status)
