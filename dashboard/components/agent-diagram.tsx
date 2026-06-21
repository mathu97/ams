import { AgentFlowCanvas } from "@/components/agent-flow-canvas"
import { buildFlowLayout } from "@/lib/build-flow-diagram"
import type { AgentDiagramData } from "@/lib/types/graph"

export function AgentDiagram({ data }: { data: AgentDiagramData }) {
  const layout = buildFlowLayout(data)
  if (!layout) return null

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
          Architecture
        </h2>
        {data.sessionCount != null && (
          <span className="text-[10px] text-muted-foreground">{data.sessionCount} sessions</span>
        )}
      </div>

      <AgentFlowCanvas data={data} />
    </section>
  )
}
