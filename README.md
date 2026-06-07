# AMS — Agent Monitoring System

A **super simple** monitoring system for [Claude agents](https://docs.claude.com/en/api/agent-sdk/overview). Capture a whole Claude Agent SDK session end to end — every tool call, every subagent and *why* it was invoked, the model's reasoning, results, timing, and cost — as **one readable JSON object** in blob storage.

No collector, no database, no agent. One JSON file per session in S3-compatible storage. Built to be trivially easy to read and filter (the things that make Arize and friends painful).

```python
from ams.claude import traced_query

async for message in traced_query(prompt="Cancel my membership", options=options):
    ...
# session written to storage automatically when the stream ends
```

That's the whole integration. Swap `query` for `traced_query`.

## Why

We monitor our Claude agents with Arize today, but it's hard to read, and hard to search/filter for a single session. AMS keeps the data model deliberately flat and typed so a session is obvious to a human and easy to query by a machine. Field names follow the [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) (`gen_ai.*`) where there's a natural equivalent, so the data can later be re-emitted as OTLP without renaming.

## What it captures

A session is one trace of ordered **events**:

| Event | Source | Detail captured |
|---|---|---|
| `user_prompt` | `UserPromptSubmit` hook | the prompt |
| `llm_message` | message stream | model, **thinking / chain-of-thought**, assistant text, token usage |
| `tool_call` | `PreToolUse` + `PostToolUse` / `PostToolUseFailure` hooks | tool name, input, result, error, **timing** |
| `subagent` | `SubagentStart` / `SubagentStop` hooks | agent type, **why it was invoked** (the prompt), transcript path; child tool calls nest underneath |
| `notification` | `Notification` hook | message |

Plus session **totals**: token usage (incl. cache read/write), cost (USD), turn count, tool/subagent/error counts, and wall-clock + API duration.

The Claude Agent SDK has **no built-in OpenTelemetry** — AMS captures everything through hooks and the message stream, which together are the only place this data lives.

## Install

```bash
pip install "ams-py[s3]"     # published name is ams-py; you import it as `ams`
```

Or from a local checkout: `pip install -e ".[s3]"`.

Requires Python 3.10+ and the [`claude-agent-sdk`](https://pypi.org/project/claude-agent-sdk/) in your project.

## Configure storage

S3-compatible storage is the default. Works against **AWS S3, Cloudflare R2, MinIO** — anything speaking the S3 API.

```bash
export AMS_S3_BUCKET=my-agent-traces
export AMS_S3_PREFIX=ams                 # optional, default "ams"
export AMS_S3_ENDPOINT_URL=https://<account>.r2.cloudflarestorage.com   # omit for AWS S3
export AMS_S3_REGION=auto
# credentials via the standard AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
```

Or write to local disk for development:

```bash
export AMS_STORAGE=local
export AMS_LOCAL_DIR=./ams-data          # optional
```

### Layout in the bucket

```
{prefix}/sessions/{YYYY}/{MM}/{DD}/{session_id}.json   full session
{prefix}/index/{session_id}.json                        compact summary (for listing/filtering)
```

The small `index/` objects let a frontend build a searchable session list without opening every full session.

## Usage

### One-call (drop-in for `query`)

```python
from ams import Agent
from ams.claude import traced_query

async for message in traced_query(
    prompt="...",
    options=options,                       # your ClaudeAgentOptions
    agent=Agent(name="support-bot", version="2026.06"),
    environment="prod",
    tags=["voice", "cancellation"],
    metadata={"team_id": "t_42"},
):
    print(message)
```

### With `ClaudeSDKClient`

Merge AMS hooks into your options, feed messages to the tracer, and `finish()` when done:

```python
from ams import Tracer
from ams.claude import instrument_options

tracer = Tracer(environment="prod", tags=["chat"])
options = instrument_options(my_options, tracer)

async with ClaudeSDKClient(options=options) as client:
    await client.query("...")
    async for message in client.receive_response():
        tracer.record_message(message)

session = tracer.finish()
```

### Custom storage

Pass any object with `put_session(session) -> str`:

```python
tracer = Tracer(storage=MyStorage())
```

## Options

| Tracer arg / env | Default | Notes |
|---|---|---|
| `storage` / `AMS_STORAGE` | S3 | `local` to write to disk |
| `agent` | — | `Agent(name=..., version=...)` |
| `environment` | — | e.g. `prod`, `staging` |
| `tags`, `metadata` | — | free-form, promoted into the index for filtering |
| `capture_thinking` | `True` | record the model's reasoning blocks |
| `redact` / `AMS_REDACT` | `False` | opt-in PII redaction (email / phone / card / SSN) |

AMS never throws into your agent: hook and storage failures are logged, not raised.

## How it works

See [`docs/architecture.md`](docs/architecture.md) for the module map and the two-channel design (hooks + message stream) that AMS fuses into one session.

## Schema

See [`docs/schema.md`](docs/schema.md) for the full session JSON schema with an example. The contract lives in one file: [`ams/schema.py`](ams/schema.py).

## Frontend

A simple frontend to browse and filter sessions is planned (not built yet). See [`docs/frontend-notes.md`](docs/frontend-notes.md) for the intended design — it reads the `index/` summaries to list sessions and fetches a full session JSON on click.

## Development

```bash
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
pytest
```

## License

MIT
