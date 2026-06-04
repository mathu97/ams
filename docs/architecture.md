# How AMS works

This doc is the conceptual map: the modules, the vocabulary they speak, and how a session flows through them. For the at-rest data shape see [schema.md](schema.md); for the (not-yet-built) UI see [frontend-notes.md](frontend-notes.md).

## The one idea

A Claude Agent SDK run emits its information in **two separate channels**, and neither alone is enough:

1. **Hooks** — callbacks the SDK invokes around tool calls, subagents, and prompts. These give you *what the agent did*: every tool call with its input/result/timing, every subagent and why it was spawned, and the user's prompts.
2. **The message stream** — the async iterator returned by `query()` (`AssistantMessage`, `ResultMessage`, …). This gives you *what the model thought and what it cost*: the reasoning (thinking) blocks, assistant text, token usage, and the final cost/duration totals.

AMS's whole job is to **fuse these two channels into one ordered Session** and write it as a single JSON object. The Claude Agent SDK has no built-in OpenTelemetry, so hooks + stream are the only places this data exists.

## Glossary

| Term | Meaning |
|---|---|
| **Session** | One recorded run, start to finish — one JSON object in storage. The top-level unit you search and read. |
| **Event** | One ordered thing that happened: `user_prompt`, `llm_message`, `tool_call`, `subagent`, or `notification`. |
| **Tracer** | The recorder. One Tracer instance == one Session. It collects Events from both channels and finalizes them. |
| **Hook** | A Claude Agent SDK callback (`PreToolUse`, `PostToolUse`, `SubagentStart`, …) AMS registers to observe the agent. |
| **Message stream** | The messages yielded by `query()`; the only source of model reasoning and cost. |
| **Totals** | Per-session rollup: tokens (incl. cache), cost USD, turn/tool/subagent/error counts, wall + API duration. |
| **Storage** | A backend with `put_session(session) -> str`. S3-compatible (default) or local disk. |
| **Index summary** | A compact, payload-free view of a Session, written next to it so a list/filter UI need not open every full object. |

## Modules

| Module | Role | Talks to |
|---|---|---|
| `ams/claude.py` | **Integration surface.** `traced_query` (drop-in for `query`) and `instrument_options` (for `ClaudeSDKClient`). The only thing most callers import. | `tracer.py`, `claude_agent_sdk` |
| `ams/tracer.py` | **The hub.** `Tracer` registers hooks, ingests stream messages, builds Events, computes Totals, and persists the Session. The *only* module that imports `claude_agent_sdk` (lazily), so everything else stays SDK-free and unit-testable. | everything below |
| `ams/schema.py` | **The data contract.** `Session`, `Event`, `Totals`, `Usage` and the type-specific detail blocks (`ToolDetail`, `SubagentDetail`, `LLMDetail`). Pydantic; field names align to OTel `gen_ai.*`. | — |
| `ams/pricing.py` | Fallback `cost_usd()` from token usage + a per-model price table. (The SDK's `total_cost_usd` is preferred when present.) | `schema.py` |
| `ams/redact.py` | Opt-in PII scrubbing (`redact()`), off by default. | — |
| `ams/storage/` | `from_env()` picks a backend; `S3Storage` (default, endpoint-agnostic — AWS/R2/MinIO) and `LocalStorage` (dev). Each writes the full Session plus its index summary. | `schema.py` |

## Data flow

```
        YOUR AGENT CODE
              │  query()  ->  traced_query()
              ▼
   ams/claude.py
     traced_query() / instrument_options()
              │ creates + drives
              ▼
   ams/tracer.py  ── Tracer ───────────────────────────────┐
              ▲                                             │
   (1) Hooks ─┘  PreToolUse / PostToolUse(Failure)          │ builds Events,
              SubagentStart / SubagentStop                  │ then finish():
              UserPromptSubmit / Notification               │  - sort by seq
                                                            │  - _compute_totals()
   (2) Stream ─┐  AssistantMessage (thinking, text, usage)  │  - persist once
              └─ ResultMessage (cost, durations, turns)     │
              │                                             │
   schema.py / pricing.py / redact.py  <────────────────────┘
              │ finish() hands the Session to:
              ▼
   ams/storage/  ── put_session() ──>  {prefix}/sessions/{date}/{id}.json
                                       {prefix}/index/{id}.json
```

## Lifecycle of one session

1. **Wire up.** `traced_query` creates a `Tracer` and calls `instrument_options`, which merges `tracer.hooks()` into your `ClaudeAgentOptions.hooks` (keeping any hooks you already had).
2. **Run.** As the SDK runs, hooks fire (`_hook` dispatches by `hook_event_name` to `_on_pre_tool`, `_on_subagent_start`, …) and the stream is consumed by `tracer.watch()`, which passes each message through unchanged while calling `record_message`.
3. **Correlate.** Each Event gets a monotonic `seq`. A `tool_call` whose hook carried an `agent_id` is nested under the matching `subagent` Event via `parent_id`. A `Task` tool call is linked to the subagent it spawned (best-effort, by `agent_type` + order) so the subagent records *why* it was invoked (`invocation_prompt`).
4. **Finalize.** On stream end, `finish()` sorts Events, computes `Totals` (cost/usage from `ResultMessage` when available, else summed + priced from `pricing.py`), sets session `status`, and calls `storage.put_session()` exactly once. `finish()` is idempotent.

## Two ways to integrate

- **`traced_query(...)`** — the drop-in. It owns the Tracer, instruments options, and finalizes automatically when the stream ends.
- **`instrument_options(options, tracer)` + `tracer.record_message(msg)` + `tracer.finish()`** — for when you drive a `ClaudeSDKClient` yourself and need control of the loop.

## Design rules (why it's shaped this way)

- **One Tracer per Session.** State (open tool calls, open subagents) lives on the instance; create a fresh one per run.
- **Only `tracer.py` knows the SDK.** Keeps the data model and storage portable and testable without the SDK installed.
- **Monitoring never breaks the agent.** Hook and storage failures are caught and logged, never raised into your run.
- **The contract is one file.** All shapes live in `schema.py`; storage and the future frontend depend on it, nothing else.

## Known limitation

Hooks don't share a key between a subagent's `agent_id` and the parent `Task` tool's `tool_use_id`, so linking a subagent back to its invoking Task call is best-effort (matched by `agent_type` and arrival order). Sequential or distinct-type subagents link cleanly; parallel same-type subagents may mis-attribute the invocation prompt.

## Where to start reading

- Data → `ams/schema.py` (the whole contract).
- Capture/correlation → `ams/tracer.py` (`_hook` dispatch + `record_message`).
- Integration → `ams/claude.py` (~50 lines).
- Behavior by example → `tests/test_tracer.py`.
