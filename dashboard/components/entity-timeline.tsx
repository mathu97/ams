import Link from "next/link"
import type { EntityTimelineItem } from "@/lib/types"
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/format"

export function EntityTimeline({ items }: { items: EntityTimelineItem[] }) {
  return (
    <section className="rounded-md border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Timeline
        </h2>
      </div>
      <ol className="relative px-4 py-2">
        {items.map((item, index) => (
          <li
            key={`${item.kind}:${item.ref}:${item.timestamp}`}
            className="relative pl-6 pb-6 last:pb-4"
          >
            {index < items.length - 1 ? (
              <span
                className="absolute left-[7px] top-3 h-[calc(100%-4px)] w-px bg-border"
                aria-hidden
              />
            ) : null}
            <span
              className={`absolute left-0 top-1.5 size-[15px] rounded-full border-2 ${
                item.status === "error"
                  ? "border-error bg-error/20"
                  : item.kind === "session"
                    ? "border-primary bg-primary/15"
                    : "border-peach bg-peach/20"
              }`}
              aria-hidden
            />
            {item.kind === "session" ? (
              <SessionRow item={item} />
            ) : (
              <ActivityRow item={item} />
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

function SessionRow({ item }: { item: EntityTimelineItem }) {
  const summary = item.member.summary
  const agent = summary.agent as { name?: string } | undefined
  const agentName =
    agent?.name ??
    (typeof summary.session_id === "string" ? summary.session_id : item.ref)

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-primary">
          session
        </span>
        <span className="text-[13px] font-medium text-foreground">{agentName}</span>
        <TimeStamp iso={item.timestamp} />
      </div>
      <Link
        href={`/sessions/${encodeURIComponent(item.ref)}`}
        className="mt-1 inline-block text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        → session detail
      </Link>
    </div>
  )
}

function ActivityRow({ item }: { item: EntityTimelineItem }) {
  const activity = item.activity
  const attrs = activity?.attributes ?? {}
  const { chips, blocks } = partitionAttributes(attrs)

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {activity?.source ?? "activity"}
        </span>
        <span className="text-[13px] font-medium text-foreground">
          {activity?.name ??
            (typeof item.member.summary.name === "string"
              ? item.member.summary.name
              : item.ref)}
        </span>
        {activity?.type ? (
          <span className="font-mono text-[11px] text-muted-foreground">{activity.type}</span>
        ) : null}
        <TimeStamp iso={item.timestamp} />
        {item.status === "error" ? (
          <span className="text-[10px] uppercase tracking-wide text-error">error</span>
        ) : null}
      </div>

      {activity?.note ? (
        <p className="mt-1 text-[12px] text-muted-foreground">{activity.note}</p>
      ) : null}

      {chips.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map(({ key, value, highlight }) => (
            <AttrChip key={key} label={key} value={value} highlight={highlight} />
          ))}
        </div>
      ) : null}

      {blocks.map(({ key, value }) => (
        <details key={key} className="mt-2 rounded border border-border bg-muted/40">
          <summary className="cursor-pointer px-3 py-2 font-mono text-[11px] text-muted-foreground">
            {key}
          </summary>
          <pre className="max-h-64 overflow-auto border-t border-border px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap text-foreground">
            {value}
          </pre>
        </details>
      ))}
    </div>
  )
}

function partitionAttributes(attrs: Record<string, unknown>): {
  chips: { key: string; value: string; highlight?: boolean }[]
  blocks: { key: string; value: string }[]
} {
  const chips: { key: string; value: string; highlight?: boolean }[] = []
  const blocks: { key: string; value: string }[] = []

  const entries = Object.entries(attrs).sort(([a], [b]) => {
    if (a === "human_edited") return -1
    if (b === "human_edited") return 1
    if (a === "reason_code") return -1
    if (b === "reason_code") return 1
    return a.localeCompare(b)
  })

  for (const [key, raw] of entries) {
    if (raw == null || raw === "") continue
    if (typeof raw === "object") continue

    const text = formatAttrValue(raw)
    if (text.includes("\n") || text.length > 120) {
      blocks.push({ key, value: text })
      continue
    }

    chips.push({
      key,
      value: text,
      highlight: key === "human_edited" && raw === true,
    })
  }

  return { chips, blocks }
}

function TimeStamp({ iso }: { iso: string }) {
  return (
    <time
      className="text-[11px] text-muted-foreground"
      dateTime={iso}
      title={formatAbsoluteTime(iso)}
    >
      {formatRelativeTime(iso)}
    </time>
  )
}

function AttrChip({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] ${
        highlight
          ? "border-error/40 bg-error/15 text-error"
          : "border-border bg-muted text-foreground"
      }`}
    >
      <span className="text-muted-foreground">{label}=</span>
      <span className="truncate">{value}</span>
    </span>
  )
}

function formatAttrValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ")
  if (typeof value === "boolean") return value ? "true" : "false"
  return String(value)
}
