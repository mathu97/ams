"""AMS — a super simple monitoring system for Claude agents.

Capture a whole Claude Agent SDK session end to end — every tool call, every
subagent and why it was invoked, the model's reasoning, results, timing and
cost — as one readable JSON object in blob storage.

    from ams.claude import traced_query

    async for message in traced_query(prompt="...", options=options):
        ...
"""

from .schema import (
    SCHEMA_VERSION,
    Agent,
    DelegationKind,
    Event,
    EventType,
    GraphEdge,
    GraphEdgeKind,
    GraphNode,
    AgentGraph,
    Manifest,
    ManifestSource,
    Session,
    Status,
    ToolKind,
    Topology,
    Totals,
    Usage,
)
from .tracer import Tracer

__version__ = "0.2.0"

__all__ = [
    "Tracer",
    "Session",
    "Event",
    "EventType",
    "Status",
    "Totals",
    "Usage",
    "Agent",
    "Manifest",
    "AgentGraph",
    "GraphNode",
    "GraphEdge",
    "GraphEdgeKind",
    "ManifestSource",
    "Topology",
    "ToolKind",
    "DelegationKind",
    "SCHEMA_VERSION",
    "__version__",
]
