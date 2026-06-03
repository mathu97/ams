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

from pydantic import BaseModel, Field

SCHEMA_VERSION = "1.0"


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
    tool_use_id: Optional[str] = None
    input: Any = None
    result: Any = None
    is_error: bool = False


class SubagentDetail(BaseModel):
    agent_id: str
    agent_type: Optional[str] = None
    transcript_path: Optional[str] = None
    invocation_prompt: Optional[str] = None
    invocation_event_id: Optional[str] = None
    usage: Optional[Usage] = None


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

    totals: Totals = Field(default_factory=Totals)
    events: list[Event] = Field(default_factory=list)

    def summary(self) -> dict[str, Any]:
        """A compact, filterable record for a sessions index — no payloads."""
        return {
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
