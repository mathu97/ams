# ams-api

A lightweight read API over AMS trace storage. It exists so the dashboard stops
pulling every object out of R2 into memory on each page load — the API reads
from blob storage once (with a short TTL cache) and serves compact JSON.

It reuses the `ams` Python package as the canonical data layer (`ams.storage`,
`ams.load_entity_timeline`, the pydantic schema), so there is one implementation
of "how AMS data is read" shared by the SDK, this API, and (later) an MCP server.

## Architecture

```
app/
  main.py          FastAPI app (CORS, routers)
  config.py        HTTP-layer config (cache TTL, CORS origins)
  cache.py         tiny in-process TTL cache
  service.py       framework-agnostic data layer over `ams`  ← reused by a future MCP server
  routers/         thin HTTP adapters: health, agents, sessions, facets
```

`service.py` imports no web framework on purpose: the HTTP routers call it now,
and an MCP server can call the same functions later without a second data layer.

## Endpoints

| Method & path                | Returns |
|------------------------------|---------|
| `GET /healthz`               | status + resolved data source |
| `GET /agents`                | per-agent rollups (from the agent registry — O(agents), not a full session scan) |
| `GET /agents/{name}`         | one agent's registry record |
| `GET /agents/{name}/sessions`| that agent's session index summaries |
| `GET /sessions?agent=`       | session index summaries (compact, no event payloads) |
| `GET /sessions/{id}`         | the full session (events included) |
| `GET /facets/{facet}`        | every value of a facet (e.g. each `thread_id`) with a rollup |
| `GET /facets/{facet}/{value}`| the merged timeline for one entity: sessions + backend activities, by time |

Facets are generic: `GET /facets/thread_id`, `/facets/team_id`, etc. — whatever
the producers indexed. The dashboard's thread view is `GET /facets/thread_id` and
`GET /facets/thread_id/{gmail_thread_id}`.

## Configuration

Storage is configured by the same env the `ams` package reads:

- **S3/R2:** `AMS_S3_BUCKET`, `AMS_S3_PREFIX` (e.g. `email-agent`), `AMS_S3_ENDPOINT_URL`,
  `AMS_S3_REGION`, and AWS creds (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`).
- **Local:** `AMS_LOCAL_DIR` (or `AMS_STORAGE=local`).

HTTP-layer knobs:

- `AMS_API_CACHE_TTL` — seconds to cache hot list reads (default `30`).
- `AMS_API_CORS_ORIGINS` — comma-separated allowed origins (default `*`).

## Run locally

```bash
cd api
uv run uvicorn app.main:app --reload --port 8080
# point at data:
AMS_S3_BUCKET=sunday-agent-traces AMS_S3_PREFIX=email-agent \
AMS_S3_ENDPOINT_URL=https://<acct>.r2.cloudflarestorage.com \
AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
uv run uvicorn app.main:app --port 8080
```

## Deploy (container)

```dockerfile
FROM python:3.12-slim
WORKDIR /srv
COPY . /srv                     # repo root, so the ams package is available
RUN pip install ./api ./        # api + ams-observability from the repo
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--app-dir", "api"]
```

Set the `AMS_S3_*` env on the platform (Railway/Fly/etc.). It's a stateless read
service — scale horizontally; the only state is the per-instance TTL cache.

## Future: MCP

When we add an MCP server, it imports `app.service` and exposes the same reads as
tools (`list_facet_entities`, `get_entity_timeline`, `get_session`, ...). No new
data layer — same functions, different transport.
