"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

export function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-[12px] text-foreground transition-colors hover:bg-muted/70"
      aria-label="Copy session id"
    >
      <span className="tabular-nums">{value}</span>
      {copied ? (
        <Check className="size-3 text-ok" aria-hidden />
      ) : (
        <Copy className="size-3 text-muted-foreground" aria-hidden />
      )}
    </button>
  )
}
