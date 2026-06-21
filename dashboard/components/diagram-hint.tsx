"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { HintContent } from "@/lib/diagram-hints"

type TooltipCoords = {
  top: number
  left: number
  above: boolean
}

function measureAnchor(el: HTMLElement): TooltipCoords {
  const rect = el.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  const above = spaceBelow < 100 && rect.top > 100
  return {
    top: above ? rect.top - 6 : rect.bottom + 6,
    left: rect.left + rect.width / 2,
    above,
  }
}

function coordsFromPoint(x: number, y: number): TooltipCoords {
  const spaceBelow = window.innerHeight - y
  const above = spaceBelow < 100 && y > 100
  return {
    top: above ? y - 6 : y + 6,
    left: x,
    above,
  }
}

export function DiagramTooltip({
  hint,
  coords,
  id,
}: {
  hint: HintContent
  coords: TooltipCoords
  id?: string
}) {
  return createPortal(
    <div
      id={id}
      role="tooltip"
      style={{
        top: coords.top,
        left: coords.left,
        transform: coords.above ? "translate(-50%, -100%)" : "translateX(-50%)",
      }}
      className="pointer-events-none fixed z-[1000] w-max max-w-[240px] rounded-md border border-border bg-popover px-2.5 py-2 text-popover-foreground shadow-md"
    >
      <p className="text-[11px] font-medium text-foreground">{hint.title}</p>
      <ul className="mt-1 space-y-0.5 text-[10px] leading-relaxed text-muted-foreground">
        {hint.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>,
    document.body,
  )
}

export function DiagramHint({
  hint,
  children,
  className = "",
}: {
  hint: HintContent
  children: React.ReactNode
  className?: string
}) {
  const id = useId()
  const anchorRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<TooltipCoords | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const updateCoords = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    setCoords(measureAnchor(el))
  }, [])

  const show = () => {
    updateCoords()
    setOpen(true)
  }

  const hide = () => setOpen(false)

  useEffect(() => {
    if (!open) return
    updateCoords()
    const onMove = () => updateCoords()
    window.addEventListener("scroll", onMove, true)
    window.addEventListener("resize", onMove)
    return () => {
      window.removeEventListener("scroll", onMove, true)
      window.removeEventListener("resize", onMove)
    }
  }, [open, updateCoords])

  return (
    <>
      <div
        ref={anchorRef}
        className={`cursor-help ${className}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <div aria-describedby={open ? id : undefined}>{children}</div>
      </div>
      {open && mounted && coords ? (
        <DiagramTooltip hint={hint} coords={coords} id={id} />
      ) : null}
    </>
  )
}

export { coordsFromPoint }
export type { TooltipCoords }
