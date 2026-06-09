import type { AgentDiagramData } from "@/lib/types/graph"

export type FlowTool = { name: string; used: boolean }

export type FlowAgentNode = {
  id: string
  name: string
  role: "root" | "child"
  model?: string
  description?: string
  declaredOnly: boolean
  hasError: boolean
  tools: FlowTool[]
  kind: "agent" | "mcp_server"
}

export type FlowEdge = {
  id: string
  label?: string
  kind: "invoke" | "handoff" | "mcp" | "tool"
  observed: boolean
}

export type FlowChild = {
  agent: FlowAgentNode
  edge: FlowEdge
}

export type FlowLayout = {
  root: FlowAgentNode
  rootTools: FlowTool[]
  children: FlowChild[]
  mcp: { agent: FlowAgentNode; edge?: FlowEdge }[]
}

function toAgentNode(node: {
  id: string
  name: string
  role?: "root" | "child"
  model?: string
  description?: string
  declaredOnly: boolean
  hasError: boolean
  tools: string[]
  usedTools: string[]
  kind: "agent" | "mcp_server"
}): FlowAgentNode {
  return {
    id: node.id,
    name: node.name,
    role: node.role ?? "root",
    model: node.model,
    description: node.description,
    declaredOnly: node.declaredOnly,
    hasError: node.hasError,
    tools: node.tools.map((t) => ({ name: t, used: node.usedTools.includes(t) })),
    kind: node.kind,
  }
}

export function buildFlowLayout(data: AgentDiagramData): FlowLayout | null {
  const rootNode = data.nodes.find((n) => n.role === "root" && n.kind === "agent")
  if (!rootNode) return null

  const childNodes = data.nodes.filter((n) => n.role === "child" && n.kind === "agent")
  const mcpNodes = data.nodes.filter((n) => n.kind === "mcp_server")
  const childEdges = data.edges.filter((e) => e.kind === "invoke" || e.kind === "handoff")

  const delegationLabels = new Set(
    childEdges.map((e) => e.label).filter((label): label is string => Boolean(label)),
  )

  const root = toAgentNode(rootNode)
  const rootTools: FlowTool[] = rootNode.tools
    .filter((t) => !delegationLabels.has(t))
    .map((t) => ({ name: t, used: rootNode.usedTools.includes(t) }))

  const children: FlowChild[] = childNodes.map((child) => {
    const edge = childEdges.find((e) => {
      const toNode = data.nodes.find((n) => n.id === e.to)
      return toNode?.name === child.name || e.to === child.id
    })
    const edgeId = edge ? `${edge.from}->${edge.to}` : `edge->${child.id}`
    return {
      agent: toAgentNode(child),
      edge: {
        id: edgeId,
        label: edge?.label ?? edge?.kind,
        kind: edge?.kind ?? "invoke",
        observed: edge?.observed ?? false,
      },
    }
  })

  const mcp = mcpNodes.map((node) => {
    const edge = data.edges.find((e) => e.kind === "mcp" && e.to === node.id)
    return {
      agent: toAgentNode(node),
      edge: edge
        ? {
            id: `${edge.from}->${edge.to}`,
            label: edge.label ?? "mcp",
            kind: "mcp" as const,
            observed: edge.observed,
          }
        : undefined,
    }
  })

  return { root, rootTools, children, mcp }
}
