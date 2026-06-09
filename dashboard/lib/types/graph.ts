export type GraphEdgeKind = "tool" | "handoff" | "invoke" | "mcp"

export type GraphNode = {
  id: string
  kind: "agent" | "mcp_server" | "tool_group"
  name: string
  role?: "root" | "child"
  model?: string
  description?: string
  tools?: string[]
  transport?: string
}

export type GraphEdge = {
  from: string
  to: string
  kind: GraphEdgeKind
  label?: string
}

export type AgentGraph = {
  root_id: string
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export type Manifest = {
  source: string
  captured_at: string
  graph: AgentGraph
}

export type TopologySummary = {
  graph_source?: string
  agents_declared: string[]
  agents_used: string[]
  tools_by_agent: Record<string, string[]>
  mcp_servers: string[]
  delegations: { from: string; to: string; kind: string }[]
}

export type AgentRegistry = {
  schema_version: string
  agent: { name: string; version?: string }
  manifest?: Manifest
  observed: {
    agents: string[]
    tools: string[]
    mcp_servers: string[]
    delegations: { from: string; to: string; kind: string }[]
  }
  session_count: number
  error_count: number
  last_seen: string
  last_session_id?: string
}

export type DiagramNode = {
  id: string
  kind: "agent" | "mcp_server"
  name: string
  role: "root" | "child"
  model?: string
  description?: string
  tools: string[]
  usedTools: string[]
  declaredOnly: boolean
  hasError: boolean
}

export type DiagramEdge = {
  from: string
  to: string
  kind: GraphEdgeKind
  label?: string
  observed: boolean
}

export type AgentDiagramData = {
  rootName: string
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  source: "registry" | "session" | "inferred"
  sessionCount?: number
}
