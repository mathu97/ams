/**
 * Tiny in-process TTL cache for server-side data reads.
 *
 * The dashboard's data comes from S3/R2, and each page assembles it from many
 * object reads (one GET per session index, per facet member, ...). Without
 * caching, every request re-does that whole fan-out. This memoizes the assembled
 * results for a short window so the fan-out is paid once per window and shared
 * across all in-flight and subsequent requests on this server instance.
 *
 * It caches the in-flight Promise (not just the resolved value), so a burst of
 * concurrent requests for a cold key triggers a single load. Failures are never
 * cached — the entry is evicted so the next call retries.
 *
 * Window via AMS_CACHE_TTL_SECONDS (default 30; set 0 to disable).
 */

const DEFAULT_TTL_SECONDS = 30
const ttlMs = Number(process.env.AMS_CACHE_TTL_SECONDS ?? DEFAULT_TTL_SECONDS) * 1000

type Entry = { expires: number; value: Promise<unknown> }

const store = new Map<string, Entry>()

export function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  if (!(ttlMs > 0)) return loader()

  const now = Date.now()
  const existing = store.get(key)
  if (existing && existing.expires > now) {
    return existing.value as Promise<T>
  }

  const entry: Entry = { expires: now + ttlMs, value: Promise.resolve() }
  entry.value = loader().catch((err) => {
    if (store.get(key) === entry) store.delete(key)
    throw err
  })
  store.set(key, entry)
  return entry.value as Promise<T>
}
