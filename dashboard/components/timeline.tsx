"use client"

import { useState } from "react"
import { ChevronRight } from "lucide-react"
import type { TimelineEntry, TimelineGroup, TimelineNode, TimelineNodeType, TimelineSection } from "@/lib/timeline"
import { formatDuration } from "@/lib/format"

const TYPE_LABEL: Record<TimelineNodeType, string> = {
  prompt: "PROMPT",
  thinking: "THINKING",
  tool: "TOOL",
  subagent: "SUBAGENT",
  answer: "ANSWER",
}

export function Timeline({ groups }: { groups: TimelineGroup[] }) {
  return (
    <div className="rounded-md border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-[11px] uppercase tracking-wide text-muted-foreground">Timeline</h2>
      </div>
      <div className="divide-y divide-border">
        {groups.map((group) => (
          <TimelineGroupBlock key={group.key} group={group} />
        ))}
      </div>
    </div>
  )
}

function TimelineGroupBlock({ group }: { group: TimelineGroup }) {
  const [open, setOpen] = useState(true)

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 bg-muted/30 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
      >
        <ChevronRight
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">agent</span>
        <span className="flex-1 truncate text-[13px] font-medium text-foreground">{group.agentName}</span>
      </button>

      {open && (
        <div className="space-y-0 pb-3">
          {group.entries.map((entry, i) => (
            <GroupEntry key={entryKey(entry, i)} entry={entry} />
          ))}
        </div>
      )}
    </section>
  )
}

function entryKey(entry: TimelineEntry, index: number): string {
  if (entry.kind === "subagent") return entry.section.key
  return `nodes-${index}`
}

function GroupEntry({ entry }: { entry: TimelineEntry }) {
  if (entry.kind === "subagent") {
    return <SubagentSection section={entry.section} />
  }
  if (entry.nodes.length === 0) return null
  return (
    <div className="px-4">
      <NodeList nodes={entry.nodes} />
    </div>
  )
}

function SubagentSection({ section }: { section: TimelineSection }) {
  return (
    <div className="mx-4 mb-2 ml-10 border-l-2 border-foreground/15 pl-4">
      <p className="mb-2 pt-1 text-[10px] text-muted-foreground">
        spawned by{" "}
        <span className="text-foreground">{section.parentAgentName ?? "parent"}</span>
        {section.spawnVia && (
          <>
            {" "}
            · via <span className="text-foreground">{section.spawnVia}</span>
          </>
        )}
      </p>
      <SubagentBlock section={section} />
    </div>
  )
}

function SubagentBlock({ section }: { section: TimelineSection }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="overflow-hidden rounded-md border border-border bg-muted/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-sm bg-orange-500/[0.10] px-4 py-2.5 text-left transition-colors hover:bg-orange-500/[0.14]"
      >
        <ChevronRight
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">sub-agent</span>
        <span className="flex-1 truncate text-[13px] font-medium text-foreground">{section.agentName}</span>
        {section.duration_ms != null && (
          <span className="shrink-0 tabular-nums text-[12px] text-muted-foreground">
            {formatDuration(section.duration_ms)}
          </span>
        )}
        <span
          className={`shrink-0 text-[12px] ${section.status === "ok" ? "text-ok" : "text-error"}`}
        >
          {section.status}
        </span>
      </button>

      {open && (
        <div className="border-t border-border px-4 pb-3 pt-2">
          {section.why && (
            <div className="mb-3 border-l-2 border-border pl-3">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                delegated prompt
              </div>
              <p className="text-[13px] leading-relaxed text-foreground/90">{section.why}</p>
            </div>
          )}
          {section.nodes.length > 0 && <NodeList nodes={section.nodes} />}
        </div>
      )}
    </div>
  )
}

function NodeList({ nodes }: { nodes: TimelineNode[] }) {
  return (
    <ul className="overflow-hidden rounded-md border border-border bg-card">
      {nodes.map((node, i) => (
        <TimelineRow key={node.key} node={node} last={i === nodes.length - 1} />
      ))}
    </ul>
  )
}

function isSpawnTool(node: TimelineNode): boolean {
  const name = node.tool?.name
  return name === "Task" || name === "Agent" || node.tool?.kind === "agent"
}

function rowBgClass(node: TimelineNode): string {
  if (node.type !== "tool") return ""
  return isSpawnTool(node) ? "bg-orange-500/[0.10]" : "bg-green-500/[0.10]"
}

function TimelineRow({
  node,
  last,
}: {
  node: TimelineNode
  last?: boolean
}) {
  const [open, setOpen] = useState(node.type === "answer")
  const expandable = hasDetail(node)

  return (
    <li className={`rounded-sm ${rowBgClass(node)} ${last ? "" : "border-b border-border"}`}>
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
          expandable ? "hover:bg-muted/50" : "cursor-default"
        }`}
      >
        <ChevronRight
          className={`size-3.5 shrink-0 text-muted-foreground/60 transition-transform ${
            open ? "rotate-90" : ""
          } ${expandable ? "" : "opacity-0"}`}
          aria-hidden
        />
        <span className="w-20 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
          {TYPE_LABEL[node.type]}
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-[13px] ${
            node.type === "answer" ? "font-medium text-primary" : "text-foreground"
          }`}
        >
          {node.type === "tool" ? (node.tool?.name ?? node.name) : node.name}
        </span>

        {node.duration_ms != null && node.type === "tool" && (
          <span className="shrink-0 tabular-nums text-[12px] text-muted-foreground">
            {formatDuration(node.duration_ms)}
          </span>
        )}
        <span
          className={`shrink-0 text-[12px] ${node.status === "ok" ? "text-ok" : "text-error"}`}
        >
          {node.status}
        </span>
      </button>

      {open && expandable && (
        <div className="px-4 pb-4 pl-[7.25rem]">
          <NodeDetail node={node} />
        </div>
      )}
    </li>
  )
}

function hasDetail(node: TimelineNode): boolean {
  switch (node.type) {
    case "prompt":
      return !!node.prompt
    case "thinking":
      return !!node.thinking
    case "answer":
      return !!node.answerText
    case "tool":
      return node.tool?.input != null || node.tool?.result != null
    default:
      return false
  }
}

function NodeDetail({ node }: { node: TimelineNode }) {
  switch (node.type) {
    case "prompt":
      return <Para>{node.prompt}</Para>

    case "thinking":
      return (
        <div className="border-l-2 border-peach pl-3 text-[13px] leading-relaxed text-foreground/90">
          {node.thinking}
        </div>
      )

    case "answer":
      return (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-[13px] leading-relaxed text-foreground">
          {node.answerText}
        </div>
      )

    case "tool":
      return <ToolDetail node={node} />

    default:
      return null
  }
}

function ToolDetail({ node }: { node: TimelineNode }) {
  const [showResult, setShowResult] = useState(false)
  const input = node.tool?.input
  const result = node.tool?.result
  const resultStr = result != null ? JSON.stringify(result, null, 2) : ""
  const isLarge = resultStr.length > 280

  return (
    <div className="flex flex-col gap-3">
      {node.tool?.kind && (
        <p className="text-[11px] text-muted-foreground">
          kind: <span className="text-foreground">{node.tool.kind}</span>
        </p>
      )}

      {input != null && (
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">input</div>
          <Code>{JSON.stringify(input, null, 2)}</Code>
        </div>
      )}

      {result != null && (
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">result</span>
            {isLarge && (
              <button
                type="button"
                onClick={() => setShowResult((v) => !v)}
                className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                {showResult ? "hide result" : "show result"}
              </button>
            )}
          </div>
          {(!isLarge || showResult) && <Code>{resultStr}</Code>}
          {isLarge && !showResult && (
            <div className="text-[12px] text-muted-foreground/70">
              {resultStr.length.toLocaleString()} chars collapsed
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Para({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-foreground">{children}</p>
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-[12px] leading-relaxed text-foreground">
      <code>{children}</code>
    </pre>
  )
}
