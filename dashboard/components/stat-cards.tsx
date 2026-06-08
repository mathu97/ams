import type { Session } from "@/lib/types"
import { formatCost, formatNumber } from "@/lib/format"

export function StatCards({ session }: { session: Session }) {
  const { totals } = session
  const cards: { label: string; value: string }[] = [
    { label: "Cost", value: formatCost(totals.cost_usd) },
    { label: "LLM Calls", value: formatNumber(totals.llm_calls) },
    { label: "Tool Calls", value: formatNumber(totals.tool_calls) },
    { label: "Subagents", value: formatNumber(totals.subagents) },
    {
      label: "Tokens (in / out)",
      value: `${formatNumber(totals.usage.input_tokens)} / ${formatNumber(
        totals.usage.output_tokens,
      )}`,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className="rounded-md border border-border bg-card p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {c.label}
          </div>
          <div className="mt-2 text-xl font-semibold tabular-nums text-primary">{c.value}</div>
        </div>
      ))}
    </div>
  )
}
