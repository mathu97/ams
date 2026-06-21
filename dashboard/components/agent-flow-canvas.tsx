"use client"

import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { coordsFromPoint, DiagramTooltip } from "@/components/diagram-hint"
import { ReplayEdge } from "@/components/replay-edge"
import {
  buildReactFlowGraph,
  type AgentNodeData,
  type FlowNodeData,
  type HintEdgeData,
  type ReplayGraphOptions,
  type ToolNodeData,
} from "@/lib/build-react-flow-graph"
import { agentHint, toolHint, type HintContent } from "@/lib/diagram-hints"
import { boxBorder, boxWidth, padLine } from "@/lib/diagram-ascii"
import type { AgentDiagramData } from "@/lib/types/graph"

const hiddenHandle =
  "!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0"

type ActiveTip = {
  hint: HintContent
  x: number
  y: number
}

function replayStructureKey(replay?: ReplayGraphOptions): string {
  if (!replay?.layoutVisibility) return ""
  const agents = [...replay.layoutVisibility.agents].sort().join(",")
  const tools = [...replay.layoutVisibility.toolsByAgent.entries()]
    .map(([agent, names]) => `${agent}:${[...names].sort().join("+")}`)
    .sort()
    .join(";")
  const delegations = [...replay.layoutVisibility.delegations].sort().join(",")
  return `${agents}|${tools}|${delegations}`
}

function hintForNode(node: Node<FlowNodeData>): HintContent | null {
  const data = node.data
  if (data.nodeKind === "agent") return agentHint(data.agent)
  if (data.nodeKind === "tool") return toolHint(data.tool, data.agentName)
  return null
}

function revealStyle(reveal: number | undefined, isRoot = false) {
  const r = reveal ?? (isRoot ? 1 : 0)
  return {
    opacity: r,
    transform: `scale(${0.9 + 0.1 * r})`,
    transformOrigin: "left center",
    pointerEvents: r > 0.05 ? ("auto" as const) : ("none" as const),
  } as const
}

function AgentNode({ data }: NodeProps & { data: AgentNodeData }) {
  const { agent, active, revealProgress } = data
  const w = boxWidth(agent)
  const border = boxBorder(w)
  const isRoot = agent.role === "root"

  return (
    <div
      style={revealStyle(revealProgress, isRoot)}
      className={`relative w-fit ${agent.declaredOnly ? "opacity-45" : ""} ${
        active ? "replay-node-active" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} className={hiddenHandle} />
      <pre
        style={{ width: `${w}ch` }}
        className={`m-0 w-fit whitespace-pre text-[12px] leading-[1.35] ${
          agent.hasError ? "text-error" : "text-foreground"
        }`}
      >
        <span className="text-foreground/35">{border}</span>
        {"\n"}
        {padLine(agent.name, w)}
        {agent.model && (
          <>
            {"\n"}
            <span className="text-muted-foreground">{padLine(agent.model, w)}</span>
          </>
        )}
        {"\n"}
        <span className="text-foreground/35">{border}</span>
      </pre>
      <Handle type="source" position={Position.Right} className={hiddenHandle} />
    </div>
  )
}

function ToolNode({ data }: NodeProps & { data: ToolNodeData }) {
  const { tool, active, revealProgress } = data
  const label = tool.used ? tool.name : `(${tool.name})`

  return (
    <div
      style={revealStyle(revealProgress)}
      className={`relative w-fit ${active ? "replay-node-active" : ""}`}
    >
      <Handle type="target" position={Position.Left} className={hiddenHandle} />
      <span
        className={`inline-block w-fit border px-2 py-0.5 text-[11px] ${
          tool.used
            ? "border-foreground/30 text-foreground"
            : "border-dashed border-foreground/20 text-muted-foreground"
        }`}
      >
        [{label}]
      </span>
    </div>
  )
}

const nodeTypes = {
  agent: AgentNode,
  tool: ToolNode,
}

const edgeTypes = {
  replay: ReplayEdge,
}

export function AgentFlowCanvas({
  data,
  replay,
  elapsedMs,
  fitViewKey,
}: {
  data: AgentDiagramData
  replay?: ReplayGraphOptions
  /** Drives per-frame graph updates during replay playback. */
  elapsedMs?: number
  fitViewKey?: number
}) {
  const graph = useMemo(
    () => buildReactFlowGraph(data, replay),
    [data, replay, elapsedMs],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<HintEdgeData>>([])

  useEffect(() => {
    if (!graph) return
    setNodes(graph.nodes)
    setEdges(graph.edges)
  }, [graph, setNodes, setEdges])

  const structureKey = replayStructureKey(replay)
  const prevStructureKey = useRef(structureKey)
  const didInitialFit = useRef(false)

  const [tip, setTip] = useState<ActiveTip | null>(null)
  const rfRef = useRef<{ fitView: (opts?: { padding?: number; duration?: number }) => void } | null>(
    null,
  )

  const showTip = useCallback((hint: HintContent, x: number, y: number) => {
    setTip({ hint, x, y })
  }, [])

  const onNodeMouseEnter = useCallback(
    (event: React.MouseEvent, node: Node<FlowNodeData>) => {
      const hint = hintForNode(node)
      if (hint) showTip(hint, event.clientX, event.clientY)
    },
    [showTip],
  )

  const onNodeMouseMove = useCallback(
    (event: React.MouseEvent, node: Node<FlowNodeData>) => {
      const hint = hintForNode(node)
      if (hint) showTip(hint, event.clientX, event.clientY)
    },
    [showTip],
  )

  const onEdgeMouseEnter = useCallback(
    (event: React.MouseEvent, edge: Edge<HintEdgeData>) => {
      const hint = edge.data?.hint
      if (hint) showTip(hint, event.clientX, event.clientY)
    },
    [showTip],
  )

  const onEdgeMouseMove = useCallback(
    (event: React.MouseEvent, edge: Edge<HintEdgeData>) => {
      const hint = edge.data?.hint
      if (hint) showTip(hint, event.clientX, event.clientY)
    },
    [showTip],
  )

  useEffect(() => {
    if (fitViewKey !== undefined) {
      rfRef.current?.fitView({ padding: 0.3, duration: 280 })
      return
    }
    if (!replay?.layoutVisibility) return
    if (!didInitialFit.current) {
      didInitialFit.current = true
      rfRef.current?.fitView({ padding: 0.3, duration: 300 })
      return
    }
    if (structureKey !== prevStructureKey.current) {
      prevStructureKey.current = structureKey
      rfRef.current?.fitView({ padding: 0.3, duration: 500 })
    }
  }, [fitViewKey, structureKey, replay?.layoutVisibility, graph])

  if (!graph) return null

  return (
    <div className="relative h-[480px] w-full rounded-md border border-border bg-muted/40">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={(instance) => {
          rfRef.current = instance
        }}
        minZoom={0.15}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseMove={onNodeMouseMove}
        onNodeMouseLeave={() => setTip(null)}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseMove={onEdgeMouseMove}
        onEdgeMouseLeave={() => setTip(null)}
        proOptions={{ hideAttribution: true }}
        className="[&_.react-flow__handle]:!opacity-0 [&_.react-flow__node]:cursor-help [&_.react-flow__controls-button]:!rounded-none [&_.react-flow__controls-button]:!border-border [&_.react-flow__controls-button]:!bg-card [&_.react-flow__controls-button]:!text-foreground [&_.react-flow__controls]:!border [&_.react-flow__controls]:!border-border [&_.react-flow__controls]:!shadow-none"
      >
        <Background gap={20} size={1} color="color-mix(in oklab, var(--foreground) 6%, transparent)" />
        <Controls showInteractive={false} />
      </ReactFlow>
      {tip ? (
        <DiagramTooltip hint={tip.hint} coords={coordsFromPoint(tip.x, tip.y)} />
      ) : null}
    </div>
  )
}
