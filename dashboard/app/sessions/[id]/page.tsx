import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { TopBar } from "@/components/top-bar"
import { SessionHeader } from "@/components/session-header"
import { StatCards } from "@/components/stat-cards"
import { Timeline } from "@/components/timeline"
import { getSession } from "@/lib/data"
import { buildTimeline } from "@/lib/timeline"

export const dynamic = "force-dynamic"

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getSession(id)
  if (!session) notFound()

  const nodes = buildTimeline(session)

  return (
    <main className="min-h-screen">
      <TopBar active="agents" />
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-8">
        <Link
          href={`/agents/${encodeURIComponent(session.agent.name)}`}
          className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          {session.agent.name} sessions
        </Link>

        <SessionHeader session={session} />
        <StatCards session={session} />
        <Timeline nodes={nodes} />
      </div>
    </main>
  )
}
