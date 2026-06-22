import { buildAgentDiagram } from "@/lib/build-agent-diagram"
import type {
  Activity,
  AgentSummary,
  EntityTimelineItem,
  FacetEntity,
  FacetMember,
  Session,
} from "@/lib/types"
import type { AgentDiagramData, Manifest } from "@/lib/types/graph"
import {
  getActivity,
  getAgentRegistry,
  getSession as fetchSession,
  listFacetKeys,
  listFacetMembers,
  listFacetValues,
  listSessionIndexes,
  listSessions,
} from "@/lib/storage"

export type { AgentSummary, Event, Session, Status } from "@/lib/types"
export type { AgentDiagramData } from "@/lib/types/graph"
export type { Activity, EntityTimelineItem, FacetEntity, FacetMember } from "@/lib/types"

export type FacetSummary = {
  facet: string
  entity_count: number
}

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

export async function getAgentDiagram(agentName: string): Promise<AgentDiagramData | null> {
  const registry = await getAgentRegistry(agentName)
  const indexes = await listSessionIndexes()
  const agentIndexes = indexes.filter((i) => i.agent?.name === agentName)
  const summaries = agentIndexes
    .map((i) => i.topology_summary)
    .filter((s): s is NonNullable<typeof s> => Boolean(s))

  let manifest: Manifest | null = registry?.manifest ?? null

  if (!manifest && registry?.last_session_id) {
    const session = await fetchSession(registry.last_session_id)
    manifest = session?.manifest ?? null
  }

  return buildAgentDiagram(agentName, {
    manifest,
    topologySummaries: summaries,
    registryObserved: registry?.observed ?? null,
    sessionCount: registry?.session_count ?? agentIndexes.length,
  })
}

function memberLabel(member: FacetMember): string {
  const summary = member.summary
  if (typeof summary.name === "string" && summary.name) return summary.name
  if (typeof summary.type === "string" && summary.type) return summary.type
  const agent = summary.agent as { name?: string } | undefined
  if (agent?.name) return agent.name
  return member.ref
}

function rollupFacetEntity(facet: string, value: string, members: FacetMember[]): FacetEntity {
  const session_count = members.filter((m) => m.kind === "session").length
  const activity_count = members.filter((m) => m.kind === "activity").length
  const last = members[members.length - 1]
  return {
    facet,
    value,
    member_count: members.length,
    session_count,
    activity_count,
    last_activity: last?.timestamp,
    last_label: last ? memberLabel(last) : undefined,
  }
}

export async function getFacetEntities(facet: string): Promise<FacetEntity[]> {
  const values = await listFacetValues(facet)
  const entities = await Promise.all(
    values.map(async (value) => {
      const members = await listFacetMembers(facet, value)
      return rollupFacetEntity(facet, value, members)
    }),
  )
  return entities.sort(
    (a, b) =>
      new Date(b.last_activity ?? 0).getTime() - new Date(a.last_activity ?? 0).getTime(),
  )
}

export async function getFacetSummaries(): Promise<FacetSummary[]> {
  const facets = await listFacetKeys()
  const summaries = await Promise.all(
    facets.map(async (facet) => ({
      facet,
      entity_count: (await listFacetValues(facet)).length,
    })),
  )
  return summaries.sort((a, b) => a.facet.localeCompare(b.facet))
}

export async function getEntityTimeline(
  facet: string,
  value: string,
): Promise<EntityTimelineItem[]> {
  const members = await listFacetMembers(facet, value)
  const items: EntityTimelineItem[] = []

  for (const member of members) {
    if (member.kind === "activity") {
      const activity = await getActivity(member.ref)
      items.push({
        kind: "activity",
        ref: member.ref,
        timestamp: member.timestamp,
        status: member.status,
        member,
        activity,
      })
    } else {
      items.push({
        kind: "session",
        ref: member.ref,
        timestamp: member.timestamp,
        status: member.status,
        member,
      })
    }
  }

  return items.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}
