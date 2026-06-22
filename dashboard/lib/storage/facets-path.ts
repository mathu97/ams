const base = (prefix: string) => (prefix ? `${prefix}/` : "")

export function facetsRootPrefix(prefix: string): string {
  return `${base(prefix)}facets/`
}

export function facetValuesPrefix(prefix: string, facet: string): string {
  return `${base(prefix)}facets/${encodeURIComponent(facet)}/`
}

export function facetMembersPrefix(prefix: string, facet: string, value: string): string {
  return `${base(prefix)}facets/${encodeURIComponent(facet)}/${encodeURIComponent(value)}/members/`
}

export function activityObjectKey(prefix: string, id: string): string {
  return `${base(prefix)}activities/${id}.json`
}
