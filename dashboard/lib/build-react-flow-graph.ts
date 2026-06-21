import { MarkerType, Position, type Edge, type Node } from "@xyflow/react"

import {
  buildFlowLayout,
  type FlowAgentNode,
  type FlowEdge,
  type FlowLayout,
  type FlowTool,
} from "@/lib/build-flow-diagram"
import { agentToolEdgeHint, edgeHint, type HintContent } from "@/lib/diagram-hints"
import { agentBoxHeight, agentPixelWidth, toolGroupPixelWidth } from "@/lib/diagram-ascii"
import type { ReplayHighlight, ReplayVisibility } from "@/lib/session-replay"
import { isReplayHighlightMatch } from "@/lib/session-replay"
import type { AgentDiagramData } from "@/lib/types/graph"

export type ReplayGraphOptions = {
  visibility: ReplayVisibility
  /** When set, positions are computed from the final graph; reveal controls what's shown. */
  layoutVisibility?: ReplayVisibility
  reveal?: Map<string, number>
  active?: ReplayHighlight
}

export type AgentNodeData = {
  nodeKind: "agent"
  agent: FlowAgentNode
  active?: boolean
  revealProgress?: number
}

export type ToolNodeData = {
  nodeKind: "tool"
  tool: FlowTool
  agentName: string
  active?: boolean
  revealProgress?: number
}

export type HintEdgeData = {
  hint: HintContent
  highlighted?: boolean
  drawProgress?: number
}

export type FlowNodeData = AgentNodeData | ToolNodeData

const TOOL_ROW_H = 26
const TOOL_GAP = 6
const CHILD_GAP = 24
const COL_GAP = 56
const ROW_GAP = 32

/** SVG stroke — hex only; CSS vars break in markers */
const EDGE_STROKE = "#9ca3af"
const DOT_PATTERN = "2 5"

function toolsColumnHeight(toolCount: number): number {
  if (toolCount === 0) return 0
  return toolCount * TOOL_ROW_H + (toolCount - 1) * TOOL_GAP
}

function agentBlockHeight(agent: FlowAgentNode): number {
  return Math.max(agentBoxHeight(agent), toolsColumnHeight(agent.tools.length))
}

function layoutHeight(layout: FlowLayout): number {
  const rootH = agentBoxHeight(layout.root)
  const rootToolsH = toolsColumnHeight(layout.rootTools.length)
  const rootBlockH = rootH + (rootToolsH > 0 ? ROW_GAP + rootToolsH : 0)

  const childBlockH =
    layout.children.reduce((sum, c) => sum + agentBlockHeight(c.agent) + CHILD_GAP, 0) - CHILD_GAP

  const mcpBlockH =
    layout.mcp.length > 0
      ? layout.mcp.reduce((sum, m) => sum + agentBlockHeight(m.agent) + CHILD_GAP, 0) + 48
      : 0

  return Math.max(rootBlockH, childBlockH || rootH) + mcpBlockH
}

type ColumnLayout = {
  root: number
  child: number
  childTools: number
}

function computeColumns(layout: FlowLayout): ColumnLayout {
  const rootW = agentPixelWidth(layout.root)
  const childW = Math.max(0, ...layout.children.map((c) => agentPixelWidth(c.agent)))
  const childToolsW = Math.max(
    0,
    ...layout.children.map((c) => (c.agent.tools.length ? toolGroupPixelWidth(c.agent.tools) : 0)),
  )

  const child = rootW + COL_GAP
  const childTools = child + childW + COL_GAP

  return { root: 0, child, childTools: childToolsW > 0 ? childTools : child + childW + COL_GAP }
}

function revealOf(replay: ReplayGraphOptions | undefined, id: string): number {
  if (!replay?.reveal) return 1
  return replay.reveal.get(id) ?? 0
}

function addAgentNode(
  nodes: Node<FlowNodeData>[],
  agent: FlowAgentNode,
  x: number,
  y: number,
  replay?: ReplayGraphOptions,
): string {
  const id = `agent:${agent.id}`
  const active = isReplayHighlightMatch(replay?.active, { kind: "agent", name: agent.name })
  nodes.push({
    id,
    type: "agent",
    position: { x, y },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      nodeKind: "agent",
      agent,
      active,
      revealProgress: revealOf(replay, id),
    },
  })
  return id
}

function addToolNodes(
  nodes: Node<FlowNodeData>[],
  edges: Edge<HintEdgeData>[],
  agentId: string,
  agentName: string,
  tools: FlowTool[],
  x: number,
  startY: number,
  replay?: ReplayGraphOptions,
): void {
  tools.forEach((tool, i) => {
    const id = `tool:${agentName}:${tool.name}`
    const active = isReplayHighlightMatch(replay?.active, {
      kind: "tool",
      agent: agentName,
      name: tool.name,
    })
    nodes.push({
      id,
      type: "tool",
      position: { x, y: startY + i * (TOOL_ROW_H + TOOL_GAP) },
      targetPosition: Position.Left,
      data: {
        nodeKind: "tool",
        tool,
        agentName,
        active,
        revealProgress: revealOf(replay, id),
      },
    })
    addEdge(edges, agentId, id, {
      kind: "tool",
      agentName,
      active: active || undefined,
      replay,
    })
  })
}

function edgeHintContent(opts: {
  kind: "tool" | "delegation" | "mcp"
  agentName?: string
  flowEdge?: FlowEdge
}): HintContent {
  if (opts.kind === "tool") return agentToolEdgeHint(opts.agentName ?? "agent")
  if (opts.flowEdge) return edgeHint(opts.flowEdge)
  return {
    title: opts.kind === "mcp" ? "MCP connection" : "Delegation",
    lines: ["Declared in manifest — not yet observed in sessions."],
  }
}

const HIGHLIGHT_STROKE = "#f59e0b"

function replayLayoutVisibility(replay?: ReplayGraphOptions): ReplayVisibility | undefined {
  return replay?.layoutVisibility ?? replay?.visibility
}

function filterTools(
  agentName: string,
  tools: FlowTool[],
  replay?: ReplayGraphOptions,
): FlowTool[] {
  const visibility = replayLayoutVisibility(replay)
  if (!visibility) return tools
  const allowed = visibility.toolsByAgent.get(agentName)
  if (!allowed) return []
  return tools.filter((t) => allowed.has(t.name)).map((t) => ({ ...t, used: true }))
}

function addEdge(
  edges: Edge<HintEdgeData>[],
  source: string,
  target: string,
  opts: {
    kind?: "tool" | "delegation" | "mcp"
    agentName?: string
    flowEdge?: FlowEdge
    active?: boolean
    replay?: ReplayGraphOptions
  },
): void {
  const kind = opts.kind ?? "tool"
  const id = `${source}->${target}`
  const active = opts.active
  const stroke = active ? HIGHLIGHT_STROKE : EDGE_STROKE
  const drawProgress = opts.replay?.reveal ? revealOf(opts.replay, id) : 1
  const isReplay = opts.replay?.reveal != null

  edges.push({
    id,
    source,
    target,
    type: isReplay ? "replay" : "smoothstep",
    data: {
      hint: edgeHintContent({ ...opts, kind }),
      highlighted: active,
      drawProgress: isReplay ? drawProgress : undefined,
    },
    animated: !!active && !isReplay,
    style: isReplay
      ? undefined
      : {
          stroke,
          strokeWidth: active ? 2.5 : 1.5,
          strokeDasharray: DOT_PATTERN,
        },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 12,
      height: 12,
      color: stroke,
    },
  })
}

export function buildReactFlowGraph(
  data: AgentDiagramData,
  replay?: ReplayGraphOptions,
): {
  nodes: Node<FlowNodeData>[]
  edges: Edge<HintEdgeData>[]
} | null {
  const layout = buildFlowLayout(data)
  if (!layout) return null

  const columns = computeColumns(layout)
  const nodes: Node<FlowNodeData>[] = []
  const edges: Edge<HintEdgeData>[] = []
  const totalH = layoutHeight(layout)

  const rootH = agentBoxHeight(layout.root)
  const rootBlockH =
    rootH + (layout.rootTools.length > 0 ? ROW_GAP + toolsColumnHeight(layout.rootTools.length) : 0)
  const rootY = (totalH - Math.max(rootBlockH, layout.children.length ? agentBlockHeight(layout.children[0].agent) : rootH)) / 2

  const rootId = addAgentNode(nodes, layout.root, columns.root, rootY, replay)

  const rootTools = filterTools(layout.root.name, layout.rootTools, replay)
  if (rootTools.length > 0) {
    addToolNodes(
      nodes,
      edges,
      rootId,
      layout.root.name,
      rootTools,
      columns.root,
      rootY + rootH + ROW_GAP,
      replay,
    )
  }

  const layoutVis = replayLayoutVisibility(replay)
  const visibleChildren = layoutVis
    ? layout.children.filter((c) => layoutVis.agents.has(c.agent.name))
    : layout.children

  const childBlockH =
    visibleChildren.reduce((s, c) => s + agentBlockHeight(c.agent) + CHILD_GAP, 0) -
    (visibleChildren.length > 0 ? 0 : CHILD_GAP)
  let childY = (totalH - (visibleChildren.length ? childBlockH : 0)) / 2

  for (const child of visibleChildren) {
    layoutChild(nodes, edges, child, childY, rootId, columns, layout.root.name, replay)
    childY += agentBlockHeight(child.agent) + CHILD_GAP
  }

  if (layout.mcp.length > 0 && !replay) {
    const mcpBlockH =
      layout.mcp.reduce((s, m) => s + agentBlockHeight(m.agent) + CHILD_GAP, 0) - CHILD_GAP
    let mcpY = totalH - mcpBlockH
    for (const { agent, edge } of layout.mcp) {
      const mcpId = addAgentNode(nodes, agent, columns.root, mcpY)
      if (agent.tools.length > 0) {
        addToolNodes(
          nodes,
          edges,
          mcpId,
          agent.name,
          agent.tools.map((t) => t),
          columns.root,
          mcpY + agentBoxHeight(agent) + ROW_GAP,
        )
      }
      addEdge(edges, rootId, mcpId, {
        kind: "mcp",
        flowEdge: edge,
      })
      mcpY += agentBlockHeight(agent) + CHILD_GAP
    }
  }

  return { nodes, edges }
}

function layoutChild(
  nodes: Node<FlowNodeData>[],
  edges: Edge<HintEdgeData>[],
  child: FlowLayout["children"][number],
  y: number,
  rootId: string,
  columns: ColumnLayout,
  rootName: string,
  replay?: ReplayGraphOptions,
): void {
  const delegationKey = `${rootName}->${child.agent.name}`
  const layoutVis = replayLayoutVisibility(replay)
  if (layoutVis && !layoutVis.delegations.has(delegationKey)) return

  const childId = addAgentNode(nodes, child.agent, columns.child, y, replay)

  const delegationActive = isReplayHighlightMatch(replay?.active, {
    kind: "delegation",
    from: rootName,
    to: child.agent.name,
  })

  addEdge(edges, rootId, childId, {
    kind: "delegation",
    flowEdge: child.edge,
    active: delegationActive || undefined,
    replay,
  })

  const tools = filterTools(child.agent.name, child.agent.tools, replay)
  if (tools.length > 0) {
    const colH = toolsColumnHeight(tools.length)
    const agentH = agentBoxHeight(child.agent)
    addToolNodes(
      nodes,
      edges,
      childId,
      child.agent.name,
      tools,
      columns.childTools,
      y + Math.max(0, (agentH - colH) / 2),
      replay,
    )
  }
}
