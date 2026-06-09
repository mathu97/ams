"""Tool name classification for cross-SDK topology."""

from __future__ import annotations

import re
from typing import Optional

from ..schema import Manifest, McpProvider, ToolDetail, ToolKind

_SUBAGENT_TOOLS = {"Task", "Agent"}

_MCP_DOUBLE = re.compile(r"^mcp__([^_]+(?:__[^_]+)*)__([^_].+)$")
_MCP_SINGLE = re.compile(r"^mcp_([^_]+)_([^_].+)$")


def parse_mcp_tool_name(name: str) -> Optional[tuple[str, str]]:
    for pattern in (_MCP_DOUBLE, _MCP_SINGLE):
        match = pattern.match(name)
        if match:
            return match.group(1), match.group(2)
    return None


def classify_tool(name: str, manifest: Optional[Manifest] = None) -> ToolDetail:
    if name in _SUBAGENT_TOOLS:
        return ToolDetail(name=name, kind=ToolKind.AGENT)

    parsed = parse_mcp_tool_name(name)
    if parsed:
        server, tool = parsed
        return ToolDetail(
            name=name,
            kind=ToolKind.MCP,
            mcp_server=server,
            mcp_tool=tool,
            mcp_provider=McpProvider.LOCAL,
        )

    if manifest:
        for node in manifest.graph.nodes:
            if node.kind == "mcp_server" and name in (node.tools or []):
                return ToolDetail(
                    name=name,
                    kind=ToolKind.MCP,
                    mcp_server=node.name,
                    mcp_tool=name,
                    mcp_provider=McpProvider.LOCAL,
                )

    return ToolDetail(name=name, kind=ToolKind.BUILTIN)
