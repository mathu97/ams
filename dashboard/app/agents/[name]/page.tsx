import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { TopBar } from "@/components/top-bar"
import { AgentDiagram } from "@/components/agent-diagram"
import { SessionsTable } from "@/components/sessions-table"
import { getAgent, getAgentDiagram, getSessionsByAgent } from "@/lib/data"
import { getDataSource } from "@/lib/storage/config"

export const dynamic = "force-dynamic"

export default async function AgentPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const agentName = decodeURIComponent(name)
  const agent = await getAgent(agentName)
  if (!agent) notFound()

  const sessions = await getSessionsByAgent(agentName)
  const diagram = await getAgentDiagram(agentName)

  return (
    <main className="min-h-screen">
      <TopBar active="agents" dataSource={getDataSource()} />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          All agents
        </Link>

        <div className="mb-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-primary">{agent.name}</h1>
          {agent.versions.length > 0 && (
            <span className="text-[13px] text-muted-foreground">
              {agent.versions.map((v) => `v${v}`).join(", ")}
            </span>
          )}
          <div className="ml-auto flex flex-wrap gap-1.5">
            {agent.tags.map((t) => (
              <span
                key={t}
                className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {diagram && <AgentDiagram data={diagram} />}

        <SessionsTable sessions={sessions} title="Sessions" showAgent={false} />
      </div>
    </main>
  )
}
