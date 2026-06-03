# AMS session schema

One session is one JSON object. The contract lives in [`ams/schema.py`](../ams/schema.py); this doc explains it and gives a worked example.

## Design goals

- **Flat and typed** — a session reads top-to-bottom; no nested attribute key/value bags to decode.
- **Filterable** — session id, agent, environment, tags, status, tokens, and cost are promoted to the top level and mirrored into a compact `index/` summary, so you can list and filter sessions without opening every full object.
- **OTel-aligned names** — fields map to the [GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) (`gen_ai.*`) where a natural equivalent exists, so the data can be re-emitted as OTLP later.

## Top level

| Field | Type | Notes |
|---|---|---|
| `schema_version` | string | currently `"1.0"` |
| `session_id` | string | the SDK session id (== `gen_ai.conversation.id`); the unit you filter a whole session by |
| `trace_id` | string | AMS-generated id for this recording |
| `agent` | object | `{ name, version }` |
| `environment` | string | e.g. `prod`, `staging` |
| `tags` | string[] | free-form labels for filtering |
| `metadata` | object | free-form (e.g. `team_id`, `channel`) |
| `start_time` / `end_time` | ISO 8601 | |
| `duration_ms` | int | total wall-clock |
| `status` | `ok` \| `error` | `error` if any event errored or the result was an error |
| `totals` | object | see below |
| `events` | Event[] | ordered by `seq` |

## Totals

`usage` (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`), `cost_usd`, `llm_calls`, `tool_calls`, `subagents`, `errors`, `num_turns`, `duration_ms`, `duration_api_ms`.

Cost comes from the SDK's `total_cost_usd` when available; otherwise AMS estimates it from token usage and a per-model price table ([`ams/pricing.py`](../ams/pricing.py)).

## Event

Every event shares: `id`, `seq` (monotonic order), `parent_id` (set for tool calls nested under a subagent), `type`, `name`, `start_time`, `end_time`, `duration_ms`, `status`. Then one type-specific block:

- **`user_prompt`** → `prompt`
- **`llm_message`** → `llm` = `{ model, stop_reason, text, thinking, message_id, usage }` — `thinking` is the model's chain-of-thought
- **`tool_call`** → `tool` = `{ name, tool_use_id, input, result, is_error }`
- **`subagent`** → `subagent` = `{ agent_id, agent_type, invocation_prompt, invocation_event_id, transcript_path, usage }` — `invocation_prompt` is *why* it was spawned; its child tool calls reference it via `parent_id`
- **`notification`** → `note`
- any event may carry `error` = `{ type, message }`

## Example

```json
{
  "schema_version": "1.0",
  "session_id": "9f2c1e84-…",
  "trace_id": "3b1a…",
  "agent": { "name": "support-bot", "version": "2026.06" },
  "environment": "prod",
  "tags": ["voice", "cancellation"],
  "metadata": { "team_id": "t_42" },
  "start_time": "2026-06-03T14:22:01.120+00:00",
  "end_time": "2026-06-03T14:22:09.880+00:00",
  "duration_ms": 8760,
  "status": "ok",
  "totals": {
    "usage": { "input_tokens": 4120, "output_tokens": 880,
               "cache_read_input_tokens": 3000, "cache_creation_input_tokens": 1500 },
    "cost_usd": 0.0427, "llm_calls": 3, "tool_calls": 4, "subagents": 1,
    "errors": 0, "num_turns": 3, "duration_ms": 8760, "duration_api_ms": 6200
  },
  "events": [
    { "id": "e1", "seq": 1, "type": "user_prompt", "name": "user_prompt",
      "start_time": "…", "end_time": "…", "prompt": "Cancel my membership" },

    { "id": "e2", "seq": 2, "type": "llm_message", "name": "assistant",
      "start_time": "…", "end_time": "…",
      "llm": { "model": "claude-opus-4-8", "stop_reason": "tool_use",
               "thinking": "I should look up the member before doing anything.",
               "text": "Let me pull up your account.",
               "usage": { "input_tokens": 1200, "output_tokens": 300,
                          "cache_read_input_tokens": 1000 } } },

    { "id": "e3", "seq": 3, "type": "tool_call", "name": "tool:lookup_member",
      "start_time": "…", "end_time": "…", "duration_ms": 480, "status": "ok",
      "tool": { "name": "lookup_member", "tool_use_id": "call_1",
                "input": { "phone": "+1…" },
                "result": { "member_id": "m_88", "status": "active" } } },

    { "id": "e4", "seq": 4, "type": "subagent", "name": "subagent:billing_specialist",
      "start_time": "…", "end_time": "…", "status": "ok",
      "subagent": { "agent_id": "agent-1", "agent_type": "billing_specialist",
                    "invocation_prompt": "Process the membership cancellation for m_88.",
                    "invocation_event_id": "e_task", "transcript_path": "…/agent-1.jsonl" } },

    { "id": "e5", "seq": 5, "parent_id": "e4", "type": "tool_call",
      "name": "tool:cancel_membership",
      "start_time": "…", "end_time": "…", "duration_ms": 900, "status": "ok",
      "tool": { "name": "cancel_membership", "input": { "member_id": "m_88" },
                "result": { "cancelled": true } } }
  ]
}
```

`e5` is a tool call made *inside* the subagent — note `parent_id: "e4"` pointing at the subagent event. That is how subagent activity nests under its parent.
