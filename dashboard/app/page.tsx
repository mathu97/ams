import { TopBar } from "@/components/top-bar"
import { AgentsTable } from "@/components/agents-table"
import { getAgents } from "@/lib/data"
import { getDataSource } from "@/lib/storage/config"

export const dynamic = "force-dynamic"

export default async function Page() {
  const agents = await getAgents()
  return (
    <main className="min-h-screen">
      <TopBar active="agents" dataSource={getDataSource()} />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <AgentsTable agents={agents} />
      </div>
    </main>
  )
}
