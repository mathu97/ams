import asyncio
import json
from urllib.parse import quote

from ams import EventType, Tracer
from ams.manifest.claude import extract_manifest_from_claude
from ams.schema import Agent, DelegationKind, ToolKind
from ams.storage.local import LocalStorage
from tests.fakes import RecordingStorage


def test_compute_topology_from_subagent_session():
    tracer = Tracer(
        storage=RecordingStorage(),
        agent=Agent(name="research-lead", version="0.1"),
    )
    tracer.set_manifest(
        extract_manifest_from_claude(
            {
                "model": "haiku",
                "allowed_tools": ["Task"],
                "agents": {"researcher": {"tools": ["Read"]}},
            },
            redact=False,
            root_name="research-lead",
        )
    )

    async def run_hooks():
        await tracer._hook(
            {
                "hook_event_name": "PreToolUse",
                "session_id": "s1",
                "tool_name": "Task",
                "tool_use_id": "task1",
                "tool_input": {"subagent_type": "researcher", "prompt": "go"},
            },
            "task1",
            None,
        )
        await tracer._hook(
            {
                "hook_event_name": "SubagentStart",
                "session_id": "s1",
                "agent_id": "ag1",
                "agent_type": "researcher",
            },
            None,
            None,
        )
        await tracer._hook(
            {
                "hook_event_name": "PreToolUse",
                "session_id": "s1",
                "tool_name": "Read",
                "tool_use_id": "r1",
                "tool_input": {},
                "agent_id": "ag1",
            },
            "r1",
            None,
        )

    asyncio.run(run_hooks())
    session = tracer.finish()

    assert session.schema_version == "1.1"
    assert session.manifest is not None
    assert session.topology is not None
    assert "research-lead" in session.topology.agents_used
    assert "researcher" in session.topology.agents_used
    assert session.topology.tools_by_agent["researcher"] == ["Read"]
    assert len(session.topology.delegation_edges) == 1
    edge = session.topology.delegation_edges[0]
    assert edge.kind == DelegationKind.INVOKE
    assert edge.trigger_tool_use_id == "task1"

    sub = next(e for e in session.events if e.type == EventType.SUBAGENT)
    assert sub.subagent.spawn_tool_use_id == "task1"
    assert sub.scope == "agent:researcher"

    task = next(e for e in session.events if e.tool and e.tool.name == "Task")
    assert task.tool.kind == ToolKind.AGENT

    summary = session.summary()
    assert "topology_summary" in summary
    assert "researcher" in summary["topology_summary"]["agents_declared"]


def test_index_and_registry_written(tmp_path):
    storage = LocalStorage(root=str(tmp_path))
    tracer = Tracer(storage=storage, agent=Agent(name="research-lead"))
    tracer.set_manifest(
        extract_manifest_from_claude(
            {"allowed_tools": ["Task"], "agents": {"researcher": {"tools": ["Read"]}}},
            redact=False,
            root_name="research-lead",
        )
    )
    session = tracer.finish()
    assert session is not None

    index = tmp_path / "index" / f"{session.session_id}.json"
    assert index.exists()
    index_data = json.loads(index.read_text())
    assert index_data["schema_version"] == "1.1"
    assert "topology_summary" in index_data

    registry = tmp_path / "agents" / f"{quote('research-lead', safe='')}.json"
    assert registry.exists()
    reg = json.loads(registry.read_text())
    assert reg["session_count"] == 1
    assert "research-lead" in reg["observed"]["agents"]
