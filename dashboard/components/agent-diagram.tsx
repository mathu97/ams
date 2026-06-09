import { DiagramHint } from "@/components/diagram-hint"
import {
  buildFlowLayout,
  type FlowAgentNode,
  type FlowChild,
  type FlowEdge,
  type FlowLayout,
  type FlowTool,
} from "@/lib/build-flow-diagram"
import { agentHint, agentToolEdgeHint, edgeHint, toolHint, type HintContent } from "@/lib/diagram-hints"
import type { AgentDiagramData } from "@/lib/types/graph"

function padLine(text: string, width: number): string {
  const inner = Math.max(width - 2, text.length)
  return `| ${text.padEnd(inner)} |`
}

function boxWidth(node: FlowAgentNode): number {
  const lines = [node.name, node.model, node.description?.slice(0, 36)].filter(Boolean) as string[]
  return Math.max(12, ...lines.map((l) => l.length + 4))
}

function AsciiBox({ node }: { node: FlowAgentNode }) {
  const w = boxWidth(node)
  const border = "+-" + "-".repeat(w - 2) + "-+"

  return (
    <DiagramHint hint={agentHint(node)} className={`shrink-0 ${node.declaredOnly ? "opacity-45" : ""}`}>
      <pre
        tabIndex={0}
        className={`m-0 cursor-help text-[12px] leading-[1.35] outline-none ${node.hasError ? "text-error" : "text-foreground"}`}
      >
        <span className="text-foreground/35">{border}</span>
        {"\n"}
        {padLine(node.name, w)}
        {node.model && (
          <>
            {"\n"}
            <span className="text-muted-foreground">{padLine(node.model, w)}</span>
          </>
        )}
        {"\n"}
        <span className="text-foreground/35">{border}</span>
      </pre>
    </DiagramHint>
  )
}

function ToolChip({ tool, agentName }: { tool: FlowTool; agentName: string }) {
  const label = tool.used ? tool.name : `(${tool.name})`

  return (
    <DiagramHint hint={toolHint(tool, agentName)}>
      <span
        tabIndex={0}
        className={`inline-block shrink-0 cursor-help border px-2 py-0.5 text-[11px] outline-none ${
          tool.used
            ? "border-foreground/30 text-foreground"
            : "border-dashed border-foreground/20 text-muted-foreground"
        }`}
      >
        [{label}]
      </span>
    </DiagramHint>
  )
}

function FlowArrow({
  label,
  dashed,
  edge,
  hint,
}: {
  label?: string
  dashed?: boolean
  edge?: FlowEdge
  hint?: HintContent
}) {
  const tooltip = hint ?? (edge ? edgeHint(edge) : agentToolEdgeHint("agent"))

  return (
    <DiagramHint hint={tooltip} className="shrink-0 px-3">
      <div
        tabIndex={0}
        className="flex cursor-help flex-col items-center text-foreground/35 outline-none"
      >
        {label && (
          <span className="mb-0.5 whitespace-nowrap text-[10px] uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        )}
        <span className={`text-[12px] ${dashed ? "text-muted-foreground/60" : ""}`}>
          {dashed ? "- - - - ▷" : "──────▷"}
        </span>
      </div>
    </DiagramHint>
  )
}

function AgentTools({ agent }: { agent: FlowAgentNode }) {
  const arrowHint = agentToolEdgeHint(agent.name)
  if (agent.tools.length === 0) return null

  if (agent.tools.length === 1) {
    return (
      <span className="flex items-center">
        <FlowArrow hint={arrowHint} />
        <ToolChip tool={agent.tools[0]} agentName={agent.name} />
      </span>
    )
  }

  return (
    <div className="ml-1 flex flex-col gap-1.5 border-l border-foreground/20 pl-2">
      {agent.tools.map((tool) => (
        <div key={tool.name} className="flex items-center">
          <FlowArrow hint={arrowHint} />
          <ToolChip tool={tool} agentName={agent.name} />
        </div>
      ))}
    </div>
  )
}

function Branch({ child }: { child: FlowChild }) {
  return (
    <div className="flex items-center">
      <FlowArrow label={child.edge.label} dashed={!child.edge.observed} edge={child.edge} />
      <AsciiBox node={child.agent} />
      <AgentTools agent={child.agent} />
    </div>
  )
}

function FlowDiagram({ layout }: { layout: FlowLayout }) {
  const singleBranch = layout.children.length === 1

  return (
    <div className="overflow-x-auto rounded-md border border-border bg-muted/40 p-4">
      <div className="flex min-w-max items-center">
        <AsciiBox node={layout.root} />

        {layout.rootTools.length === 1 ? (
          <span className="flex items-center">
            <FlowArrow hint={agentToolEdgeHint(layout.root.name)} />
            <ToolChip tool={layout.rootTools[0]} agentName={layout.root.name} />
          </span>
        ) : layout.rootTools.length > 1 ? (
          <div className="ml-1 flex flex-col gap-1.5 border-l border-foreground/20 pl-2">
            {layout.rootTools.map((tool) => (
              <div key={tool.name} className="flex items-center">
                <FlowArrow hint={agentToolEdgeHint(layout.root.name)} />
                <ToolChip tool={tool} agentName={layout.root.name} />
              </div>
            ))}
          </div>
        ) : null}

        {singleBranch ? (
          <Branch child={layout.children[0]} />
        ) : layout.children.length > 1 ? (
          <div className="ml-1 flex flex-col gap-2 border-l border-foreground/20 pl-3">
            {layout.children.map((child) => (
              <Branch key={child.agent.id} child={child} />
            ))}
          </div>
        ) : null}
      </div>

      {layout.mcp.length > 0 && (
        <div className="mt-4 flex min-w-max items-center border-t border-dashed border-border pt-4">
          {layout.mcp.map(({ agent, edge }) => (
            <span key={agent.id} className="flex items-center">
              {edge && <FlowArrow label={edge.label} dashed={!edge.observed} edge={edge} />}
              <AsciiBox node={agent} />
              <AgentTools agent={agent} />
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function AgentDiagram({ data }: { data: AgentDiagramData }) {
  const layout = buildFlowLayout(data)
  if (!layout) return null

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
          Architecture
        </h2>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {data.sessionCount != null && <span>{data.sessionCount} sessions</span>}
          <span className="rounded border border-border px-1.5 py-0.5 uppercase">{data.source}</span>
        </div>
      </div>

      <FlowDiagram layout={layout} />

      <p className="mt-2 text-[10px] text-muted-foreground">
        Hover for details · (tool) = declared only
      </p>
    </section>
  )
}
