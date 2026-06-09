"""Tracer records one Claude Agent SDK session into one Session object.

It gets its data from two places, because no single source has all of it:

  * Hooks (PreToolUse / PostToolUse / SubagentStart / ... ) give every tool
    call, every subagent invocation, prompts, and their timing.
  * The message stream (AssistantMessage / ResultMessage) gives the model's
    reasoning (thinking blocks), assistant text, token usage and cost.

A Tracer instance is one session. Create a fresh one per run (or per
ClaudeSDKClient). See claude.py for the one-call `traced_query` wrapper.
"""

from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Optional

from . import pricing
from .redact import redact as _redact
from .schema import (
    Agent,
    DelegationKind,
    ErrorDetail,
    Event,
    EventType,
    LLMDetail,
    Manifest,
    SCHEMA_VERSION,
    Session,
    Status,
    SubagentDetail,
    ToolDetail,
    Totals,
    Usage,
)
from .manifest.tools import classify_tool
from .manifest.topology import agent_scope, compute_topology, root_agent_name

logger = logging.getLogger("ams")

_SUBAGENT_TOOLS = {"Task", "Agent"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _attr(obj: Any, name: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


class Tracer:
    def __init__(
        self,
        storage=None,
        *,
        agent: Optional[Agent] = None,
        environment: Optional[str] = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict[str, Any]] = None,
        redact: Optional[bool] = None,
        capture_thinking: bool = True,
    ):
        self._storage = storage
        self.agent = agent or Agent()
        self.environment = environment
        self.tags = tags or []
        self.metadata = metadata or {}
        if redact is None:
            import os

            redact = os.environ.get("AMS_REDACT", "").lower() in ("1", "true", "yes")
        self.redact = redact
        self.capture_thinking = capture_thinking

        self.trace_id = uuid.uuid4().hex
        self.session_id: Optional[str] = None
        self.start_time = _now_iso()
        self._t0 = time.monotonic()

        self._events: list[Event] = []
        self._seq = 0
        self._open_tools: dict[str, tuple[Event, float]] = {}
        self._open_subagents: dict[str, Event] = {}
        self._pending_invocations: list[Event] = []
        self._result: Optional[Any] = None
        self._finished: Optional[Session] = None
        self._manifest: Optional[Manifest] = None

    def set_manifest(self, manifest: Manifest) -> None:
        """Attach declared agent topology captured at session start."""
        self._manifest = manifest

    @property
    def manifest(self) -> Optional[Manifest]:
        return self._manifest

    def _root_scope(self) -> str:
        return agent_scope(root_agent_name(self.agent))

    def _scope_for_agent_id(self, agent_id: Optional[str]) -> str:
        if agent_id and agent_id in self._open_subagents:
            sub = self._open_subagents[agent_id]
            if sub.subagent and sub.subagent.agent_type:
                return agent_scope(sub.subagent.agent_type)
        return self._root_scope()

    @property
    def storage(self):
        if self._storage is None:
            from .storage import from_env

            self._storage = from_env()
        return self._storage

    # ---- helpers -----------------------------------------------------------

    def _next_seq(self) -> int:
        self._seq += 1
        return self._seq

    def _clean(self, value: Any) -> Any:
        return _redact(value) if self.redact else value

    def _see_session_id(self, obj: Any) -> None:
        if self.session_id is None:
            sid = _attr(obj, "session_id")
            if sid:
                self.session_id = sid

    # ---- hooks -------------------------------------------------------------

    def hooks(self) -> dict[str, list[Any]]:
        """Hook config to merge into ClaudeAgentOptions(hooks=...).

        Captures tool calls, subagents and prompts. Pair with `watch()` (or
        feed messages to `record_message`) to also capture reasoning and cost.
        """
        from claude_agent_sdk import HookMatcher

        events = [
            "PreToolUse",
            "PostToolUse",
            "PostToolUseFailure",
            "SubagentStart",
            "SubagentStop",
            "UserPromptSubmit",
            "Notification",
        ]
        return {name: [HookMatcher(hooks=[self._hook])] for name in events}

    async def _hook(self, hook_input: Any, tool_use_id: Optional[str], context: Any):
        try:
            self._see_session_id(hook_input)
            name = _attr(hook_input, "hook_event_name")
            handler = {
                "PreToolUse": self._on_pre_tool,
                "PostToolUse": self._on_post_tool,
                "PostToolUseFailure": self._on_tool_failure,
                "SubagentStart": self._on_subagent_start,
                "SubagentStop": self._on_subagent_stop,
                "UserPromptSubmit": self._on_user_prompt,
                "Notification": self._on_notification,
            }.get(name)
            if handler:
                handler(hook_input)
        except Exception:  # never let monitoring break the agent
            logger.exception("ams: hook recording failed")
        return {}

    def _on_pre_tool(self, hi: Any) -> None:
        tool_name = _attr(hi, "tool_name", "")
        tool_use_id = _attr(hi, "tool_use_id")
        agent_id = _attr(hi, "agent_id")
        parent = self._open_subagents.get(agent_id) if agent_id else None
        classified = classify_tool(tool_name, self._manifest)
        scope = self._scope_for_agent_id(agent_id)
        event = Event(
            id=uuid.uuid4().hex,
            seq=self._next_seq(),
            parent_id=parent.id if parent else None,
            type=EventType.TOOL_CALL,
            name=f"tool:{tool_name}",
            start_time=_now_iso(),
            status=Status.RUNNING,
            scope=scope,
            agent_id=agent_id,
            tool=classified.model_copy(
                update={
                    "tool_use_id": tool_use_id,
                    "input": self._clean(_attr(hi, "tool_input")),
                }
            ),
        )
        if tool_name in _SUBAGENT_TOOLS:
            ti = _attr(hi, "tool_input") or {}
            event.note = "subagent invocation"
            event.tool.input = self._clean(ti)
            self._pending_invocations.append(event)
        if tool_use_id:
            self._open_tools[tool_use_id] = (event, time.monotonic())
        self._events.append(event)

    def _close_tool(self, hi: Any) -> Optional[tuple[Event, float]]:
        tool_use_id = _attr(hi, "tool_use_id")
        return self._open_tools.pop(tool_use_id, None) if tool_use_id else None

    def _on_post_tool(self, hi: Any) -> None:
        found = self._close_tool(hi)
        if not found:
            return
        event, t0 = found
        event.end_time = _now_iso()
        event.duration_ms = int((time.monotonic() - t0) * 1000)
        event.status = Status.OK
        if event.tool:
            event.tool.result = self._clean(_attr(hi, "tool_response"))

    def _on_tool_failure(self, hi: Any) -> None:
        found = self._close_tool(hi)
        if not found:
            return
        event, t0 = found
        event.end_time = _now_iso()
        event.duration_ms = int((time.monotonic() - t0) * 1000)
        event.status = Status.ERROR
        if event.tool:
            event.tool.is_error = True
        event.error = ErrorDetail(type="tool_error", message=_attr(hi, "error"))

    def _on_subagent_start(self, hi: Any) -> None:
        agent_id = _attr(hi, "agent_id")
        agent_type = _attr(hi, "agent_type")
        invocation = self._pop_invocation(agent_type)
        detail = SubagentDetail(
            agent_id=agent_id,
            agent_type=agent_type,
            delegation_kind=DelegationKind.INVOKE,
            target_agent=agent_type,
        )
        if invocation:
            detail.invocation_event_id = invocation.id
            if invocation.tool:
                detail.spawn_tool_use_id = invocation.tool.tool_use_id
            ti = invocation.tool.input if invocation.tool else None
            if isinstance(ti, dict):
                detail.invocation_prompt = ti.get("prompt") or ti.get("description")
        child_scope = agent_scope(agent_type or "agent")
        event = Event(
            id=uuid.uuid4().hex,
            seq=self._next_seq(),
            type=EventType.SUBAGENT,
            name=f"subagent:{agent_type or 'agent'}",
            start_time=_now_iso(),
            status=Status.RUNNING,
            scope=child_scope,
            agent_id=agent_id,
            subagent=detail,
        )
        if agent_id:
            self._open_subagents[agent_id] = event
        self._events.append(event)

    def _pop_invocation(self, agent_type: Optional[str]) -> Optional[Event]:
        for i, ev in enumerate(self._pending_invocations):
            ti = ev.tool.input if ev.tool else None
            if isinstance(ti, dict) and ti.get("subagent_type") == agent_type:
                return self._pending_invocations.pop(i)
        return self._pending_invocations.pop(0) if self._pending_invocations else None

    def _on_subagent_stop(self, hi: Any) -> None:
        agent_id = _attr(hi, "agent_id")
        event = self._open_subagents.pop(agent_id, None) if agent_id else None
        if not event or not event.subagent:
            return
        event.end_time = _now_iso()
        if event.start_time and event.end_time:
            event.status = Status.OK
        event.subagent.transcript_path = _attr(hi, "agent_transcript_path")

    def _on_user_prompt(self, hi: Any) -> None:
        ts = _now_iso()
        self._events.append(
            Event(
                id=uuid.uuid4().hex,
                seq=self._next_seq(),
                type=EventType.USER_PROMPT,
                name="user_prompt",
                start_time=ts,
                end_time=ts,
                scope=self._root_scope(),
                prompt=self._clean(_attr(hi, "prompt")),
            )
        )

    def _on_notification(self, hi: Any) -> None:
        ts = _now_iso()
        self._events.append(
            Event(
                id=uuid.uuid4().hex,
                seq=self._next_seq(),
                type=EventType.NOTIFICATION,
                name="notification",
                start_time=ts,
                end_time=ts,
                scope=self._root_scope(),
                note=_attr(hi, "message"),
            )
        )

    # ---- message stream ----------------------------------------------------

    def record_message(self, msg: Any) -> None:
        """Record one streamed message. Never raises — failures are logged so
        monitoring can never abort the host agent's loop."""
        try:
            self._see_session_id(msg)
            kind = type(msg).__name__
            if kind == "AssistantMessage":
                self._on_assistant(msg)
            elif kind == "ResultMessage":
                self._result = msg
        except Exception:
            logger.exception("ams: message recording failed")

    def _on_assistant(self, msg: Any) -> None:
        text_parts: list[str] = []
        thinking_parts: list[str] = []
        for block in _attr(msg, "content", []) or []:
            block_kind = type(block).__name__
            if block_kind == "TextBlock":
                text_parts.append(_attr(block, "text", "") or "")
            elif block_kind == "ThinkingBlock" and self.capture_thinking:
                thinking_parts.append(_attr(block, "thinking", "") or "")
        text = "\n".join(p for p in text_parts if p) or None
        thinking = "\n".join(p for p in thinking_parts if p) or None
        if text is None and thinking is None and _attr(msg, "usage") is None:
            return
        usage = Usage.from_sdk(_attr(msg, "usage"))
        ts = _now_iso()
        self._events.append(
            Event(
                id=uuid.uuid4().hex,
                seq=self._next_seq(),
                type=EventType.LLM_MESSAGE,
                name="assistant",
                start_time=ts,
                end_time=ts,
                scope=self._scope_for_agent_id(_attr(msg, "agent_id")),
                agent_id=_attr(msg, "agent_id"),
                llm=LLMDetail(
                    model=_attr(msg, "model"),
                    stop_reason=_attr(msg, "stop_reason"),
                    text=self._clean(text) if text else None,
                    thinking=self._clean(thinking) if thinking else None,
                    message_id=_attr(msg, "message_id"),
                    usage=usage,
                ),
            )
        )

    async def watch(self, stream: AsyncIterator[Any]) -> AsyncIterator[Any]:
        """Pass messages through unchanged while recording them; finalize at end."""
        try:
            async for msg in stream:
                self.record_message(msg)
                yield msg
        finally:
            self.finish()

    # ---- finalize ----------------------------------------------------------

    def finish(self, status: Optional[Status] = None) -> Optional[Session]:
        """Build and persist the session. Never raises — like any observability
        SDK, a failure here logs and is swallowed rather than propagating into
        the host agent. Returns the Session (None only if it couldn't be built).
        """
        if self._finished is not None:
            return self._finished

        try:
            events = sorted(self._events, key=lambda e: e.seq)
            totals = self._compute_totals(events)
            wall_ms = int((time.monotonic() - self._t0) * 1000)
            if status is None:
                errored = any(e.status == Status.ERROR for e in events)
                if self._result is not None and _attr(self._result, "is_error"):
                    errored = True
                status = Status.ERROR if errored else Status.OK

            session = Session(
                schema_version=SCHEMA_VERSION,
                session_id=self.session_id or self.trace_id,
                trace_id=self.trace_id,
                agent=self.agent,
                environment=self.environment,
                tags=self.tags,
                metadata=self.metadata,
                start_time=self.start_time,
                end_time=_now_iso(),
                duration_ms=totals.duration_ms or wall_ms,
                status=status,
                manifest=self._manifest,
                topology=compute_topology(
                    events, agent=self.agent, manifest=self._manifest
                ),
                totals=totals,
                events=events,
            )
            self._finished = session
        except Exception:
            logger.exception("ams: failed to build session")
            return None

        try:
            location = self.storage.put_session(session)
            logger.info("ams: wrote session %s -> %s", session.session_id, location)
        except Exception:
            logger.exception("ams: failed to persist session %s", session.session_id)
        return session

    def _compute_totals(self, events: list[Event]) -> Totals:
        totals = Totals()
        summed = Usage()
        fallback_cost = 0.0
        have_cost = False
        for e in events:
            if e.type == EventType.TOOL_CALL:
                totals.tool_calls += 1
            elif e.type == EventType.SUBAGENT:
                totals.subagents += 1
            elif e.type == EventType.LLM_MESSAGE and e.llm:
                totals.llm_calls += 1
                if e.llm.usage:
                    summed = summed.add(e.llm.usage)
                    c = pricing.cost_usd(e.llm.model, e.llm.usage)
                    if c is not None:
                        fallback_cost += c
                        have_cost = True
            if e.status == Status.ERROR:
                totals.errors += 1

        if self._result is not None:
            totals.usage = Usage.from_sdk(_attr(self._result, "usage"))
            totals.cost_usd = _attr(self._result, "total_cost_usd")
            totals.num_turns = _attr(self._result, "num_turns")
            totals.duration_ms = _attr(self._result, "duration_ms")
            totals.duration_api_ms = _attr(self._result, "duration_api_ms")
        else:
            totals.usage = summed
            totals.cost_usd = round(fallback_cost, 6) if have_cost else None
        return totals
