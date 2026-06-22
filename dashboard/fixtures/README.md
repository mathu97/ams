# Mock AMS data for dashboard development

Fixtures matching AMS 0.3.0 layout. Uses `thread_id` and `team_id` as example facet keys — the dashboard treats all facets generically.

## Quick start

```bash
# Into fixtures only (isolated)
uv run python dashboard/fixtures/seed_facet_mock_data.py

# Merge into your dev AMS_LOCAL_DIR (keeps existing sessions)
uv run python dashboard/fixtures/seed_facet_mock_data.py --merge-into ams-data

export AMS_DATA_SOURCE=local
export AMS_LOCAL_DIR=../ams-data   # from dashboard/
cd dashboard && pnpm dev
```

Browse **http://localhost:3000/facets** → pick a facet key → pick an entity value.

## Example facets in mock data

| Facet | Example values |
|-------|----------------|
| `thread_id` | Gmail-style correlation ids (sessions + backend activities) |
| `team_id` | `sweat-and-tonic` (rollup pointer only) |

Regenerate: `uv run python dashboard/fixtures/seed_facet_mock_data.py`
