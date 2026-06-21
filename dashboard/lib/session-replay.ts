import type { Event, Session } from "@/lib/types"
import type { AgentDiagramData } from "@/lib/types/graph"
import { scopeAgentName } from "@/lib/timeline"

export type ReplayVisibility = {
  agents: Set<string>
  toolsByAgent: Map<string, Set<string>>
  delegations: Set<string>
}

export type ReplayHighlight =
  | { type: "agent"; agent: string }
  | { type: "tool"; agent: string; tool: string }
  | { type: "delegation"; from: string; to: string }

export type ReplayCue = {
  id: string
  kind: "delegation" | "tool"
  label: string
  atMs: number
  endMs: number
  nodeIds: string[]
  edgeIds: string[]
  highlight: ReplayHighlight
}

export type ReplayTimeline = {
  root: string
  rootNodeId: string
  durationMs: number
  finalVisibility: ReplayVisibility
  cues: ReplayCue[]
}

export type ReplayLiveState = {
  visibility: ReplayVisibility
  reveal: Map<string, number>
  active?: ReplayHighlight
  label: string
}

/** How long edges/nodes take to draw once their cue starts (replay ms). */
export const REPLAY_DRAW_MS = 650
const CUE_GAP_MS = 1_400
const CUE_START_MS = 500
const CUE_ACTIVE_MS = 1_100
const END_PAD_MS = 800

function parseTime(iso: string): number {
  return new Date(iso).getTime()
}

function eventEndMs(e: Event, sessionStart: number): number {
  if (e.end_time) return parseTime(e.end_time) - sessionStart
  if (e.duration_ms != null && e.duration_ms > 0) {
    return parseTime(e.start_time) - sessionStart + e.duration_ms
  }
  return parseTime(e.start_time) - sessionStart + CUE_ACTIVE_MS
}

function easeOut(t: number): number {
  return 1 - (1 - Math.min(1, Math.max(0, t))) ** 3
}

function ensureAgent(v: ReplayVisibility, name: string): void {
  v.agents.add(name)
  if (!v.toolsByAgent.has(name)) v.toolsByAgent.set(name, new Set())
}

function diagramAgentId(data: AgentDiagramData, name: string): string {
  const node = data.nodes.find((n) => n.name === name && n.kind === "agent")
  return node?.id ?? name
}

export function rfAgentNodeId(data: AgentDiagramData, name: string): string {
  return `agent:${diagramAgentId(data, name)}`
}

export function rfToolNodeId(agentName: string, toolName: string): string {
  return `tool:${agentName}:${toolName}`
}

export function rfDelegationEdgeId(
  data: AgentDiagramData,
  from: string,
  to: string,
): string {
  return `${rfAgentNodeId(data, from)}->${rfAgentNodeId(data, to)}`
}

export function rfToolEdgeId(
  data: AgentDiagramData,
  agentName: string,
  toolName: string,
): string {
  return `${rfAgentNodeId(data, agentName)}->${rfToolNodeId(agentName, toolName)}`
}

/** Event timestamps are often identical in captured sessions — spread cues in seq order. */
function scheduleCueTimes(cues: ReplayCue[]): number {
  if (cues.length === 0) return END_PAD_MS

  const span = cues[cues.length - 1]!.atMs - cues[0]!.atMs
  if (span < 120) {
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i]!
      cue.atMs = CUE_START_MS + i * CUE_GAP_MS
      cue.endMs = cue.atMs + CUE_ACTIVE_MS
    }
  }

  const last = cues[cues.length - 1]!
  return last.endMs + REPLAY_DRAW_MS + END_PAD_MS
}

export function buildSessionReplayTimeline(
  session: Session,
  data: AgentDiagramData,
): ReplayTimeline {
  const root = session.agent.name
  const rootNodeId = rfAgentNodeId(data, root)
  const events = [...session.events].sort((a, b) => a.seq - b.seq)

  const sessionStart =
    events.length > 0
      ? parseTime(events[0]!.start_time)
      : parseTime(session.start_time ?? new Date().toISOString())

  const finalVisibility: ReplayVisibility = {
    agents: new Set([root]),
    toolsByAgent: new Map([[root, new Set()]]),
    delegations: new Set(),
  }

  const cues: ReplayCue[] = []

  const subagentByInvocation = new Map<string, Event>()
  for (const e of events) {
    const invId = e.subagent?.invocation_event_id
    if (e.type === "subagent" && invId) subagentByInvocation.set(invId, e)
  }

  const consumedSubagents = new Set<string>()

  function addDelegationCue(
    parent: string,
    child: string,
    startMs: number,
    endMs: number,
    label: string,
  ): void {
    ensureAgent(finalVisibility, child)
    finalVisibility.delegations.add(`${parent}->${child}`)
    cues.push({
      id: `delegation:${parent}->${child}:${cues.length}`,
      kind: "delegation",
      label,
      atMs: startMs,
      endMs: Math.max(endMs, startMs + 200),
      nodeIds: [rfAgentNodeId(data, child)],
      edgeIds: [rfDelegationEdgeId(data, parent, child)],
      highlight: { type: "delegation", from: parent, to: child },
    })
  }

  function addToolCue(
    agent: string,
    tool: string,
    startMs: number,
    endMs: number,
  ): void {
    ensureAgent(finalVisibility, agent)
    finalVisibility.toolsByAgent.get(agent)!.add(tool)
    cues.push({
      id: `tool:${agent}:${tool}:${cues.length}`,
      kind: "tool",
      label: tool,
      atMs: startMs,
      endMs: Math.max(endMs, startMs + 200),
      nodeIds: [rfToolNodeId(agent, tool)],
      edgeIds: [rfToolEdgeId(data, agent, tool)],
      highlight: { type: "tool", agent, tool },
    })
  }

  for (const e of events) {
    const startMs = parseTime(e.start_time) - sessionStart
    const endMs = eventEndMs(e, sessionStart)

    if (e.type === "tool_call" && e.note === "subagent invocation") {
      const sub = subagentByInvocation.get(e.id)
      if (sub && !consumedSubagents.has(sub.id)) {
        consumedSubagents.add(sub.id)
        const child =
          sub.subagent?.target_agent || sub.subagent?.agent_type || sub.name || "sub-agent"
        const parent = scopeAgentName(e.scope, root)
        addDelegationCue(
          parent,
          child,
          startMs,
          Math.max(endMs, eventEndMs(sub, sessionStart)),
          `Delegate → ${child}`,
        )
      }
      continue
    }

    if (e.type === "subagent") {
      if (consumedSubagents.has(e.id)) continue
      consumedSubagents.add(e.id)
      const child = e.subagent?.target_agent || e.subagent?.agent_type || e.name || "sub-agent"
      const parent = scopeAgentName(e.scope, root)
      addDelegationCue(parent, child, startMs, endMs, `Spawn ${child}`)
      continue
    }

    if (e.type === "tool_call" && e.tool?.name && e.note !== "subagent invocation") {
      const agent = scopeAgentName(e.scope, root)
      addToolCue(agent, e.tool.name, startMs, endMs)
    }
  }

  cues.sort((a, b) => a.atMs - b.atMs || a.id.localeCompare(b.id))
  const durationMs = scheduleCueTimes(cues)

  return {
    root,
    rootNodeId,
    durationMs,
    finalVisibility,
    cues,
  }
}

export function getReplayStateAt(
  timeline: ReplayTimeline,
  elapsedMs: number,
): ReplayLiveState {
  const t = Math.max(0, Math.min(timeline.durationMs, elapsedMs))
  const visibility: ReplayVisibility = {
    agents: new Set([timeline.root]),
    toolsByAgent: new Map([[timeline.root, new Set()]]),
    delegations: new Set(),
  }
  const reveal = new Map<string, number>()
  reveal.set(timeline.rootNodeId, 1)

  let active: ReplayHighlight | undefined
  let label = "Session started"

  for (const cue of timeline.cues) {
    if (t < cue.atMs) continue

    if (cue.kind === "delegation") {
      const h = cue.highlight
      if (h.type === "delegation") {
        ensureAgent(visibility, h.to)
        visibility.delegations.add(`${h.from}->${h.to}`)
      }
    } else if (cue.kind === "tool") {
      const h = cue.highlight
      if (h.type === "tool") {
        ensureAgent(visibility, h.agent)
        visibility.toolsByAgent.get(h.agent)!.add(h.tool)
      }
    }

    const drawT = easeOut(Math.min(1, (t - cue.atMs) / REPLAY_DRAW_MS))
    for (const id of cue.nodeIds) reveal.set(id, Math.max(reveal.get(id) ?? 0, drawT))
    for (const id of cue.edgeIds) reveal.set(id, Math.max(reveal.get(id) ?? 0, drawT))

    if (t >= cue.atMs && t < cue.endMs) {
      active = cue.highlight
      label = cue.label
    }
  }

  const done = timeline.cues.filter((c) => t >= c.atMs)
  if (!active && done.length > 0) {
    label = t >= timeline.durationMs - 200 ? "Session complete" : done[done.length - 1]!.label
  }

  return { visibility, reveal, active, label }
}

export function isReplayHighlightMatch(
  highlight: ReplayHighlight | undefined,
  opts:
    | { kind: "agent"; name: string }
    | { kind: "tool"; agent: string; name: string }
    | { kind: "delegation"; from: string; to: string },
): boolean {
  if (!highlight) return false
  if (opts.kind === "agent" && highlight.type === "agent") return highlight.agent === opts.name
  if (opts.kind === "tool" && highlight.type === "tool") {
    return highlight.agent === opts.agent && highlight.tool === opts.name
  }
  if (opts.kind === "delegation" && highlight.type === "delegation") {
    return highlight.from === opts.from && highlight.to === opts.to
  }
  return false
}

export function edgeMatchesHighlight(
  edgeId: string,
  data: AgentDiagramData,
  highlight: ReplayHighlight | undefined,
): boolean {
  if (!highlight) return false
  if (highlight.type === "delegation") {
    return edgeId === rfDelegationEdgeId(data, highlight.from, highlight.to)
  }
  if (highlight.type === "tool") {
    return edgeId === rfToolEdgeId(data, highlight.agent, highlight.tool)
  }
  return false
}
