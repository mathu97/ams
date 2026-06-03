# Frontend notes (not built yet)

The frontend is intentionally out of scope for the first cut. These are notes so it stays simple when we do build it.

## Goal

Make it dead easy to (1) find a session and (2) read it end to end. This is the thing Arize does poorly for us.

## Data it reads

It reads straight from the same S3-compatible storage AMS writes to — no backend service required.

- **Session list:** list objects under `{prefix}/index/` and read the small summary JSONs. Each has `session_id`, `agent`, `environment`, `tags`, `status`, tokens, `cost_usd`, counts, and timestamps. Filter/sort/search over these client-side (or with S3 Select / a tiny indexer later).
- **Session detail:** on click, fetch the full `{prefix}/sessions/{YYYY}/{MM}/{DD}/{session_id}.json` and render the event timeline.

## Suggested views

1. **Sessions table** — columns: time, agent, environment, status, duration, tool calls, subagents, cost, tags. Free-text search across `session_id`, tags, metadata. Quick filters: status=error, environment, agent.
2. **Session timeline** — ordered events with a left-rail tree where `tool_call` events whose `parent_id` points at a `subagent` nest under it. Each event shows name, duration, and status; expand to see `input`/`result`, the model's `thinking`, or the subagent's `invocation_prompt`.
3. **Waterfall** — events laid out by `start_time`/`duration_ms` so slow tools and long subagents are obvious at a glance.

## Stack

Whatever's fastest to ship and matches the org — likely Next.js reading the bucket via a thin signed-URL proxy (don't expose bucket creds to the browser). Keep it read-only.
