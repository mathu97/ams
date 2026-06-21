"use client"

import Link from "next/link"

export function TopBar({
  active,
  dataSource,
}: {
  active?: "agents"
  /** Server-provided label avoids client env / hydration mismatch */
  dataSource?: string
}) {
  const source = dataSource ?? "…"

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-tight text-primary">ams</span>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            agent monitoring system
          </span>
        </Link>

        <nav className="flex items-center gap-5 text-[13px]">
          <Link
            href="/"
            className={
              active === "agents"
                ? "text-foreground underline decoration-peach decoration-2 underline-offset-[6px]"
                : "text-muted-foreground hover:text-foreground"
            }
          >
            Agents
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-3 text-[13px] text-muted-foreground">
          <span className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] uppercase tracking-wide md:inline">
            {source}
          </span>
          <span className="hidden md:inline">Docs</span>
        </div>
      </div>
    </header>
  )
}
