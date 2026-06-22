"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown } from "lucide-react"
import type { FacetEntity } from "@/lib/types"
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/format"

export function FacetEntitiesTable({
  facet,
  entities,
}: {
  facet: string
  entities: FacetEntity[]
}) {
  const router = useRouter()
  const [filter, setFilter] = useState("")

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return entities.filter((e) => {
      if (!q) return true
      const haystack = [e.value, e.last_label ?? ""].join(" ").toLowerCase()
      return haystack.includes(q)
    })
  }, [entities, filter])

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-mono text-xl font-semibold tracking-tight text-primary">{facet}</h1>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by value or last event…"
          className="h-9 w-full max-w-md rounded-md border border-border bg-card px-3 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:border-peach focus:outline-none"
          aria-label="Filter entities"
        />
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <Th className="pl-4">Value</Th>
              <Th>Last event</Th>
              <Th className="text-right">Sessions</Th>
              <Th className="text-right">Activities</Th>
              <Th className="pr-4 text-right">
                <span className="inline-flex items-center gap-1">
                  Last active <ChevronDown className="size-3" aria-hidden />
                </span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  {entities.length === 0
                    ? "No entities indexed for this facet."
                    : "No entities match your filter."}
                </td>
              </tr>
            )}
            {filtered.map((e) => (
              <tr
                key={e.value}
                onClick={() =>
                  router.push(`/facets/${encodeURIComponent(facet)}/${encodeURIComponent(e.value)}`)
                }
                className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/60"
              >
                <td className="py-3 pl-4 font-mono text-[12px] text-foreground">{e.value}</td>
                <td className="py-3 text-foreground">{e.last_label ?? "—"}</td>
                <td className="py-3 text-right tabular-nums text-foreground">{e.session_count}</td>
                <td className="py-3 text-right tabular-nums text-foreground">
                  {e.activity_count}
                </td>
                <td
                  className="py-3 pr-4 text-right text-foreground"
                  title={e.last_activity ? formatAbsoluteTime(e.last_activity) : undefined}
                >
                  {e.last_activity ? formatRelativeTime(e.last_activity) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`py-2.5 px-2 font-medium first:pl-4 ${className}`}>
      <span className="text-[11px] uppercase tracking-wide">{children}</span>
    </th>
  )
}
