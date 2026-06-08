import type { Session } from "@/lib/types"
import { formatAbsoluteTime, formatDuration, formatRelativeTime } from "@/lib/format"
import { CopyChip } from "./copy-chip"

export function SessionHeader({ session }: { session: Session }) {
  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <CopyChip value={session.session_id} />
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tracking-tight text-primary">
              {session.agent.name}
            </span>
            {session.agent.version && (
              <span className="text-[13px] text-muted-foreground">v{session.agent.version}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {session.environment && <Chip>{session.environment}</Chip>}
            {session.tags.map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-[13px] sm:grid-cols-3">
          <Field label="status">
            <span className={session.status === "ok" ? "text-ok" : "text-error"}>
              {session.status}
            </span>
          </Field>
          <Field label="started">
            <span title={formatAbsoluteTime(session.start_time)}>
              {formatRelativeTime(session.start_time)}
            </span>
          </Field>
          <Field label="duration">{formatDuration(session.duration_ms)}</Field>
        </dl>
      </div>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
      {children}
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-foreground">{children}</dd>
    </div>
  )
}
