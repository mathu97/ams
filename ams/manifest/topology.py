"""Observed topology rollup from session events."""

from __future__ import annotations

from typing import Optional

from ..schema import (
    Agent,
    DelegationEdge,
    DelegationKind,
    Event,
    EventType,
    Manifest,
    McpToolUsage,
    Status,
    ToolKind,
    Topology,
)


def agent_scope(name: str) -> str:
    return f"agent:{name}"


def scope_agent_name(scope: Optional[str]) -> Optional[str]:
    if scope and scope.startswith("agent:"):
        return scope[6:]
    if scope == "orchestrator":
        return None
    if scope and scope.startswith("subagent:"):
        return scope[9:]
    return None


def root_agent_name(agent: Agent) -> str:
    return agent.name or "orchestrator"


def compute_topology(
    events: list[Event],
    *,
    agent: Agent,
    manifest: Optional[Manifest] = None,
) -> Topology:
    root = root_agent_name(agent)
    events_by_id = {e.id: e for e in events}

    agents_used: set[str] = set()
    tools_by_agent: dict[str, set[str]] = {}
    mcp_counts: dict[tuple[str, str], list[int]] = {}
    models_by_agent: dict[str, str] = {}
    delegation_edges: list[DelegationEdge] = []
    errors_by_agent: dict[str, int] = {}

    def bucket(scope: str) -> None:
        name = scope_agent_name(scope) or root
        agents_used.add(name)

    def add_tool(scope: str, tool_name: str) -> None:
        name = scope_agent_name(scope) or root
        agents_used.add(name)
        tools_by_agent.setdefault(name, set()).add(tool_name)

    def add_error(scope: Optional[str]) -> None:
        name = scope_agent_name(scope) or root
        errors_by_agent[name] = errors_by_agent.get(name, 0) + 1

    agents_used.add(root)

    for event in events:
        scope = event.scope or agent_scope(root)

        if event.status == Status.ERROR:
            add_error(scope)

        if event.type == EventType.USER_PROMPT:
            bucket(agent_scope(root))
            continue

        if event.type == EventType.LLM_MESSAGE and event.llm:
            bucket(scope)
            if event.llm.model:
                name = scope_agent_name(scope) or root
                models_by_agent.setdefault(name, event.llm.model)
            continue

        if event.type == EventType.SUBAGENT and event.subagent:
            child = event.subagent.target_agent or event.subagent.agent_type or "agent"
            agents_used.add(child)
            child_scope = agent_scope(child)
            bucket(child_scope)

            from_name = scope_agent_name(event.scope) or root
            kind = (
                DelegationKind.HANDOFF
                if event.subagent.delegation_kind == DelegationKind.HANDOFF
                else DelegationKind.INVOKE
            )
            delegation_edges.append(
                DelegationEdge(
                    from_agent=from_name,
                    to_agent=child,
                    kind=kind,
                    trigger_tool_use_id=event.subagent.spawn_tool_use_id,
                    subagent_event_id=event.id,
                    status=Status.ERROR if event.status == Status.ERROR else Status.OK,
                )
            )
            continue

        if event.type == EventType.TOOL_CALL and event.tool:
            tool = event.tool
            if tool.kind == ToolKind.AGENT:
                continue

            resolved_scope = scope
            if event.parent_id and event.parent_id in events_by_id:
                parent = events_by_id[event.parent_id]
                if parent.subagent and parent.subagent.agent_type:
                    resolved_scope = agent_scope(parent.subagent.agent_type)

            add_tool(resolved_scope, tool.name)

            if tool.kind == ToolKind.MCP and tool.mcp_server and tool.mcp_tool:
                key = (tool.mcp_server, tool.mcp_tool)
                counts = mcp_counts.setdefault(key, [0, 0])
                counts[0] += 1
                if event.status == Status.ERROR or tool.is_error:
                    counts[1] += 1

    mcp_tools_used = [
        McpToolUsage(server=s, tool=t, calls=c, errors=e)
        for (s, t), (c, e) in sorted(mcp_counts.items())
    ]

    return Topology(
        agents_used=sorted(agents_used),
        tools_by_agent={k: sorted(v) for k, v in sorted(tools_by_agent.items())},
        mcp_tools_used=mcp_tools_used,
        models_by_agent=models_by_agent,
        delegation_edges=delegation_edges,
        errors_by_agent=errors_by_agent,
    )


def topology_summary(
    topology: Optional[Topology],
    manifest: Optional[Manifest],
) -> Optional[dict]:
    if topology is None and manifest is None:
        return None

    agents_declared: list[str] = []
    mcp_servers: list[str] = []
    graph_source = manifest.source.value if manifest else None

    if manifest:
        for node in manifest.graph.nodes:
            if node.kind == "agent":
                agents_declared.append(node.name)
            elif node.kind == "mcp_server":
                mcp_servers.append(node.name)

    if topology is None:
        return {
            "graph_source": graph_source,
            "agents_declared": sorted(set(agents_declared)),
            "agents_used": [],
            "tools_by_agent": {},
            "mcp_servers": sorted(set(mcp_servers)),
            "delegations": [],
        }

    delegations = [
        {
            "from": e.from_agent,
            "to": e.to_agent,
            "kind": e.kind.value,
        }
        for e in topology.delegation_edges
    ]

    return {
        "graph_source": graph_source,
        "agents_declared": sorted(set(agents_declared)),
        "agents_used": topology.agents_used,
        "tools_by_agent": topology.tools_by_agent,
        "mcp_servers": sorted(set(mcp_servers)),
        "delegations": delegations,
    }
