"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react"
import type { Session } from "@/lib/types"
import {
  formatAbsoluteTime,
  formatCost,
  formatDuration,
  formatRelativeTime,
} from "@/lib/format"

const PAGE_SIZE = 5

export function SessionsTable({
  sessions,
  title = "Sessions",
  showAgent = true,
}: {
  sessions: Session[]
  title?: string
  showAgent?: boolean
}) {
  const router = useRouter()
  const [filter, setFilter] = useState("")
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return sessions
      .filter((s) => (errorsOnly ? s.status === "error" : true))
      .filter((s) => {
        if (!q) return true
        const haystack = [s.agent.name, s.session_id, ...s.tags].join(" ").toLowerCase()
        return haystack.includes(q)
      })
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
  }, [sessions, filter, errorsOnly])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const rows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-primary">{title}</h1>
      </div>

      {/* controls */}
      <div className="mb-3 flex items-center gap-3">
        <input
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value)
            setPage(0)
          }}
          placeholder={
            showAgent ? "Filter by agent, tag, or session id…" : "Filter by tag or session id…"
          }
          className="h-9 w-full max-w-md rounded-md border border-border bg-card px-3 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:border-peach focus:outline-none"
          aria-label="Filter sessions"
        />
        <label className="ml-auto flex cursor-pointer select-none items-center gap-2 text-[13px] text-muted-foreground">
          <button
            type="button"
            role="switch"
            aria-checked={errorsOnly}
            onClick={() => {
              setErrorsOnly((v) => !v)
              setPage(0)
            }}
            className={`relative h-5 w-9 rounded-full border border-border transition-colors ${
              errorsOnly ? "bg-peach" : "bg-muted"
            }`}
          >
            <span
              className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-card shadow-sm transition-all ${
                errorsOnly ? "left-[18px]" : "left-0.5"
              }`}
            />
          </button>
          errors only
        </label>
      </div>

      {/* table */}
      <div className="overflow-hidden rounded-md border border-border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <Th className="pl-4">
                <span className="inline-flex items-center gap-1">
                  Started <ChevronDown className="size-3" aria-hidden />
                </span>
              </Th>
              {showAgent && <Th>Agent</Th>}
              <Th>Status</Th>
              <Th className="text-right">Duration</Th>
              <Th className="text-right">Tools</Th>
              <Th className="text-right">Subagents</Th>
              <Th className="pr-4 text-right">Cost</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={showAgent ? 7 : 6} className="px-4 py-10 text-center text-muted-foreground">
                  No sessions match your filter.
                </td>
              </tr>
            )}
            {rows.map((s) => (
              <tr
                key={s.session_id}
                onClick={() => router.push(`/sessions/${s.session_id}`)}
                className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/60"
              >
                <td className="py-3 pl-4 text-foreground" title={formatAbsoluteTime(s.start_time)}>
                  {formatRelativeTime(s.start_time)}
                </td>
                {showAgent && <td className="py-3 text-foreground">{s.agent.name}</td>}
                <td className="py-3">
                  <StatusText status={s.status} />
                </td>
                <td className="py-3 text-right tabular-nums text-foreground">
                  {formatDuration(s.duration_ms)}
                </td>
                <td className="py-3 text-right tabular-nums text-foreground">
                  {s.totals.tool_calls}
                </td>
                <td className="py-3 text-right tabular-nums text-foreground">
                  {s.totals.subagents}
                </td>
                <td className="py-3 pr-4 text-right tabular-nums text-foreground">
                  {formatCost(s.totals.cost_usd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      <div className="mt-3 flex items-center justify-end gap-3 text-[12px] text-muted-foreground">
        <span>
          {filtered.length === 0
            ? "0 results"
            : `${safePage * PAGE_SIZE + 1}–${Math.min(
                (safePage + 1) * PAGE_SIZE,
                filtered.length,
              )} of ${filtered.length}`}
        </span>
        <div className="flex items-center gap-2">
          <PageButton disabled={safePage === 0} onClick={() => setPage((p) => p - 1)} label="Previous page">
            <ChevronLeft className="size-4" aria-hidden />
          </PageButton>
          <PageButton
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => p + 1)}
            label="Next page"
          >
            <ChevronRight className="size-4" aria-hidden />
          </PageButton>
        </div>
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

function StatusText({ status }: { status: "ok" | "error" }) {
  return (
    <span className={status === "ok" ? "text-ok" : "text-error"}>{status}</span>
  )
}

function PageButton({
  children,
  disabled,
  onClick,
  label,
}: {
  children: React.ReactNode
  disabled?: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-7 items-center justify-center rounded-md border border-peach/60 bg-peach/20 text-peach-foreground transition-colors hover:bg-peach/40 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground/50"
    >
      {children}
    </button>
  )
}
