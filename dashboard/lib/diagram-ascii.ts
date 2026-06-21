import type { FlowAgentNode, FlowTool } from "@/lib/build-flow-diagram"

/** ~12px mono char width at text-[12px] */
export const DIAGRAM_CHAR_PX = 7.2

export function padLine(text: string, width: number): string {
  const inner = Math.max(width - 2, text.length)
  return `| ${text.padEnd(inner)} |`
}

export function boxWidth(node: Pick<FlowAgentNode, "name" | "model">): number {
  const lines = [node.name, node.model].filter(Boolean) as string[]
  return Math.max(12, ...lines.map((l) => l.length + 4))
}

export function boxBorder(width: number): string {
  return `+-${"-".repeat(width - 2)}-+`
}

export function agentBoxHeight(node: Pick<FlowAgentNode, "name" | "model">): number {
  const lines = [node.name, node.model].filter(Boolean).length
  return Math.ceil(lines * 12 * 1.35 + 12 * 1.35 * 2)
}

export function agentPixelWidth(node: Pick<FlowAgentNode, "name" | "model">): number {
  return boxWidth(node) * DIAGRAM_CHAR_PX
}

export function toolGroupPixelWidth(tools: FlowTool[]): number {
  if (tools.length === 0) return 0
  const longest = Math.max(
    ...tools.map((t) => (t.used ? t.name.length : t.name.length + 2) + 2),
    8,
  )
  return longest * DIAGRAM_CHAR_PX + 20
}
