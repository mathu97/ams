"use client"

import { useState } from "react"
import { ChevronRight } from "lucide-react"
import type { TimelineNode, TimelineNodeType } from "@/lib/timeline"
import { formatDuration } from "@/lib/format"

const TYPE_LABEL: Record<TimelineNodeType, string> = {
  prompt: "PROMPT",
  thinking: "THINKING",
  tool: "TOOL",
  subagent: "SUBAGENT",
  answer: "ANSWER",
}

export function Timeline({ nodes }: { nodes: TimelineNode[] }) {
  return (
    <div className="rounded-md border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-[11px] uppercase tracking-wide text-muted-foreground">Timeline</h2>
      </div>
      <ul>
        {nodes.map((node, i) => (
          <TimelineRow key={node.key} node={node} last={i === nodes.length - 1} />
        ))}
      </ul>
    </div>
  )
}

function TimelineRow({
  node,
  last,
  nested = false,
}: {
  node: TimelineNode
  last?: boolean
  nested?: boolean
}) {
  // Answers expanded by default (prominent); everything else collapsed.
  const [open, setOpen] = useState(node.type === "answer")
  const expandable = hasDetail(node)

  return (
    <li className={last ? "" : "border-b border-border"}>
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
          expandable ? "hover:bg-muted/50" : "cursor-default"
        } ${nested ? "pl-10" : ""}`}
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
          className={`flex-1 truncate text-[13px] ${
            node.type === "answer" ? "font-medium text-primary" : "text-foreground"
          }`}
        >
          {node.type === "subagent" ? (node.agentType ?? node.name) : node.name}
        </span>

        {node.duration_ms != null && (node.type === "tool" || node.type === "subagent") && (
          <span className="shrink-0 tabular-nums text-[12px] text-muted-foreground">
            {formatDuration(node.duration_ms)}
          </span>
        )}
        <span
          className={`shrink-0 text-[12px] ${
            node.status === "ok" ? "text-ok" : "text-error"
          }`}
        >
          {node.status}
        </span>
      </button>

      {open && expandable && (
        <div className={`px-4 pb-4 ${nested ? "pl-10" : "pl-[7.25rem]"}`}>
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
    case "subagent":
      return !!node.why || (node.children?.length ?? 0) > 0
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

    case "subagent":
      return (
        <div className="flex flex-col gap-3">
          {node.why && (
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                why spawned
              </div>
              <div className="border-l-2 border-border pl-3 text-[13px] leading-relaxed text-foreground/90">
                {node.why}
              </div>
            </div>
          )}
          {node.children && node.children.length > 0 && (
            <div className="overflow-hidden rounded-md border border-border">
              <ul>
                {node.children.map((c, i) => (
                  <TimelineRow
                    key={c.key}
                    node={c}
                    nested
                    last={i === node.children!.length - 1}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      )

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
      {input != null && (
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            input
          </div>
          <Code>{JSON.stringify(input, null, 2)}</Code>
        </div>
      )}

      {result != null && (
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              result
            </span>
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
