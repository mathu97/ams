import type { Event, Session, Status } from "./types"

export type TimelineNodeType = "prompt" | "thinking" | "tool" | "subagent" | "answer"

export type TimelineNode = {
  key: string
  type: TimelineNodeType
  name: string
  status: Status
  agentName: string
  duration_ms?: number | null
  prompt?: string
  thinking?: string
  answerText?: string
  tool?: Event["tool"]
  subagent?: Event["subagent"]
  why?: string
  agentType?: string
  spawnVia?: string
  delegationKind?: string
  children?: TimelineNode[]
}

export type TimelineSection = {
  key: string
  agentName: string
  role: "root" | "subagent"
  parentAgentName?: string
  spawnVia?: string
  delegationKind?: string
  duration_ms?: number | null
  status: Status
  why?: string
  nodes: TimelineNode[]
}

export type TimelineGroup = {
  key: string
  agentName: string
  entries: TimelineEntry[]
}

export type TimelineEntry =
  | { kind: "nodes"; nodes: TimelineNode[] }
  | { kind: "subagent"; section: TimelineSection }

type BuildCtx = {
  rootAgent: string
  answerId: string | null
  seenMessageIds: Set<string>
  subagentByInvocation: Map<string, Event>
  consumedSubagentIds: Set<string>
}

export function scopeAgentName(scope: string | null | undefined, fallback: string): string {
  if (scope?.startsWith("agent:")) return scope.slice(6)
  if (scope === "orchestrator") return fallback
  if (scope?.startsWith("subagent:")) return scope.slice(9)
  return fallback
}

export function buildTimelineSections(session: Session): TimelineSection[] {
  const events = [...session.events].sort((a, b) => a.seq - b.seq)
  const ctx = makeCtx(session, events)
  const sections: TimelineSection[] = []
  let rootNodes: TimelineNode[] = []

  const flushRoot = () => {
    if (rootNodes.length === 0) return
    sections.push({
      key: `root-${sections.length}`,
      agentName: session.agent.name,
      role: "root",
      status: "ok",
      nodes: rootNodes,
    })
    rootNodes = []
  }

  for (const e of events) {
    if (e.type === "subagent") {
      if (ctx.consumedSubagentIds.has(e.id)) continue
      flushRoot()
      sections.push(makeSubagentSection(e, undefined, events, ctx))
      ctx.consumedSubagentIds.add(e.id)
      continue
    }

    if (e.type === "tool_call" && e.parent_id) continue

    if (e.type === "tool_call" && e.note === "subagent invocation") {
      const sub = ctx.subagentByInvocation.get(e.id)
      if (sub) {
        ctx.consumedSubagentIds.add(sub.id)
        flushRoot()
        sections.push(makeSubagentSection(sub, e, events, ctx))
        continue
      }
    }

    if (belongsToSubagentScope(e, events, session.agent.name)) continue

    const nodes = eventsToNodes([e], ctx, session.agent.name)
    rootNodes.push(...nodes)
  }

  flushRoot()
  return sections
}

export function groupTimelineSections(sections: TimelineSection[]): TimelineGroup[] {
  const groups: TimelineGroup[] = []
  let current: TimelineGroup | null = null

  for (const section of sections) {
    if (section.role === "root") {
      if (current && current.agentName === section.agentName) {
        current.entries.push({ kind: "nodes", nodes: section.nodes })
      } else {
        current = {
          key: section.key,
          agentName: section.agentName,
          entries: [{ kind: "nodes", nodes: section.nodes }],
        }
        groups.push(current)
      }
      continue
    }

    if (!current) {
      current = {
        key: `orphan-${section.key}`,
        agentName: section.parentAgentName ?? "agent",
        entries: [],
      }
      groups.push(current)
    }
    current.entries.push({ kind: "subagent", section })
  }

  return groups
}

/** @deprecated use buildTimelineSections */
export function buildTimeline(session: Session): TimelineNode[] {
  return buildTimelineSections(session).flatMap((s) =>
    s.role === "subagent"
      ? [
          {
            key: s.key,
            type: "subagent" as const,
            name: s.agentName,
            agentName: s.agentName,
            status: s.status,
            duration_ms: s.duration_ms,
            why: s.why,
            agentType: s.agentName,
            spawnVia: s.spawnVia,
            delegationKind: s.delegationKind,
            children: s.nodes,
          },
        ]
      : s.nodes,
  )
}

function makeCtx(session: Session, events: Event[]): BuildCtx {
  const subagentByInvocation = new Map<string, Event>()
  for (const e of events) {
    if (e.type === "subagent" && e.subagent?.invocation_event_id) {
      subagentByInvocation.set(e.subagent.invocation_event_id, e)
    }
  }

  let answerId: string | null = null
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.type === "llm_message" && e.llm?.text && e.llm.text.trim()) {
      answerId = e.id
      break
    }
  }

  return {
    rootAgent: session.agent.name,
    answerId,
    seenMessageIds: new Set<string>(),
    subagentByInvocation,
    consumedSubagentIds: new Set<string>(),
  }
}

function belongsToSubagentScope(e: Event, events: Event[], rootAgent: string): boolean {
  if (!e.scope?.startsWith("agent:")) return false
  const scopedAgent = scopeAgentName(e.scope, rootAgent)
  if (scopedAgent === rootAgent) return false

  return events.some((sub) => {
    if (sub.type !== "subagent") return false
    const subName = sub.subagent?.agent_type ?? sub.subagent?.target_agent
    return subName === scopedAgent
  })
}

function makeSubagentSection(
  sub: Event,
  invocation: Event | undefined,
  events: Event[],
  ctx: BuildCtx,
): TimelineSection {
  const agentName = sub.subagent?.agent_type ?? sub.subagent?.target_agent ?? sub.name
  const innerEvents = collectSubagentInnerEvents(sub, events)
  const innerNodes = eventsToNodes(innerEvents, ctx, agentName)

  const why =
    sub.subagent?.invocation_prompt ??
    (invocation?.tool?.input as { prompt?: string } | undefined)?.prompt

  const parentAgentName = invocation
    ? scopeAgentName(invocation.scope, ctx.rootAgent)
    : ctx.rootAgent

  return {
    key: sub.id,
    agentName,
    role: "subagent",
    parentAgentName,
    spawnVia: invocation?.tool?.name,
    delegationKind: sub.subagent?.delegation_kind ?? "invoke",
    duration_ms: sub.duration_ms ?? invocation?.duration_ms,
    status: sub.status,
    why,
    nodes: innerNodes,
  }
}

function collectSubagentInnerEvents(sub: Event, events: Event[]): Event[] {
  const agentType = sub.subagent?.agent_type ?? sub.subagent?.target_agent
  const scope = agentType ? `agent:${agentType}` : null

  return events.filter((e) => {
    if (e.id === sub.id) return false
    if (e.parent_id === sub.id) return true
    if (scope && e.scope === scope && e.type !== "subagent" && e.note !== "subagent invocation") {
      return true
    }
    return false
  })
}

function eventsToNodes(events: Event[], ctx: BuildCtx, defaultAgent: string): TimelineNode[] {
  const nodes: TimelineNode[] = []

  for (const e of events) {
    const agentName = scopeAgentName(e.scope, defaultAgent)

    if (e.type === "tool_call") {
      nodes.push({
        key: e.id,
        type: "tool",
        name: e.tool?.name ? `tool:${e.tool.name}` : e.name,
        agentName,
        status: e.tool?.is_error ? "error" : e.status,
        duration_ms: e.duration_ms,
        tool: e.tool,
      })
      continue
    }

    if (e.type === "user_prompt") {
      nodes.push({
        key: e.id,
        type: "prompt",
        name: "prompt",
        agentName: ctx.rootAgent,
        status: e.status,
        prompt: e.prompt,
      })
      continue
    }

    if (e.type === "llm_message") {
      if (e.id === ctx.answerId) {
        nodes.push({
          key: e.id,
          type: "answer",
          name: "answer",
          agentName: scopeAgentName(e.scope, ctx.rootAgent),
          status: e.status,
          answerText: e.llm?.text,
        })
        continue
      }

      const mid = e.llm?.message_id
      if (mid) {
        if (ctx.seenMessageIds.has(mid)) continue
        ctx.seenMessageIds.add(mid)
      }

      if (e.llm?.thinking && e.llm.thinking.trim()) {
        nodes.push({
          key: e.id,
          type: "thinking",
          name: "thinking",
          agentName,
          status: e.status,
          thinking: e.llm.thinking,
        })
      }
    }
  }

  return nodes
}
