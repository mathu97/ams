import { TopBar } from "@/components/top-bar"
import { FacetsTable } from "@/components/facets-table"
import { getFacetSummaries } from "@/lib/data"
import { getDataSource } from "@/lib/storage/config"

export const dynamic = "force-dynamic"

export default async function FacetsPage() {
  const facets = await getFacetSummaries()

  return (
    <main className="min-h-screen">
      <TopBar active="facets" dataSource={getDataSource()} />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <FacetsTable facets={facets} />
      </div>
    </main>
  )
}
