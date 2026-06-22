import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { TopBar } from "@/components/top-bar"
import { EntityTimeline } from "@/components/entity-timeline"
import { getEntityTimeline } from "@/lib/data"
import { getDataSource } from "@/lib/storage/config"
import { listFacetKeys } from "@/lib/storage"

export const dynamic = "force-dynamic"

export default async function FacetEntityPage({
  params,
}: {
  params: Promise<{ facet: string; value: string }>
}) {
  const { facet: facetParam, value: valueParam } = await params
  const facet = decodeURIComponent(facetParam)
  const value = decodeURIComponent(valueParam)

  const known = await listFacetKeys()
  if (!known.includes(facet)) notFound()

  const timeline = await getEntityTimeline(facet, value)
  if (timeline.length === 0) notFound()

  const sessionCount = timeline.filter((item) => item.kind === "session").length
  const activityCount = timeline.filter((item) => item.kind === "activity").length

  return (
    <main className="min-h-screen">
      <TopBar active="facets" dataSource={getDataSource()} />
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-8">
        <Link
          href={`/facets/${encodeURIComponent(facet)}`}
          className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          {facet}
        </Link>

        <header>
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            {facet}
          </p>
          <h1 className="font-mono text-lg font-semibold tracking-tight text-foreground">{value}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {sessionCount} session{sessionCount === 1 ? "" : "s"} · {activityCount}{" "}
            activit{activityCount === 1 ? "y" : "ies"}
          </p>
        </header>

        <EntityTimeline items={timeline} />
      </div>
    </main>
  )
}
