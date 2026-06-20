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
    Activity,
    Agent,
    DelegationKind,
    Event,
    EventType,
    FacetMember,
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
from .emit import emit_activity
from .timeline import load_entity_timeline
from .tracer import Tracer

__version__ = "0.3.0"

__all__ = [
    "Tracer",
    "emit_activity",
    "load_entity_timeline",
    "Session",
    "Activity",
    "FacetMember",
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
