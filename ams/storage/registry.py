"""Best-effort agent registry upsert on session write."""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import quote

from ..manifest.topology import topology_summary
from ..schema import Session


def agent_registry_key(prefix: str, agent_name: str) -> str:
    safe = quote(agent_name, safe="")
    return f"{prefix.strip('/')}/agents/{safe}.json"


def build_registry_record(session: Session, existing: dict[str, Any] | None) -> dict[str, Any]:
    agent_name = session.agent.name or "unknown"
    topo = topology_summary(session.topology, session.manifest) or {}
    record: dict[str, Any] = {
        "schema_version": session.schema_version,
        "agent": session.agent.model_dump(exclude_none=True),
        "session_count": 1,
        "error_count": 1 if session.status.value == "error" else 0,
        "last_seen": session.end_time or session.start_time,
        "last_session_id": session.session_id,
        "observed": {
            "agents": topo.get("agents_used", [agent_name]),
            "tools": _unique_tools(topo.get("tools_by_agent", {})),
            "mcp_servers": topo.get("mcp_servers", []),
            "delegations": topo.get("delegations", []),
        },
    }
    if session.manifest is not None:
        record["manifest"] = session.manifest.model_dump(
            mode="json", exclude_none=True, by_alias=True
        )

    if not existing:
        return record

    record["session_count"] = int(existing.get("session_count", 0)) + 1
    record["error_count"] = int(existing.get("error_count", 0)) + (
        1 if session.status.value == "error" else 0
    )

    prev_manifest = existing.get("manifest")
    if session.manifest is not None:
        prev_at = (prev_manifest or {}).get("captured_at") or ""
        if session.manifest.captured_at >= prev_at:
            record["manifest"] = session.manifest.model_dump(
                mode="json", exclude_none=True, by_alias=True
            )
        else:
            record["manifest"] = prev_manifest
    elif prev_manifest:
        record["manifest"] = prev_manifest

    obs = existing.get("observed") or {}
    record["observed"] = {
        "agents": sorted(set(obs.get("agents", [])) | set(record["observed"]["agents"])),
        "tools": sorted(set(obs.get("tools", [])) | set(record["observed"]["tools"])),
        "mcp_servers": sorted(
            set(obs.get("mcp_servers", [])) | set(record["observed"]["mcp_servers"])
        ),
        "delegations": _merge_delegations(
            obs.get("delegations", []), record["observed"]["delegations"]
        ),
    }
    return record


def _unique_tools(tools_by_agent: dict[str, list[str]]) -> list[str]:
    out: set[str] = set()
    for tools in tools_by_agent.values():
        out.update(tools)
    return sorted(out)


def _merge_delegations(existing: list, new: list) -> list:
    seen = {json.dumps(d, sort_keys=True) for d in existing}
    merged = list(existing)
    for item in new:
        key = json.dumps(item, sort_keys=True)
        if key not in seen:
            merged.append(item)
            seen.add(key)
    return merged
