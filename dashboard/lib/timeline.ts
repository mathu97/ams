import type { Event, Session, Status } from "./types"

export type TimelineNodeType = "prompt" | "thinking" | "tool" | "subagent" | "answer"

export type TimelineNode = {
  key: string
  type: TimelineNodeType
  name: string
  status: Status
  duration_ms?: number | null
  // content fields by type
  prompt?: string
  thinking?: string
  answerText?: string
  tool?: Event["tool"]
  subagent?: Event["subagent"]
  // why a subagent was spawned
  why?: string
  agentType?: string
  // nested tool calls (subagent only)
  children?: TimelineNode[]
}

/**
 * Transform the raw event stream into a readable timeline per the normalize rules:
 *  1. Collapse consecutive llm_message events sharing the same message_id.
 *  2. Merge "tool:Agent" (subagent invocation) with the subagent it spawned.
 *  3. Nest tool_calls whose parent_id points at a subagent under that subagent.
 *  4. (rendering concern) large tool.result collapsed by default.
 *  5. Last llm_message with non-empty text is the "answer".
 */
export function buildTimeline(session: Session): TimelineNode[] {
  const events = [...session.events].sort((a, b) => a.seq - b.seq)

  // Identify the answer event: last llm_message with non-empty text.
  let answerId: string | null = null
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.type === "llm_message" && e.llm?.text && e.llm.text.trim()) {
      answerId = e.id
      break
    }
  }

  // Map subagent events by id, and by their invocation_event_id (the Agent tool).
  const subagentByInvocation = new Map<string, Event>()
  for (const e of events) {
    if (e.type === "subagent" && e.subagent?.invocation_event_id) {
      subagentByInvocation.set(e.subagent.invocation_event_id, e)
    }
  }

  // Group child tool calls under their parent subagent id.
  const childrenBySubagent = new Map<string, Event[]>()
  for (const e of events) {
    if (e.type === "tool_call" && e.parent_id) {
      const arr = childrenBySubagent.get(e.parent_id) ?? []
      arr.push(e)
      childrenBySubagent.set(e.parent_id, arr)
    }
  }

  const nodes: TimelineNode[] = []
  const seenMessageIds = new Set<string>()
  const consumedSubagentIds = new Set<string>()

  for (const e of events) {
    // Skip subagent events that will be merged via their invocation tool.
    if (e.type === "subagent") {
      if (!consumedSubagentIds.has(e.id)) {
        // Subagent without a matching Agent tool — render standalone.
        nodes.push(makeSubagentNode(e, childrenBySubagent))
        consumedSubagentIds.add(e.id)
      }
      continue
    }

    // Skip tool calls nested under a subagent (rule #3) — rendered as children.
    if (e.type === "tool_call" && e.parent_id) {
      continue
    }

    // Merge "tool:Agent" subagent invocation with the spawned subagent (rule #2).
    if (e.type === "tool_call" && e.note === "subagent invocation") {
      const sub = subagentByInvocation.get(e.id)
      if (sub) {
        consumedSubagentIds.add(sub.id)
        nodes.push(makeSubagentNode(sub, childrenBySubagent, e))
        continue
      }
    }

    if (e.type === "tool_call") {
      nodes.push({
        key: e.id,
        type: "tool",
        name: e.tool?.name ? `tool:${e.tool.name}` : e.name,
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
        status: e.status,
        prompt: e.prompt,
      })
      continue
    }

    if (e.type === "llm_message") {
      // rule #5: answer
      if (e.id === answerId) {
        nodes.push({
          key: e.id,
          type: "answer",
          name: "answer",
          status: e.status,
          answerText: e.llm?.text,
        })
        continue
      }

      // rule #1: collapse consecutive messages sharing a message_id.
      const mid = e.llm?.message_id
      if (mid) {
        if (seenMessageIds.has(mid)) continue
        seenMessageIds.add(mid)
      }

      // Only render thinking rows that actually carry reasoning.
      if (e.llm?.thinking && e.llm.thinking.trim()) {
        nodes.push({
          key: e.id,
          type: "thinking",
          name: "thinking",
          status: e.status,
          thinking: e.llm.thinking,
        })
      }
      continue
    }
  }

  return nodes
}

function makeSubagentNode(
  sub: Event,
  childrenBySubagent: Map<string, Event[]>,
  invocation?: Event,
): TimelineNode {
  const childEvents = childrenBySubagent.get(sub.id) ?? []
  const children: TimelineNode[] = childEvents
    .sort((a, b) => a.seq - b.seq)
    .map((c) => ({
      key: c.id,
      type: "tool" as const,
      name: c.tool?.name ? `tool:${c.tool.name}` : c.name,
      status: c.tool?.is_error ? "error" : c.status,
      duration_ms: c.duration_ms,
      tool: c.tool,
    }))

  const why =
    sub.subagent?.invocation_prompt ??
    (invocation?.tool?.input as { prompt?: string } | undefined)?.prompt

  return {
    key: sub.id,
    type: "subagent",
    name: sub.subagent?.agent_type ?? sub.name,
    status: sub.status,
    duration_ms: sub.duration_ms ?? invocation?.duration_ms,
    subagent: sub.subagent,
    agentType: sub.subagent?.agent_type,
    why,
    children,
  }
}
