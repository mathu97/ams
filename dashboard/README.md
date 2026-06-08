# AMS Dashboard

Read-only Next.js UI for browsing AMS agent sessions. Reads directly from the same storage layout the Python SDK writes — no separate backend.

## Data sources

| Source | Config |
|---|---|
| **S3** | `AMS_S3_BUCKET` (+ optional `AMS_S3_PREFIX`, `AMS_S3_ENDPOINT_URL`, `AMS_S3_REGION`) |
| **Local** | `AMS_LOCAL_DIR` (same layout as S3) |

Set `AMS_DATA_SOURCE=s3|local` to force a source; otherwise it auto-detects from `AMS_S3_BUCKET` / `AMS_LOCAL_DIR`.

### S3 layout (matches `ams.storage.s3.S3Storage`)

```
{prefix}/index/{session_id}.json          # compact summaries for the session list
{prefix}/sessions/{YYYY}/{MM}/{DD}/{session_id}.json   # full session + events
```

The dashboard lists `index/` objects, then fetches the full session object on demand. Credentials stay server-side (Next.js server components + `@aws-sdk/client-s3`); nothing is exposed to the browser.

## Quick start

```bash
cd dashboard
pnpm install
cp .env.example .env.local   # set AMS_S3_BUCKET
pnpm dev
```

Open http://localhost:3000.

### Point at a bucket

```bash
export AMS_S3_BUCKET=my-ams-bucket
export AMS_S3_PREFIX=ams          # optional, default ams
export AWS_REGION=us-east-1       # or AMS_S3_REGION
pnpm dev
```

For R2 / MinIO:

```bash
export AMS_S3_BUCKET=ams
export AMS_S3_ENDPOINT_URL=https://<account>.r2.cloudflarestorage.com
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
```

### Local dev (no S3)

If you've been writing sessions with `LocalStorage`:

```bash
export AMS_DATA_SOURCE=local
export AMS_LOCAL_DIR=../ams-data
pnpm dev
```

## Views

- **Agents** — aggregated stats per agent name
- **Agent sessions** — filterable session table
- **Session detail** — timeline with prompts, thinking, tools, subagents
