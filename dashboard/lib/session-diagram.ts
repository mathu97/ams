import { buildAgentDiagram } from "@/lib/build-agent-diagram"
import type { Session, Topology } from "@/lib/types"
import type { AgentDiagramData, TopologySummary } from "@/lib/types/graph"

function topologyToSummary(topology: Topology): TopologySummary {
  return {
    agents_used: topology.agents_used,
    agents_declared: [],
    tools_by_agent: topology.tools_by_agent,
    mcp_servers: [...new Set(topology.mcp_tools_used.map((m) => m.server))],
    delegations: topology.delegation_edges.map((d) => ({
      from: d.from_agent,
      to: d.to_agent,
      kind: d.kind,
    })),
  }
}

export function buildSessionDiagram(session: Session): AgentDiagramData | null {
  if (!session.manifest?.graph) return null
  return buildAgentDiagram(session.agent.name, {
    manifest: session.manifest,
    topologySummaries: session.topology ? [topologyToSummary(session.topology)] : undefined,
  })
}
