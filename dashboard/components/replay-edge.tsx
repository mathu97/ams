"use client"

import { useLayoutEffect, useRef } from "react"
import { getSmoothStepPath, type EdgeProps } from "@xyflow/react"

import type { HintEdgeData } from "@/lib/build-react-flow-graph"

const EDGE_STROKE = "#9ca3af"
const HIGHLIGHT_STROKE = "#f59e0b"

function ArrowHead({
  x,
  y,
  angle,
  color,
}: {
  x: number
  y: number
  angle: number
  color: string
}) {
  return (
    <polygon
      points="0,-4 8,0 0,4"
      fill={color}
      transform={`translate(${x},${y}) rotate(${angle})`}
    />
  )
}

export function ReplayEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    style,
  } = props
  const edgeData = data as HintEdgeData | undefined
  const progress = edgeData?.drawProgress ?? 0
  const highlighted = edgeData?.highlighted

  const pathRef = useRef<SVGPathElement>(null)
  const pathLenRef = useRef(0)

  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  useLayoutEffect(() => {
    const el = pathRef.current
    if (!el) return
    pathLenRef.current = el.getTotalLength()
  }, [path, sourceX, sourceY, targetX, targetY])

  if (progress <= 0.001) return null

  const pathLen = pathRef.current?.getTotalLength() ?? pathLenRef.current
  const stroke = highlighted ? HIGHLIGHT_STROKE : EDGE_STROKE
  const visible = pathLen > 0 ? pathLen * progress : 0
  const dashOffset = pathLen > 0 ? pathLen - visible : 0

  let tip: { x: number; y: number; angle: number } | null = null
  const el = pathRef.current
  if (el && pathLen > 0 && progress > 0.05) {
    const at = Math.min(pathLen, Math.max(4, pathLen * progress))
    const point = el.getPointAtLength(at)
    const prev = el.getPointAtLength(Math.max(0, at - 6))
    tip = {
      x: point.x,
      y: point.y,
      angle: (Math.atan2(point.y - prev.y, point.x - prev.x) * 180) / Math.PI,
    }
  }

  return (
    <g>
      <path
        ref={pathRef}
        id={id}
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={highlighted ? 2.5 : 1.5}
        strokeDasharray={pathLen > 0 ? pathLen : undefined}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        style={{ ...style, opacity: 0.35 + progress * 0.65 }}
      />
      {tip ? <ArrowHead x={tip.x} y={tip.y} angle={tip.angle} color={stroke} /> : null}
    </g>
  )
}
