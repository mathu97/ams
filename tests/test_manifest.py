from ams.manifest.claude import extract_manifest_from_claude
from ams.manifest.tools import classify_tool, parse_mcp_tool_name
from ams.schema import Agent, ToolKind


def test_extract_manifest_from_claude_options():
    options = {
        "model": "haiku",
        "system_prompt": "You are the lead.",
        "allowed_tools": ["Task"],
        "agents": {
            "researcher": {
                "description": "Does research",
                "model": "haiku",
                "tools": ["WebSearch", "Write"],
                "prompt": "Research carefully.",
            }
        },
    }
    manifest = extract_manifest_from_claude(
        options, redact=False, root_name="research-lead"
    )
    graph = manifest.graph
    assert graph.root_id == "root"
    root = next(n for n in graph.nodes if n.id == "root")
    assert root.name == "research-lead"
    assert root.tools == ["Task"]
    child = next(n for n in graph.nodes if n.id == "researcher")
    assert child.tools == ["WebSearch", "Write"]
    invoke = next(e for e in graph.edges if e.kind.value == "invoke")
    assert invoke.from_node == "root"
    assert invoke.to_node == "researcher"


def test_classify_tool_agent_and_mcp():
    assert classify_tool("Task").kind == ToolKind.AGENT
    parsed = parse_mcp_tool_name("mcp__filesystem__read")
    assert parsed == ("filesystem", "read")
    mcp = classify_tool("mcp__filesystem__read")
    assert mcp.kind == ToolKind.MCP
    assert mcp.mcp_server == "filesystem"
    assert mcp.mcp_tool == "read"
    assert classify_tool("WebSearch").kind == ToolKind.BUILTIN


def test_redact_omits_prompt_preview():
    manifest = extract_manifest_from_claude(
        {"system_prompt": "secret instructions"}, redact=True, root_name="a"
    )
    root = manifest.graph.nodes[0]
    assert root.instructions_preview is None
    assert root.instructions_hash is not None
