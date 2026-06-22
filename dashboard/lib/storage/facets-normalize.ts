import type { Activity, FacetMember, Status } from "@/lib/types"

function asStatus(value: unknown): Status {
  return value === "error" ? "error" : "ok"
}

export function parseFacetMember(raw: unknown): FacetMember {
  const data = raw as Record<string, unknown>
  return {
    kind: data.kind === "activity" ? "activity" : "session",
    ref: String(data.ref),
    ref_key: data.ref_key != null ? String(data.ref_key) : undefined,
    timestamp: String(data.timestamp),
    status: asStatus(data.status),
    summary: (data.summary as Record<string, unknown>) ?? {},
  }
}

export function parseActivity(raw: unknown): Activity {
  const data = raw as Record<string, unknown>
  return {
    schema_version: data.schema_version as string | undefined,
    id: String(data.id),
    source: String(data.source),
    type: String(data.type),
    name: String(data.name),
    timestamp: String(data.timestamp),
    status: asStatus(data.status),
    environment: data.environment as string | undefined,
    tags: (data.tags as string[]) ?? [],
    metadata: (data.metadata as Record<string, string>) ?? {},
    attributes: (data.attributes as Record<string, unknown>) ?? {},
    note: data.note as string | undefined,
  }
}
