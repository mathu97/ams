"""Tiny stand-ins for the Claude Agent SDK message/block types. AMS dispatches
on `type(obj).__name__`, so these just need matching class names and fields."""

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class TextBlock:
    text: str


@dataclass
class ThinkingBlock:
    thinking: str
    signature: str = ""


@dataclass
class ToolUseBlock:
    id: str
    name: str
    input: dict


@dataclass
class AssistantMessage:
    content: list
    model: str = "claude-opus-4-8"
    parent_tool_use_id: Optional[str] = None
    usage: Optional[dict] = None
    message_id: Optional[str] = None
    stop_reason: Optional[str] = None
    session_id: Optional[str] = None


@dataclass
class ResultMessage:
    duration_ms: int = 1000
    duration_api_ms: int = 800
    is_error: bool = False
    num_turns: int = 1
    session_id: str = "sess-1"
    total_cost_usd: Optional[float] = 0.05
    usage: Optional[dict] = None
    subtype: str = "success"


class RecordingStorage:
    def __init__(self):
        self.sessions = []

    def put_session(self, session) -> str:
        self.sessions.append(session)
        return f"memory://{session.session_id}"
