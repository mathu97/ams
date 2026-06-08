"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown } from "lucide-react"
import type { AgentSummary } from "@/lib/types"
import { formatAbsoluteTime, formatCost, formatRelativeTime } from "@/lib/format"

export function AgentsTable({ agents }: { agents: AgentSummary[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState("")

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return agents.filter((a) => {
      if (!q) return true
      const haystack = [a.name, ...a.versions, ...a.tags].join(" ").toLowerCase()
      return haystack.includes(q)
    })
  }, [agents, filter])

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-primary">Agents</h1>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by agent name or tag…"
          className="h-9 w-full max-w-md rounded-md border border-border bg-card px-3 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:border-peach focus:outline-none"
          aria-label="Filter agents"
        />
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <Th className="pl-4">Agent</Th>
              <Th>Tags</Th>
              <Th className="text-right">Sessions</Th>
              <Th className="text-right">Errors</Th>
              <Th className="text-right">Tools</Th>
              <Th className="text-right">Cost</Th>
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
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No agents match your filter.
                </td>
              </tr>
            )}
            {filtered.map((a) => (
              <tr
                key={a.name}
                onClick={() => router.push(`/agents/${encodeURIComponent(a.name)}`)}
                className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/60"
              >
                <td className="py-3 pl-4">
                  <span className="text-foreground">{a.name}</span>
                  {a.versions.length > 0 && (
                    <span className="ml-2 text-muted-foreground">
                      {a.versions.map((v) => `v${v}`).join(", ")}
                    </span>
                  )}
                </td>
                <td className="py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {a.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-3 text-right tabular-nums text-foreground">{a.session_count}</td>
                <td className="py-3 text-right tabular-nums">
                  <span className={a.error_count > 0 ? "text-error" : "text-muted-foreground"}>
                    {a.error_count}
                  </span>
                </td>
                <td className="py-3 text-right tabular-nums text-foreground">{a.total_tool_calls}</td>
                <td className="py-3 text-right tabular-nums text-foreground">
                  {formatCost(a.total_cost_usd)}
                </td>
                <td
                  className="py-3 pr-4 text-right text-foreground"
                  title={formatAbsoluteTime(a.last_active)}
                >
                  {formatRelativeTime(a.last_active)}
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
