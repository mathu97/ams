import type { AgentRegistry } from "@/lib/types/graph"

function agentRegistryPath(prefix: string, agentName: string): string {
  const safe = encodeURIComponent(agentName)
  const base = prefix ? `${prefix.replace(/^\/|\/$/g, "")}/` : ""
  return `${base}agents/${safe}.json`
}

export { agentRegistryPath }

export type { AgentRegistry }
