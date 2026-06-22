import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { TopBar } from "@/components/top-bar"
import { FacetEntitiesTable } from "@/components/facet-entities-table"
import { getFacetEntities } from "@/lib/data"
import { getDataSource } from "@/lib/storage/config"
import { listFacetKeys } from "@/lib/storage"

export const dynamic = "force-dynamic"

export default async function FacetEntitiesPage({
  params,
}: {
  params: Promise<{ facet: string }>
}) {
  const { facet: facetParam } = await params
  const facet = decodeURIComponent(facetParam)
  const known = await listFacetKeys()
  if (!known.includes(facet)) notFound()

  const entities = await getFacetEntities(facet)

  return (
    <main className="min-h-screen">
      <TopBar active="facets" dataSource={getDataSource()} />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <Link
          href="/facets"
          className="mb-4 inline-flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          All facets
        </Link>
        <FacetEntitiesTable facet={facet} entities={entities} />
      </div>
    </main>
  )
}
