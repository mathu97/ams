export type Status = "ok" | "error"

export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export type Totals = {
  usage: Usage
  cost_usd: number | null
  llm_calls: number
  tool_calls: number
  subagents: number
  errors: number
  num_turns?: number
  duration_ms?: number
}

export type Event = {
  id: string
  seq: number
  parent_id?: string | null
  type: "user_prompt" | "llm_message" | "tool_call" | "subagent" | "notification"
  name: string
  start_time: string
  end_time?: string
  duration_ms?: number | null
  status: Status
  note?: string
  scope?: string | null
  agent_id?: string | null
  prompt?: string
  llm?: {
    model?: string
    stop_reason?: string
    text?: string
    thinking?: string
    message_id?: string
    usage?: Record<string, unknown>
  }
  tool?: {
    name: string
    kind?: string
    tool_use_id?: string
    input?: unknown
    result?: unknown
    is_error?: boolean
  }
  subagent?: {
    agent_id: string
    agent_type?: string
    invocation_prompt?: string
    invocation_event_id?: string
    transcript_path?: string
    delegation_kind?: string
    spawn_tool_use_id?: string
    target_agent?: string
  }
}

export type Topology = {
  agents_used: string[]
  tools_by_agent: Record<string, string[]>
  mcp_tools_used: { server: string; tool: string; calls: number; errors: number }[]
  models_by_agent: Record<string, string>
  delegation_edges: {
    from_agent: string
    to_agent: string
    kind: string
    trigger_tool_use_id?: string
    subagent_event_id?: string
    status?: Status
  }[]
  errors_by_agent: Record<string, number>
}

export type Session = {
  session_id: string
  trace_id: string
  agent: { name: string; version?: string }
  environment?: string
  tags: string[]
  metadata: Record<string, string>
  start_time: string
  end_time: string
  duration_ms: number
  status: Status
  totals: Totals
  events: Event[]
  manifest?: import("@/lib/types/graph").Manifest
  topology?: Topology
}

export type AgentSummary = {
  name: string
  versions: string[]
  session_count: number
  error_count: number
  last_active: string
  total_cost_usd: number
  total_tool_calls: number
  total_subagents: number
  tags: string[]
}

/** Compact index record written by AMS under `{prefix}/index/{session_id}.json`. */
export type SessionIndex = {
  session_id: string
  trace_id: string
  agent: { name?: string; version?: string }
  environment?: string
  tags?: string[]
  metadata?: Record<string, string>
  start_time: string
  end_time?: string
  duration_ms?: number
  status: Status
  input_tokens?: number
  output_tokens?: number
  cost_usd?: number | null
  llm_calls?: number
  tool_calls?: number
  subagents?: number
  errors?: number
  topology_summary?: import("@/lib/types/graph").TopologySummary
}

export type Activity = {
  schema_version?: string
  id: string
  source: string
  type: string
  name: string
  timestamp: string
  status: Status
  environment?: string
  tags?: string[]
  metadata?: Record<string, string>
  attributes?: Record<string, unknown>
  note?: string
}

export type FacetMember = {
  kind: "session" | "activity"
  ref: string
  ref_key?: string
  timestamp: string
  status: Status
  summary: Record<string, unknown>
}

export type EntityTimelineItem = {
  kind: "session" | "activity"
  ref: string
  timestamp: string
  status: Status
  member: FacetMember
  activity?: Activity
}

export type FacetEntity = {
  facet: string
  value: string
  member_count: number
  session_count: number
  activity_count: number
  last_activity?: string
  last_label?: string
}
