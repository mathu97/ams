import type { FlowAgentNode, FlowEdge, FlowTool } from "@/lib/build-flow-diagram"

export type HintContent = {
  title: string
  lines: string[]
}

export function agentHint(node: FlowAgentNode): HintContent {
  const isRoot = node.role === "root"
  const isMcp = node.kind === "mcp_server"

  const title = isMcp ? "MCP server" : isRoot ? "Agent" : "Sub-agent"
  const lines: string[] = []

  if (node.description) {
    lines.push(node.description)
  } else if (isMcp) {
    lines.push("External tool server connected via Model Context Protocol.")
  } else if (isRoot) {
    lines.push("Top-level agent that receives the request and coordinates the run.")
  } else {
    lines.push("Specialized agent invoked by the parent to handle part of the work.")
  }

  if (node.model) lines.push(`Model: ${node.model}`)
  if (node.declaredOnly) lines.push("Declared in manifest — not yet observed in sessions.")
  if (node.hasError) lines.push("One or more sessions recorded errors for this agent.")

  return { title, lines }
}

export function toolHint(tool: FlowTool, agentName: string): HintContent {
  const lines = [`Tool available to ${agentName}.`]
  if (!tool.used) {
    lines.push("Declared in the agent manifest but not observed in sessions yet.")
  }
  return { title: "Tool", lines }
}

export function agentToolEdgeHint(agentName: string): HintContent {
  return {
    title: "Tool access",
    lines: [`${agentName} can call this tool during a run.`],
  }
}

export function edgeHint(edge: FlowEdge): HintContent {
  const kindLabel =
    edge.kind === "handoff"
      ? "Handoff"
      : edge.kind === "mcp"
        ? "MCP connection"
        : "Delegation"

  const lines: string[] = []

  if (edge.kind === "invoke") {
    lines.push("Parent agent delegates work to a sub-agent via this tool call.")
  } else if (edge.kind === "handoff") {
    lines.push("Control passes from one agent to another — the target owns the rest of the turn.")
  } else if (edge.kind === "mcp") {
    lines.push("Agent connects to an external MCP server for additional tools.")
  }

  if (edge.label) lines.push(`Via: ${edge.label}`)
  if (!edge.observed) {
    lines.push("Declared in manifest — not yet observed in sessions.")
  }

  return { title: kindLabel, lines }
}