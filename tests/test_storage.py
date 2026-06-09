import json

from ams.schema import Agent, Event, EventType, Session, Status, Totals, Usage
from ams.storage.local import LocalStorage


def _session():
    return Session(
        session_id="sess-xyz",
        trace_id="trace-1",
        agent=Agent(name="demo", version="1.0"),
        environment="dev",
        tags=["a"],
        start_time="2026-06-03T14:22:01.000+00:00",
        end_time="2026-06-03T14:22:09.000+00:00",
        duration_ms=8000,
        status=Status.OK,
        totals=Totals(usage=Usage(input_tokens=10, output_tokens=5), cost_usd=0.01, tool_calls=1),
        events=[
            Event(
                id="e1",
                seq=1,
                type=EventType.USER_PROMPT,
                name="user_prompt",
                start_time="2026-06-03T14:22:01.000+00:00",
                prompt="hello",
            )
        ],
    )


def test_local_storage_writes_session_and_index(tmp_path):
    storage = LocalStorage(root=str(tmp_path))
    location = storage.put_session(_session())

    session_file = tmp_path / "sessions" / "2026" / "06" / "03" / "sess-xyz.json"
    index_file = tmp_path / "index" / "sess-xyz.json"
    assert session_file.exists()
    assert index_file.exists()
    assert str(session_file) == location

    full = json.loads(session_file.read_text())
    assert full["session_id"] == "sess-xyz"
    assert full["events"][0]["prompt"] == "hello"

    index = json.loads(index_file.read_text())
    assert index["session_id"] == "sess-xyz"
    assert index["cost_usd"] == 0.01
    assert index["tool_calls"] == 1
    assert "events" not in index
    assert index["schema_version"] == "1.1"


def test_summary_has_no_payloads():
    summary = _session().summary()
    assert set(["session_id", "cost_usd", "tool_calls", "status"]).issubset(summary)
    assert "events" not in summary
