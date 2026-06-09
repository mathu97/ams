import type {
  AgentDiagramData,
  AgentGraph,
  AgentRegistry,
  DiagramEdge,
  DiagramNode,
  GraphEdgeKind,
  Manifest,
  TopologySummary,
} from "@/lib/types/graph"

type Observed = {
  agents: string[]
  tools: string[]
  toolsByAgent: Record<string, string[]>
  mcpServers: string[]
  delegations: { from: string; to: string; kind: string }[]
  errorsByAgent: Record<string, number>
}

function mergeObserved(summaries: TopologySummary[]): Observed {
  const agents = new Set<string>()
  const tools = new Set<string>()
  const toolsByAgent: Record<string, Set<string>> = {}
  const mcpServers = new Set<string>()
  const delegations = new Map<string, { from: string; to: string; kind: string }>()
  const errorsByAgent: Record<string, number> = {}

  for (const summary of summaries) {
    for (const a of summary.agents_used ?? []) agents.add(a)
    for (const a of summary.agents_declared ?? []) agents.add(a)
    for (const s of summary.mcp_servers ?? []) mcpServers.add(s)
    for (const [agent, list] of Object.entries(summary.tools_by_agent ?? {})) {
      agents.add(agent)
      const bucket = toolsByAgent[agent] ?? new Set()
      for (const t of list) {
        bucket.add(t)
        tools.add(t)
      }
      toolsByAgent[agent] = bucket
    }
    for (const d of summary.delegations ?? []) {
      delegations.set(`${d.from}->${d.to}:${d.kind}`, d)
    }
  }

  return {
    agents: [...agents],
    tools: [...tools],
    toolsByAgent: Object.fromEntries(
      Object.entries(toolsByAgent).map(([k, v]) => [k, [...v].sort()]),
    ),
    mcpServers: [...mcpServers],
    delegations: [...delegations.values()],
    errorsByAgent,
  }
}

function observedFromRegistry(observed: {
  agents: string[]
  tools: string[]
  mcp_servers: string[]
  delegations: { from: string; to: string; kind: string }[]
}): Observed {
  return {
    agents: observed.agents,
    tools: observed.tools,
    toolsByAgent: {},
    mcpServers: observed.mcp_servers,
    delegations: observed.delegations,
    errorsByAgent: {},
  }
}

function buildFromGraph(
  graph: AgentGraph,
  observed: Observed,
  rootName: string,
): AgentDiagramData {
  const agentNodes = graph.nodes.filter((n) => n.kind === "agent")
  const mcpNodes = graph.nodes.filter((n) => n.kind === "mcp_server")

  const nodes: DiagramNode[] = []

  for (const node of agentNodes) {
    const declaredTools =
      node.tools ??
      graph.edges
        .filter((e) => e.from === node.id && e.kind === "tool")
        .map((e) => e.label ?? e.to)
        .filter(Boolean)

    const usedFromAgent = observed.toolsByAgent[node.name] ?? []
    const usedTools = [...new Set([...usedFromAgent, ...observed.tools.filter((t) => declaredTools.includes(t))])]
    const wasUsed =
      observed.agents.includes(node.name) ||
      usedTools.length > 0 ||
      node.role === "root"

    nodes.push({
      id: node.id,
      kind: "agent",
      name: node.name,
      role: node.role === "child" ? "child" : "root",
      model: node.model,
      description: node.description,
      tools: declaredTools,
      usedTools: usedTools.filter((t) => declaredTools.includes(t) || usedFromAgent.includes(t)),
      declaredOnly: !wasUsed && node.role === "child",
      hasError: (observed.errorsByAgent[node.name] ?? 0) > 0,
    })
  }

  for (const node of mcpNodes) {
    const wasUsed = observed.mcpServers.includes(node.name)
    nodes.push({
      id: node.id,
      kind: "mcp_server",
      name: node.name,
      role: "root",
      model: undefined,
      description: node.transport ? `${node.transport} transport` : undefined,
      tools: node.tools ?? [],
      usedTools: wasUsed ? node.tools ?? [] : [],
      declaredOnly: !wasUsed,
      hasError: false,
    })
  }

  const edges: DiagramEdge[] = graph.edges
    .filter((e) => e.kind !== "tool")
    .map((e) => {
      const fromNode = graph.nodes.find((n) => n.id === e.from)
      const toNode = graph.nodes.find((n) => n.id === e.to)
      const fromName = fromNode?.name ?? e.from
      const toName = toNode?.name ?? e.to
      const observedEdge =
        e.kind === "mcp"
          ? observed.mcpServers.includes(toName)
          : observed.delegations.some(
              (d) => d.from === fromName && d.to === toName && d.kind === e.kind,
            )
      return {
        from: e.from,
        to: e.to,
        kind: e.kind as GraphEdgeKind,
        label: e.label,
        observed: observedEdge,
      }
    })

  return { rootName, nodes, edges, source: "registry" as const }
}

function buildInferred(rootName: string, observed: Observed): AgentDiagramData {
  const childAgents = observed.agents.filter((a) => a !== rootName)
  const nodes: DiagramNode[] = [
    {
      id: "root",
      kind: "agent",
      name: rootName,
      role: "root",
      tools: observed.toolsByAgent[rootName] ?? [],
      usedTools: observed.toolsByAgent[rootName] ?? [],
      declaredOnly: false,
      hasError: (observed.errorsByAgent[rootName] ?? 0) > 0,
    },
  ]

  for (const child of childAgents) {
    const tools = observed.toolsByAgent[child] ?? []
    nodes.push({
      id: child,
      kind: "agent",
      name: child,
      role: "child",
      tools,
      usedTools: tools,
      declaredOnly: false,
      hasError: (observed.errorsByAgent[child] ?? 0) > 0,
    })
  }

  for (const mcp of observed.mcpServers) {
    nodes.push({
      id: `mcp:${mcp}`,
      kind: "mcp_server",
      name: mcp,
      role: "root",
      tools: [],
      usedTools: [],
      declaredOnly: false,
      hasError: false,
    })
  }

  const edges: DiagramEdge[] = observed.delegations.map((d) => ({
    from: d.from === rootName ? "root" : d.from,
    to: d.to,
    kind: d.kind as GraphEdgeKind,
    label: d.kind,
    observed: true,
  }))

  return { rootName, nodes, edges, source: "inferred" }
}

export function buildAgentDiagram(
  rootName: string,
  opts: {
    manifest?: Manifest | null
    topologySummaries?: TopologySummary[]
    registryObserved?: AgentRegistry["observed"] | null
    sessionCount?: number
  },
): AgentDiagramData | null {
  const summaries = opts.topologySummaries ?? []
  let observed = mergeObserved(summaries)
  if (opts.registryObserved) {
    const reg = observedFromRegistry(opts.registryObserved)
    observed = {
      agents: [...new Set([...observed.agents, ...reg.agents])],
      tools: [...new Set([...observed.tools, ...reg.tools])],
      toolsByAgent: { ...observed.toolsByAgent, ...reg.toolsByAgent },
      mcpServers: [...new Set([...observed.mcpServers, ...reg.mcpServers])],
      delegations: [...observed.delegations, ...reg.delegations],
      errorsByAgent: observed.errorsByAgent,
    }
  }

  if (opts.manifest?.graph) {
    const data = buildFromGraph(opts.manifest.graph, observed, rootName)
    return { ...data, source: "session" as const, sessionCount: opts.sessionCount }
  }

  if (observed.agents.length === 0 && observed.tools.length === 0) {
    return null
  }

  return {
    ...buildInferred(rootName, observed),
    sessionCount: opts.sessionCount,
  }
}
