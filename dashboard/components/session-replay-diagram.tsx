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
  type ReactFlowInstance,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Pause, Play, RotateCcw } from "lucide-react"

import { coordsFromPoint, DiagramTooltip } from "@/components/diagram-hint"
import { ReplayEdge } from "@/components/replay-edge"
import {
  buildReactFlowGraph,
  type AgentNodeData,
  type FlowNodeData,
  type HintEdgeData,
  type ToolNodeData,
} from "@/lib/build-react-flow-graph"
import { agentHint, toolHint, type HintContent } from "@/lib/diagram-hints"
import { boxBorder, boxWidth, padLine } from "@/lib/diagram-ascii"
import {
  buildSessionReplayTimeline,
  edgeMatchesHighlight,
  getReplayStateAt,
  isReplayHighlightMatch,
  type ReplayTimeline,
} from "@/lib/session-replay"
import type { AgentDiagramData } from "@/lib/types/graph"
import type { Session } from "@/lib/types"

const hiddenHandle =
  "!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0"

type ActiveTip = { hint: HintContent; x: number; y: number }

function revealStyle(reveal: number, isRoot = false) {
  const r = isRoot ? 1 : reveal
  return {
    opacity: r,
    transform: `scale(${0.92 + 0.08 * r})`,
    transformOrigin: "left center",
    pointerEvents: r > 0.05 ? ("auto" as const) : ("none" as const),
  } as const
}

function AgentNode({ data }: NodeProps & { data: AgentNodeData }) {
  const { agent, active, revealProgress = 0 } = data
  const w = boxWidth(agent)
  const border = boxBorder(w)
  const isRoot = agent.role === "root"

  return (
    <div
      style={revealStyle(revealProgress, isRoot)}
      className={`relative w-fit ${active ? "replay-node-active" : ""}`}
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
  const { tool, active, revealProgress = 0 } = data
  const label = tool.used ? tool.name : `(${tool.name})`

  return (
    <div
      style={revealStyle(revealProgress)}
      className={`relative w-fit ${active ? "replay-node-active" : ""}`}
    >
      <Handle type="target" position={Position.Left} className={hiddenHandle} />
      <span className="inline-block w-fit border border-foreground/30 px-2 py-0.5 text-[11px] text-foreground">
        [{label}]
      </span>
    </div>
  )
}

const nodeTypes = { agent: AgentNode, tool: ToolNode }
const edgeTypes = { replay: ReplayEdge }

function syncGraphState(
  setNodes: ReturnType<typeof useNodesState<Node<FlowNodeData>>>[1],
  setEdges: ReturnType<typeof useEdgesState<Edge<HintEdgeData>>>[1],
  liveFrame: { nodes: Node<FlowNodeData>[]; edges: Edge<HintEdgeData>[] },
) {
  setNodes((current) => {
    if (
      current.length !== liveFrame.nodes.length ||
      current.some((node, i) => node.id !== liveFrame.nodes[i]?.id)
    ) {
      return liveFrame.nodes
    }
    return current.map((node) => {
      const next = liveFrame.nodes.find((n) => n.id === node.id)
      if (!next) return node
      return { ...node, data: next.data }
    })
  })
  setEdges((current) => {
    if (
      current.length !== liveFrame.edges.length ||
      current.some((edge, i) => edge.id !== liveFrame.edges[i]?.id)
    ) {
      return liveFrame.edges
    }
    return current.map((edge) => {
      const next = liveFrame.edges.find((e) => e.id === edge.id)
      if (!next) return edge
      return { ...edge, data: next.data, type: next.type }
    })
  })
}

function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000)
  const frac = Math.floor((ms % 1000) / 100)
  return `${s}.${frac}s`
}

function applyLiveGraph(
  base: { nodes: Node<FlowNodeData>[]; edges: Edge<HintEdgeData>[] },
  timeline: ReplayTimeline,
  data: AgentDiagramData,
  elapsedMs: number,
): { nodes: Node<FlowNodeData>[]; edges: Edge<HintEdgeData>[] } {
  const live = getReplayStateAt(timeline, elapsedMs)

  const nodes = base.nodes.map((node) => {
    const isRoot = node.id === timeline.rootNodeId
    const reveal = isRoot ? 1 : (live.reveal.get(node.id) ?? 0)
    let active = false
    if (node.data.nodeKind === "agent") {
      active =
        isReplayHighlightMatch(live.active, {
          kind: "agent",
          name: node.data.agent.name,
        }) ||
        (live.active?.type === "delegation" && live.active.to === node.data.agent.name)
    } else if (node.data.nodeKind === "tool") {
      active = isReplayHighlightMatch(live.active, {
        kind: "tool",
        agent: node.data.agentName,
        name: node.data.tool.name,
      })
    }
    return {
      ...node,
      data: { ...node.data, revealProgress: reveal, active },
    }
  })

  const edges = base.edges.map((edge) => {
    const drawProgress = live.reveal.get(edge.id) ?? 0
    return {
      ...edge,
      type: "replay" as const,
      data: {
        hint: edge.data!.hint,
        drawProgress,
        highlighted: edgeMatchesHighlight(edge.id, data, live.active),
      },
    }
  })

  return { nodes, edges }
}

function ReplayPlayer({
  data,
  timeline,
  autoPlay = true,
  initialElapsed = 0,
  showControls = true,
}: {
  data: AgentDiagramData
  timeline: ReplayTimeline
  autoPlay?: boolean
  initialElapsed?: number
  showControls?: boolean
}) {
  const totalMs = timeline.durationMs

  const baseGraph = useMemo(
    () =>
      buildReactFlowGraph(data, {
        layoutVisibility: timeline.finalVisibility,
        visibility: timeline.finalVisibility,
      }),
    [data, timeline],
  )

  const [elapsedMs, setElapsedMs] = useState(initialElapsed)
  const [playing, setPlaying] = useState(autoPlay)
  const elapsedRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const anchorRef = useRef<{ wall: number; elapsed: number } | null>(null)

  const frame = useMemo(() => {
    if (!baseGraph) return null
    return applyLiveGraph(baseGraph, timeline, data, elapsedMs)
  }, [baseGraph, timeline, data, elapsedMs])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<HintEdgeData>>([])

  elapsedRef.current = elapsedMs
  const live = useMemo(
    () => getReplayStateAt(timeline, elapsedMs),
    [timeline, elapsedMs],
  )
  const atEnd = elapsedMs >= totalMs

  useLayoutEffect(() => {
    if (!frame || playing) return
    syncGraphState(setNodes, setEdges, frame)
  }, [frame, playing, setNodes, setEdges])

  useEffect(() => {
    if (!baseGraph) return
    const initial = applyLiveGraph(baseGraph, timeline, data, initialElapsed)
    setNodes(initial.nodes)
    setEdges(initial.edges)
    setElapsedMs(initialElapsed)
    setPlaying(autoPlay)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when timeline/data changes
  }, [timeline, data, baseGraph, autoPlay, initialElapsed])

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    anchorRef.current = null
  }, [])

  const tick = useCallback(
    (now: number) => {
      const anchor = anchorRef.current
      if (!anchor || !baseGraph) return
      const next = anchor.elapsed + (now - anchor.wall)
      const t = Math.min(totalMs, next)
      const liveFrame = applyLiveGraph(baseGraph, timeline, data, t)
      syncGraphState(setNodes, setEdges, liveFrame)
      setElapsedMs(t)
      if (next >= totalMs) {
        setPlaying(false)
        stopLoop()
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    },
    [baseGraph, timeline, data, totalMs, stopLoop, setNodes, setEdges],
  )

  useEffect(() => {
    if (!playing) {
      stopLoop()
      return
    }
    anchorRef.current = { wall: performance.now(), elapsed: elapsedRef.current }
    rafRef.current = requestAnimationFrame(tick)
    return stopLoop
  }, [playing, tick, stopLoop])

  const [tip, setTip] = useState<ActiveTip | null>(null)
  const rfRef = useRef<ReactFlowInstance<Node<FlowNodeData>, Edge<HintEdgeData>> | null>(
    null,
  )

  if (!frame) return null

  return (
    <>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">
          {formatClock(elapsedMs)} / {formatClock(totalMs)} · {live.label}
        </span>
      </div>

      <div className="relative h-[480px] w-full rounded-md border border-border bg-muted/40">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={(i) => {
            rfRef.current = i
            requestAnimationFrame(() => {
              i.fitView({ padding: 0.45, duration: 0, includeHiddenNodes: true })
            })
          }}
          minZoom={0.15}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          onNodeMouseEnter={(e, n) => {
            const hint =
              n.data.nodeKind === "agent"
                ? agentHint(n.data.agent)
                : n.data.nodeKind === "tool"
                  ? toolHint(n.data.tool, n.data.agentName)
                  : null
            if (hint) setTip({ hint, x: e.clientX, y: e.clientY })
          }}
          onNodeMouseMove={(e, n) => {
            const hint =
              n.data.nodeKind === "agent"
                ? agentHint(n.data.agent)
                : n.data.nodeKind === "tool"
                  ? toolHint(n.data.tool, n.data.agentName)
                  : null
            if (hint) setTip({ hint, x: e.clientX, y: e.clientY })
          }}
          onNodeMouseLeave={() => setTip(null)}
          onEdgeMouseEnter={(e, edge) => {
            const hint = edge.data?.hint
            if (hint) setTip({ hint, x: e.clientX, y: e.clientY })
          }}
          onEdgeMouseMove={(e, edge) => {
            const hint = edge.data?.hint
            if (hint) setTip({ hint, x: e.clientX, y: e.clientY })
          }}
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

      {showControls ? (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (atEnd) {
                setElapsedMs(0)
                setPlaying(true)
              } else {
                setPlaying((p) => !p)
              }
            }}
            className="rounded border border-border bg-card p-1.5 text-foreground"
            aria-label={playing ? "Pause" : atEnd ? "Replay" : "Play"}
          >
            {playing ? (
              <Pause className="size-3.5" />
            ) : atEnd ? (
              <RotateCcw className="size-3.5" />
            ) : (
              <Play className="size-3.5" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={totalMs}
            step={1}
            value={elapsedMs}
            onChange={(e) => {
              setPlaying(false)
              setElapsedMs(Number(e.target.value))
            }}
            className="h-1 min-w-0 flex-1 cursor-pointer accent-primary"
            aria-label="Replay progress"
          />
        </div>
      ) : null}
    </>
  )
}

export function SessionReplayDiagram({
  session,
  data,
}: {
  session: Session
  data: AgentDiagramData
}) {
  const timeline = useMemo(
    () => buildSessionReplayTimeline(session, data),
    [session, data],
  )
  const hasMotion = timeline.cues.length > 0

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
        Session flow
      </h2>
      {hasMotion ? (
        <ReplayPlayer data={data} timeline={timeline} />
      ) : (
        <ReplayPlayer data={data} timeline={timeline} autoPlay={false} />
      )}
    </section>
  )
}
