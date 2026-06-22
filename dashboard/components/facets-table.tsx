"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown } from "lucide-react"
import type { FacetSummary } from "@/lib/data"

export function FacetsTable({ facets }: { facets: FacetSummary[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState("")

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return facets.filter((f) => !q || f.facet.toLowerCase().includes(q))
  }, [facets, filter])

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-primary">Facets</h1>
      </div>

      <p className="mb-4 max-w-2xl text-[13px] text-muted-foreground">
        Browse by entity facet — any metadata key AMS indexes (e.g.{" "}
        <code className="text-foreground/80">thread_id</code>,{" "}
        <code className="text-foreground/80">team_id</code>). Each facet groups sessions and
        standalone activities that share the same value.
      </p>

      <div className="mb-3 flex items-center gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter facet keys…"
          className="h-9 w-full max-w-md rounded-md border border-border bg-card px-3 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:border-peach focus:outline-none"
          aria-label="Filter facets"
        />
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <Th className="pl-4">Facet key</Th>
              <Th className="pr-4 text-right">Entities</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-10 text-center text-muted-foreground">
                  {facets.length === 0
                    ? "No facet indexes found."
                    : "No facets match your filter."}
                </td>
              </tr>
            )}
            {filtered.map((f) => (
              <tr
                key={f.facet}
                onClick={() => router.push(`/facets/${encodeURIComponent(f.facet)}`)}
                className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/60"
              >
                <td className="py-3 pl-4 font-mono text-[12px] text-foreground">{f.facet}</td>
                <td className="py-3 pr-4 text-right tabular-nums text-foreground">
                  {f.entity_count}
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
