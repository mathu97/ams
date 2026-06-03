import asyncio

from ams import EventType, Status, Tracer
from ams.schema import Usage
from tests.fakes import (
    AssistantMessage,
    RecordingStorage,
    ResultMessage,
    TextBlock,
    ThinkingBlock,
)


def _pre(tool, tid, **extra):
    return {
        "hook_event_name": "PreToolUse",
        "session_id": "sess-1",
        "tool_name": tool,
        "tool_input": extra.get("tool_input", {}),
        "tool_use_id": tid,
        **{k: v for k, v in extra.items() if k != "tool_input"},
    }


def _post(tool, tid, response):
    return {
        "hook_event_name": "PostToolUse",
        "session_id": "sess-1",
        "tool_name": tool,
        "tool_input": {},
        "tool_response": response,
        "tool_use_id": tid,
    }


def run(coro):
    return asyncio.run(coro)


def test_tool_call_captured_with_timing_and_result():
    storage = RecordingStorage()
    t = Tracer(storage=storage)
    run(t._hook(_pre("Bash", "t1", tool_input={"command": "ls"}), "t1", None))
    run(t._hook(_post("Bash", "t1", "file1\nfile2"), "t1", None))
    session = t.finish()

    tool_events = [e for e in session.events if e.type == EventType.TOOL_CALL]
    assert len(tool_events) == 1
    ev = tool_events[0]
    assert ev.tool.name == "Bash"
    assert ev.tool.input == {"command": "ls"}
    assert ev.tool.result == "file1\nfile2"
    assert ev.status == Status.OK
    assert ev.duration_ms is not None
    assert session.totals.tool_calls == 1


def test_tool_failure_marks_error_and_counts():
    t = Tracer(storage=RecordingStorage())
    run(t._hook(_pre("Bash", "t1"), "t1", None))
    run(
        t._hook(
            {
                "hook_event_name": "PostToolUseFailure",
                "session_id": "sess-1",
                "tool_name": "Bash",
                "tool_input": {},
                "tool_use_id": "t1",
                "error": "command not found",
            },
            "t1",
            None,
        )
    )
    session = t.finish()
    ev = next(e for e in session.events if e.type == EventType.TOOL_CALL)
    assert ev.status == Status.ERROR
    assert ev.tool.is_error is True
    assert ev.error.message == "command not found"
    assert session.totals.errors == 1
    assert session.status == Status.ERROR


def test_subagent_nests_child_tools_and_links_invocation():
    t = Tracer(storage=RecordingStorage())
    # Parent issues a Task tool call (the "why" — prompt is captured)
    run(
        t._hook(
            _pre(
                "Task",
                "task1",
                tool_input={
                    "subagent_type": "researcher",
                    "description": "research X",
                    "prompt": "Go research topic X thoroughly.",
                },
            ),
            "task1",
            None,
        )
    )
    # Subagent starts
    run(
        t._hook(
            {
                "hook_event_name": "SubagentStart",
                "session_id": "sess-1",
                "agent_id": "agent-1",
                "agent_type": "researcher",
            },
            None,
            None,
        )
    )
    # A tool call from inside the subagent (carries agent_id)
    run(t._hook(_pre("Read", "r1", agent_id="agent-1"), "r1", None))
    run(t._hook(_post("Read", "r1", "contents"), "r1", None))
    # Subagent stops
    run(
        t._hook(
            {
                "hook_event_name": "SubagentStop",
                "session_id": "sess-1",
                "agent_id": "agent-1",
                "agent_type": "researcher",
                "agent_transcript_path": "/tmp/agent-1.jsonl",
            },
            None,
            None,
        )
    )
    session = t.finish()

    sub = next(e for e in session.events if e.type == EventType.SUBAGENT)
    assert sub.subagent.agent_type == "researcher"
    assert sub.subagent.invocation_prompt == "Go research topic X thoroughly."
    assert sub.subagent.transcript_path == "/tmp/agent-1.jsonl"

    child = next(
        e for e in session.events if e.type == EventType.TOOL_CALL and e.tool.name == "Read"
    )
    assert child.parent_id == sub.id
    assert session.totals.subagents == 1


def test_assistant_message_captures_thinking_and_text():
    t = Tracer(storage=RecordingStorage())
    msg = AssistantMessage(
        content=[
            ThinkingBlock(thinking="I should call a tool."),
            TextBlock(text="Let me look that up."),
        ],
        usage={"input_tokens": 100, "output_tokens": 20},
    )
    t.record_message(msg)
    session = t.finish()
    llm = next(e for e in session.events if e.type == EventType.LLM_MESSAGE)
    assert llm.llm.thinking == "I should call a tool."
    assert llm.llm.text == "Let me look that up."
    assert llm.llm.usage.input_tokens == 100
    assert session.totals.llm_calls == 1


def test_capture_thinking_can_be_disabled():
    t = Tracer(storage=RecordingStorage(), capture_thinking=False)
    t.record_message(
        AssistantMessage(content=[ThinkingBlock(thinking="secret reasoning"), TextBlock(text="hi")])
    )
    session = t.finish()
    llm = next(e for e in session.events if e.type == EventType.LLM_MESSAGE)
    assert llm.llm.thinking is None
    assert llm.llm.text == "hi"


def test_result_message_drives_totals_and_is_written():
    storage = RecordingStorage()
    t = Tracer(storage=storage)
    t.record_message(
        ResultMessage(
            total_cost_usd=0.42,
            num_turns=3,
            usage={"input_tokens": 500, "output_tokens": 120},
        )
    )
    session = t.finish()
    assert session.totals.cost_usd == 0.42
    assert session.totals.num_turns == 3
    assert session.totals.usage.input_tokens == 500
    assert session.totals.duration_ms == 1000
    assert storage.sessions == [session]


def test_redaction_opt_in():
    t = Tracer(storage=RecordingStorage(), redact=True)
    run(t._hook(_pre("Bash", "t1", tool_input={"command": "echo me@example.com"}), "t1", None))
    run(t._hook(_post("Bash", "t1", "sent to me@example.com"), "t1", None))
    session = t.finish()
    ev = next(e for e in session.events if e.type == EventType.TOOL_CALL)
    assert "me@example.com" not in str(ev.tool.input)
    assert "[email]" in str(ev.tool.input)
    assert "[email]" in str(ev.tool.result)


def test_watch_passes_messages_through_and_finalizes():
    storage = RecordingStorage()
    t = Tracer(storage=storage)

    async def stream():
        yield AssistantMessage(content=[TextBlock(text="hi")], usage={"input_tokens": 1})
        yield ResultMessage(total_cost_usd=0.01)

    async def consume():
        seen = []
        async for m in t.watch(stream()):
            seen.append(type(m).__name__)
        return seen

    seen = run(consume())
    assert seen == ["AssistantMessage", "ResultMessage"]
    assert len(storage.sessions) == 1
    assert storage.sessions[0].totals.cost_usd == 0.01


def test_finish_is_idempotent():
    storage = RecordingStorage()
    t = Tracer(storage=storage)
    s1 = t.finish()
    s2 = t.finish()
    assert s1 is s2
    assert len(storage.sessions) == 1


def test_usage_from_sdk_handles_none():
    u = Usage.from_sdk(None)
    assert u.input_tokens == 0
