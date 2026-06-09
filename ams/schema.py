"""The AMS session schema. This file is the data contract.

One session = one JSON object. The shape is deliberately flat and typed so a
session is easy to read by a human and easy to filter by a machine. Field names
are aligned with the OpenTelemetry GenAI semantic conventions (`gen_ai.*`) where
a natural equivalent exists, so the data can later be re-emitted as OTLP without
renaming. See docs/schema.md.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

SCHEMA_VERSION = "1.1"


class ManifestSource(str, Enum):
    CLAUDE_AGENT_SDK = "claude_agent_sdk"
    OPENAI_AGENTS = "openai_agents"
    MANUAL = "manual"


class GraphEdgeKind(str, Enum):
    TOOL = "tool"
    HANDOFF = "handoff"
    INVOKE = "invoke"
    MCP = "mcp"


class ToolKind(str, Enum):
    BUILTIN = "builtin"
    FUNCTION = "function"
    MCP = "mcp"
    HOSTED = "hosted"
    AGENT = "agent"
    CUSTOM = "custom"


class McpProvider(str, Enum):
    LOCAL = "local"
    HOSTED = "hosted"


class DelegationKind(str, Enum):
    INVOKE = "invoke"
    HANDOFF = "handoff"


class EventType(str, Enum):
    USER_PROMPT = "user_prompt"
    LLM_MESSAGE = "llm_message"
    TOOL_CALL = "tool_call"
    SUBAGENT = "subagent"
    NOTIFICATION = "notification"
    COMPACTION = "compaction"
    ERROR = "error"


class Status(str, Enum):
    OK = "ok"
    ERROR = "error"
    RUNNING = "running"


class Usage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0

    def add(self, other: "Usage") -> "Usage":
        return Usage(
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
            cache_read_input_tokens=self.cache_read_input_tokens
            + other.cache_read_input_tokens,
            cache_creation_input_tokens=self.cache_creation_input_tokens
            + other.cache_creation_input_tokens,
        )

    @classmethod
    def from_sdk(cls, usage: Optional[dict[str, Any]]) -> "Usage":
        usage = usage or {}
        return cls(
            input_tokens=usage.get("input_tokens", 0) or 0,
            output_tokens=usage.get("output_tokens", 0) or 0,
            cache_read_input_tokens=usage.get("cache_read_input_tokens", 0) or 0,
            cache_creation_input_tokens=usage.get("cache_creation_input_tokens", 0) or 0,
        )


class LLMDetail(BaseModel):
    model: Optional[str] = None
    stop_reason: Optional[str] = None
    text: Optional[str] = None
    thinking: Optional[str] = None
    message_id: Optional[str] = None
    usage: Optional[Usage] = None


class ToolDetail(BaseModel):
    name: str
    kind: ToolKind = ToolKind.BUILTIN
    tool_use_id: Optional[str] = None
    input: Any = None
    result: Any = None
    is_error: bool = False
    mcp_server: Optional[str] = None
    mcp_tool: Optional[str] = None
    mcp_provider: Optional[McpProvider] = None


class SubagentDetail(BaseModel):
    agent_id: str
    agent_type: Optional[str] = None
    transcript_path: Optional[str] = None
    invocation_prompt: Optional[str] = None
    invocation_event_id: Optional[str] = None
    usage: Optional[Usage] = None
    delegation_kind: DelegationKind = DelegationKind.INVOKE
    spawn_tool_use_id: Optional[str] = None
    target_agent: Optional[str] = None


class ErrorDetail(BaseModel):
    type: Optional[str] = None
    message: Optional[str] = None


class Event(BaseModel):
    id: str
    seq: int
    parent_id: Optional[str] = None
    type: EventType
    name: str
    start_time: str
    end_time: Optional[str] = None
    duration_ms: Optional[int] = None
    status: Status = Status.OK
    scope: Optional[str] = None
    agent_id: Optional[str] = None

    prompt: Optional[str] = None
    llm: Optional[LLMDetail] = None
    tool: Optional[ToolDetail] = None
    subagent: Optional[SubagentDetail] = None
    error: Optional[ErrorDetail] = None
    note: Optional[str] = None


class Totals(BaseModel):
    usage: Usage = Field(default_factory=Usage)
    cost_usd: Optional[float] = None
    llm_calls: int = 0
    tool_calls: int = 0
    subagents: int = 0
    errors: int = 0
    num_turns: Optional[int] = None
    duration_ms: Optional[int] = None
    duration_api_ms: Optional[int] = None


class Agent(BaseModel):
    name: Optional[str] = None
    version: Optional[str] = None


class GraphNode(BaseModel):
    id: str
    kind: str  # agent | mcp_server | tool_group
    name: str
    role: Optional[str] = None  # root | child
    model: Optional[str] = None
    description: Optional[str] = None
    tools: list[str] = Field(default_factory=list)
    instructions_preview: Optional[str] = None
    instructions_hash: Optional[str] = None
    transport: Optional[str] = None
    command: Optional[str] = None
    args: Optional[list[str]] = None
    url: Optional[str] = None


class GraphEdge(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_node: str = Field(alias="from")
    to_node: str = Field(alias="to")
    kind: GraphEdgeKind
    label: Optional[str] = None


class AgentGraph(BaseModel):
    root_id: str
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)


class Manifest(BaseModel):
    source: ManifestSource
    captured_at: str
    source_version: Optional[str] = None
    graph: AgentGraph
    raw: Optional[dict[str, Any]] = None


class McpToolUsage(BaseModel):
    server: str
    tool: str
    calls: int = 0
    errors: int = 0


class DelegationEdge(BaseModel):
    from_agent: str
    to_agent: str
    kind: DelegationKind
    trigger_tool_use_id: Optional[str] = None
    subagent_event_id: Optional[str] = None
    status: Status = Status.OK


class Topology(BaseModel):
    agents_used: list[str] = Field(default_factory=list)
    tools_by_agent: dict[str, list[str]] = Field(default_factory=dict)
    mcp_tools_used: list[McpToolUsage] = Field(default_factory=list)
    models_by_agent: dict[str, str] = Field(default_factory=dict)
    delegation_edges: list[DelegationEdge] = Field(default_factory=list)
    errors_by_agent: dict[str, int] = Field(default_factory=dict)


class Session(BaseModel):
    schema_version: str = SCHEMA_VERSION
    session_id: str
    trace_id: str
    agent: Agent = Field(default_factory=Agent)
    environment: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    start_time: str
    end_time: Optional[str] = None
    duration_ms: Optional[int] = None
    status: Status = Status.OK

    manifest: Optional[Manifest] = None
    topology: Optional[Topology] = None

    totals: Totals = Field(default_factory=Totals)
    events: list[Event] = Field(default_factory=list)

    def summary(self) -> dict[str, Any]:
        """A compact, filterable record for a sessions index — no payloads."""
        from .manifest.topology import topology_summary as _topology_summary

        out: dict[str, Any] = {
            "schema_version": self.schema_version,
            "session_id": self.session_id,
            "trace_id": self.trace_id,
            "agent": self.agent.model_dump(exclude_none=True),
            "environment": self.environment,
            "tags": self.tags,
            "metadata": self.metadata,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration_ms": self.duration_ms,
            "status": self.status.value,
            "input_tokens": self.totals.usage.input_tokens,
            "output_tokens": self.totals.usage.output_tokens,
            "cost_usd": self.totals.cost_usd,
            "llm_calls": self.totals.llm_calls,
            "tool_calls": self.totals.tool_calls,
            "subagents": self.totals.subagents,
            "errors": self.totals.errors,
        }
        topo = _topology_summary(self.topology, self.manifest)
        if topo is not None:
            out["topology_summary"] = topo
        return out
