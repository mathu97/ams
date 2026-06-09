"""Build an AgentGraph manifest from Claude Agent SDK options."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any, Optional

from ..redact import redact as _redact
from ..schema import AgentGraph, GraphEdge, GraphEdgeKind, GraphNode, Manifest, ManifestSource

_PREVIEW_LEN = 500


def _attr(obj: Any, name: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _prompt_fields(text: Optional[str], *, redact: bool) -> tuple[Optional[str], Optional[str]]:
    if not text:
        return None, None
    cleaned = _redact(text) if redact else text
    preview = None if redact else cleaned[:_PREVIEW_LEN]
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return preview, digest


def extract_manifest_from_claude(
    options: Any,
    *,
    redact: bool,
    root_name: Optional[str] = None,
) -> Manifest:
    """Introspect ClaudeAgentOptions. Never raises — partial manifest on failure."""
    try:
        return _build(options, redact=redact, root_name=root_name)
    except Exception:
        return Manifest(
            source=ManifestSource.CLAUDE_AGENT_SDK,
            captured_at=datetime.now(timezone.utc).isoformat(),
            graph=AgentGraph(
                root_id="root",
                nodes=[
                    GraphNode(
                        id="root",
                        kind="agent",
                        role="root",
                        name=root_name or "orchestrator",
                    )
                ],
                edges=[],
            ),
        )


def _build(options: Any, *, redact: bool, root_name: Optional[str]) -> Manifest:
    root_label = root_name or "orchestrator"
    preview, prompt_hash = _prompt_fields(_attr(options, "system_prompt"), redact=redact)

    root = GraphNode(
        id="root",
        kind="agent",
        role="root",
        name=root_label,
        model=_attr(options, "model"),
        tools=list(_attr(options, "allowed_tools") or []),
        instructions_preview=preview,
        instructions_hash=prompt_hash,
    )

    nodes: list[GraphNode] = [root]
    edges: list[GraphEdge] = []

    for tool in root.tools or []:
        edges.append(
            GraphEdge(from_node="root", to_node=tool, kind=GraphEdgeKind.TOOL, label=tool)
        )

    agents = _attr(options, "agents") or {}
    if isinstance(agents, dict):
        for agent_type, definition in agents.items():
            node_id = str(agent_type)
            sub_preview, sub_hash = _prompt_fields(
                _attr(definition, "prompt"), redact=redact
            )
            child = GraphNode(
                id=node_id,
                kind="agent",
                role="child",
                name=node_id,
                model=_attr(definition, "model"),
                description=_attr(definition, "description"),
                tools=list(_attr(definition, "tools") or []),
                instructions_preview=sub_preview,
                instructions_hash=sub_hash,
            )
            nodes.append(child)
            edges.append(
                GraphEdge(
                    from_node="root",
                    to_node=node_id,
                    kind=GraphEdgeKind.INVOKE,
                    label="Task",
                )
            )
            for tool in child.tools or []:
                edges.append(
                    GraphEdge(
                        from_node=node_id,
                        to_node=tool,
                        kind=GraphEdgeKind.TOOL,
                        label=tool,
                    )
                )

    mcp_servers = _attr(options, "mcp_servers") or []
    if isinstance(mcp_servers, list):
        for idx, server in enumerate(mcp_servers):
            server_name = _attr(server, "name") or f"mcp_{idx}"
            node_id = f"mcp:{server_name}"
            nodes.append(
                GraphNode(
                    id=node_id,
                    kind="mcp_server",
                    name=server_name,
                    transport=_attr(server, "transport"),
                    command=_attr(server, "command"),
                    args=_clean_args(_attr(server, "args"), redact=redact),
                    url=_attr(server, "url"),
                )
            )
            edges.append(
                GraphEdge(from_node="root", to_node=node_id, kind=GraphEdgeKind.MCP)
            )

    return Manifest(
        source=ManifestSource.CLAUDE_AGENT_SDK,
        captured_at=datetime.now(timezone.utc).isoformat(),
        graph=AgentGraph(root_id="root", nodes=nodes, edges=edges),
    )


def _clean_args(args: Any, *, redact: bool) -> Optional[list[str]]:
    if not args:
        return None
    if not isinstance(args, list):
        return None
    if redact:
        return [_redact(str(a)) for a in args]
    return [str(a) for a in args]
