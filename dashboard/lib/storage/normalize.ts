import type { Event, Session, SessionIndex, Status } from "@/lib/types"

function asStatus(value: unknown): Status {
  return value === "error" ? "error" : "ok"
}

export function indexToSession(index: SessionIndex): Session {
  return {
    session_id: index.session_id,
    trace_id: index.trace_id,
    agent: {
      name: index.agent?.name ?? "unknown",
      version: index.agent?.version,
    },
    environment: index.environment,
    tags: index.tags ?? [],
    metadata: (index.metadata ?? {}) as Record<string, string>,
    start_time: index.start_time,
    end_time: index.end_time ?? index.start_time,
    duration_ms: index.duration_ms ?? 0,
    status: asStatus(index.status),
    totals: {
      usage: {
        input_tokens: index.input_tokens ?? 0,
        output_tokens: index.output_tokens ?? 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      cost_usd: index.cost_usd ?? null,
      llm_calls: index.llm_calls ?? 0,
      tool_calls: index.tool_calls ?? 0,
      subagents: index.subagents ?? 0,
      errors: index.errors ?? 0,
    },
    events: [],
  }
}

export function parseSession(raw: unknown): Session {
  const data = raw as Record<string, unknown>
  const agent = (data.agent ?? {}) as { name?: string; version?: string }
  const totals = (data.totals ?? {}) as Record<string, unknown>
  const usage = (totals.usage ?? {}) as Record<string, number>

  return {
    session_id: String(data.session_id),
    trace_id: String(data.trace_id),
    agent: {
      name: agent.name ?? "unknown",
      version: agent.version,
    },
    environment: data.environment as string | undefined,
    tags: (data.tags as string[]) ?? [],
    metadata: (data.metadata as Record<string, string>) ?? {},
    start_time: String(data.start_time),
    end_time: String(data.end_time ?? data.start_time),
    duration_ms: Number(data.duration_ms ?? 0),
    status: asStatus(data.status),
    totals: {
      usage: {
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      },
      cost_usd: (totals.cost_usd as number | null | undefined) ?? null,
      llm_calls: Number(totals.llm_calls ?? 0),
      tool_calls: Number(totals.tool_calls ?? 0),
      subagents: Number(totals.subagents ?? 0),
      errors: Number(totals.errors ?? 0),
      num_turns: totals.num_turns as number | undefined,
      duration_ms: totals.duration_ms as number | undefined,
    },
    events: ((data.events as Event[]) ?? []).map((event) => ({
      ...event,
      status: asStatus(event.status),
    })),
  }
}

export function sessionObjectKey(prefix: string, sessionId: string, startTime: string): string {
  const date = startTime.slice(0, 10).replace(/-/g, "/")
  return `${prefix}/sessions/${date}/${sessionId}.json`
}
