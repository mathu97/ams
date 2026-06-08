import type { AgentSummary, Session } from "@/lib/types"
import { getSession as fetchSession, listSessions } from "@/lib/storage"

export type { AgentSummary, Event, Session, Status } from "@/lib/types"

function aggregateAgents(sessions: Session[]): AgentSummary[] {
  const byName = new Map<string, Session[]>()
  for (const session of sessions) {
    const list = byName.get(session.agent.name) ?? []
    list.push(session)
    byName.set(session.agent.name, list)
  }

  const summaries: AgentSummary[] = []
  for (const [name, list] of byName) {
    const versions = Array.from(
      new Set(list.map((s) => s.agent.version).filter((v): v is string => Boolean(v))),
    ).sort()
    const tags = Array.from(new Set(list.flatMap((s) => s.tags))).sort()
    const last_active = list
      .map((s) => s.start_time)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]

    summaries.push({
      name,
      versions,
      session_count: list.length,
      error_count: list.filter((s) => s.status === "error").length,
      last_active,
      total_cost_usd: list.reduce((sum, s) => sum + (s.totals.cost_usd ?? 0), 0),
      total_tool_calls: list.reduce((sum, s) => sum + s.totals.tool_calls, 0),
      total_subagents: list.reduce((sum, s) => sum + s.totals.subagents, 0),
      tags,
    })
  }

  return summaries.sort(
    (a, b) => new Date(b.last_active).getTime() - new Date(a.last_active).getTime(),
  )
}

export async function getAgents(): Promise<AgentSummary[]> {
  return aggregateAgents(await listSessions())
}

export async function getSessionsByAgent(name: string): Promise<Session[]> {
  return (await listSessions()).filter((s) => s.agent.name === name)
}

export async function getAgent(name: string): Promise<AgentSummary | undefined> {
  return (await getAgents()).find((a) => a.name === name)
}

export async function getSession(id: string): Promise<Session | undefined> {
  return fetchSession(id)
}
