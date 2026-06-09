# Schema 1.1 — Agent topology & manifest

**Status:** proposed  
**Supersedes:** [schema.md](schema.md) §1.0 for topology-related fields only  
**Motivates:** agent-page architecture diagram (orchestrator → subagents → tools → MCP)

## Problem

Schema 1.0 records **what happened** (events) but not **how the agent was configured**. A dashboard can infer runtime structure from full session JSON, but:

- Index summaries have no events → agent page can't draw topology without N full-session fetches.
- MCP servers aren't first-class; tools are flat name strings.
- `llm_message` events aren't scoped to orchestrator vs subagent.
- Subagent ↔ `Task`/`Agent` links are best-effort (see [architecture.md](architecture.md)).

Schema 1.1 adds two explicit layers plus a **SDK-neutral graph IR** so the same dashboard works for Claude Agent SDK, OpenAI Agents SDK, and manual configs:

| Layer | Field | Meaning |
|---|---|---|
| **Declared** | `manifest.graph` | Designed topology — nodes (agents, MCP servers) and edges (delegation, tools) |
| **Observed** | `topology` | Rollup computed at `finish()` — what actually ran |
| **Provenance** | `manifest.source` | Which SDK produced the snapshot (`claude_agent_sdk`, `openai_agents`, `manual`) |

The Claude-specific `orchestrator` / `subagents` layout is a **view** derived from the graph, not the canonical storage shape.

See [Cross-SDK comparison](#cross-sdk-comparison) below.

---

## Cross-SDK comparison

### Primitives side-by-side

| Concept | Claude Agent SDK | OpenAI Agents SDK | AMS 1.0 today | AMS 1.1 target |
|---|---|---|---|---|
| Root agent | `ClaudeAgentOptions` + `Agent(name=…)` on Tracer | `Agent(name, instructions, tools, handoffs)` | `session.agent` | Graph node `role: root` |
| Child agent | `agents` dict → `AgentDefinition` | `handoffs: [Agent \| Handoff(…)]` | `subagent` events | Graph node `role: child` |
| Delegate w/ control transfer | *(no first-class equivalent)* | **Handoff** — specialist owns the conversation | — | Edge `kind: handoff` |
| Delegate w/ return to caller | **Task / Agent** tool — lead keeps control | **Agent as tool** — manager synthesizes final answer | `subagent` + Task tool | Edge `kind: invoke` |
| Function tools | SDK builtins + MCP | `@function_tool` | `tool_call` | `tool.kind: function` |
| MCP | `mcp_servers` on options | `mcp_servers` on Agent + `HostedMCPTool` | flat tool name | `tool.kind: mcp` + server |
| Hosted platform tools | *(via MCP or builtins)* | WebSearch, FileSearch, CodeInterpreter, … | flat tool name | `tool.kind: hosted` |
| Guardrails | notifications hook | `guardrails` + `guardrail_span` | `notification` | `guardrail` event (new) |
| Tracing unit | hooks + message stream → events | trace → spans (`parent_id`) | flat `events[]` + `parent_id` | same + optional span map |
| Active agent at runtime | `agent_id` on hooks | `agent_span` / `TurnSpanData.agent_name` | partial (`parent_id` on tools) | `Event.scope` + `agent_id` |

Sources: [Claude Agent SDK hooks](https://github.com/anthropics/claude-agent-sdk) (via AMS tracer), [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/), [Orchestration guide](https://developers.openai.com/api/docs/guides/agents/orchestration), [MCP integration](https://openai.github.io/openai-agents-python/mcp/), [Tracing spans](https://openai.github.io/openai-agents-python/ref/tracing/span_data/).

### The delegation distinction (important)

OpenAI explicitly splits two patterns that Claude collapses into “subagent”:

| Pattern | OpenAI | Claude | Diagram edge |
|---|---|---|---|
| **Handoff** | Specialist takes over; sees full history | — | solid arrow, “owns conversation” |
| **Invoke / spawn** | Agent-as-tool; manager keeps reply | Task/Agent tool; subagent nested under parent | dashed arrow, “returns result” |

AMS 1.1 must store **`delegation_kind`** on child-agent edges/events so the dashboard renders the right connector style. Do not overload everything as “subagent”.

### OpenAI tracing → AMS events (future adapter)

OpenAI exports spans with `parent_id` and typed `span_data`:

| OpenAI span | AMS event | Notes |
|---|---|---|
| `agent` (`AgentSpanData`) | scope boundary | `name`, declared `tools[]`, `handoffs[]` → feeds manifest |
| `generation` | `llm_message` | model, usage |
| `function` | `tool_call` | `mcp_data` on span → `ToolDetail.mcp_*` |
| `handoff` | `delegation` (new) or `subagent` + `delegation_kind: handoff` | `from_agent`, `to_agent` |
| `guardrail` | `guardrail` (new) | `name`, `triggered` |
| `mcp_tools` | *(manifest only)* | `list_tools` result → `mcp_servers[].tools` |

An OpenAI adapter would either:
1. **Subscribe** via `add_trace_processor()` and build an AMS `Session` from exported spans, or
2. **Wrap** `Runner.run` and snapshot `Agent` config at start (mirroring `extract_manifest`).

### Claude tracing → AMS (today + 1.1)

| Claude hook / stream | AMS event | 1.1 addition |
|---|---|---|
| `UserPromptSubmit` | `user_prompt` | `scope: orchestrator` |
| `PreToolUse` / `PostToolUse` | `tool_call` | `ToolDetail.kind`, `scope` |
| `SubagentStart` / `SubagentStop` | `subagent` | `delegation_kind: invoke`, `spawn_tool_use_id` |
| `AssistantMessage` | `llm_message` | `scope` when `agent_id` available |
| `ResultMessage` | totals | — |

### What both SDKs expose at config time (manifest sources)

| Field | Claude (`ClaudeAgentOptions`) | OpenAI (`Agent`) |
|---|---|---|
| Model | `model` | `model` |
| Instructions | `system_prompt` | `instructions` |
| Tools | `allowed_tools` | `tools[]` (functions, hosted, agent-tools) |
| Child agents | `agents: {type: AgentDefinition}` | `handoffs[]` |
| MCP | `mcp_servers` | `mcp_servers` + `HostedMCPTool` in `tools` |
| MCP config | — | `mcp_config` (prefix names, schema strictness) |
| Guardrails | — | `input_guardrails`, `output_guardrails` |

**Recommendation:** manifest capture is implemented as **one graph builder per SDK** + a shared normalizer to `AgentGraph`. Callers on exotic stacks pass `tracer.set_manifest(manual_graph)`.

---

## Versioning

- Bump `schema_version` to `"1.1"` when any 1.1 field is present.
- 1.0 sessions remain valid; readers treat missing `manifest` / `topology` as absent.
- Dashboard: if `manifest` exists, render declared graph; overlay `topology` for usage/errors. Else fall back to event inference (1.0 behavior).

---

## New top-level session fields

```json
{
  "schema_version": "1.1",
  "session_id": "…",
  "manifest": { … },
  "topology": { … },
  "events": [ … ]
}
```

Both are optional on the Pydantic model (default `None`) so 1.0 writers keep working until upgraded.

---

## `manifest` — declared topology (SDK-neutral graph)

Captured once at session start. Read-only snapshot; never mutated during the session.

### Top-level shape

```typescript
type Manifest = {
  source: "claude_agent_sdk" | "openai_agents" | "manual"
  source_version?: string                      // SDK package version if known
  captured_at: string                          // ISO 8601
  graph: AgentGraph
  // SDK-specific extras (optional, for debugging — not required for dashboard)
  raw?: Record<string, unknown>
}

type AgentGraph = {
  root_id: string                              // node id of entry-point agent
  nodes: GraphNode[]
  edges: GraphEdge[]
}

type GraphNode = {
  id: string                                   // stable within session, e.g. "root", "researcher"
  kind: "agent" | "mcp_server" | "tool_group"
  name: string                                 // display name
  role?: "root" | "child"                       // agents only
  model?: string
  description?: string
  tools?: string[]                             // declared tool names for this node
  instructions_preview?: string
  instructions_hash?: string
  // MCP servers only:
  transport?: "stdio" | "sse" | "streamable_http" | "hosted"
  url?: string
  command?: string
  args?: string[]
}

type GraphEdge = {
  from: string                                 // node id
  to: string                                   // node id
  kind: "tool" | "handoff" | "invoke" | "mcp"
  label?: string                               // tool name or handoff name
}
```

### Edge kinds (cross-SDK)

| `kind` | Meaning | Claude | OpenAI |
|---|---|---|---|
| `tool` | Agent has direct access to tool/MCP | `allowed_tools`, subagent `tools` | `Agent.tools`, `@function_tool` |
| `invoke` | Call child agent, return to caller | Task/Agent → subagent | Agent-as-tool |
| `handoff` | Transfer conversation ownership | — | `handoffs[]` |
| `mcp` | Agent connected to MCP server node | `mcp_servers` | `mcp_servers`, `HostedMCPTool` |

### Example — Claude research-lead

```json
{
  "source": "claude_agent_sdk",
  "captured_at": "2026-06-08T17:00:00.000+00:00",
  "graph": {
    "root_id": "root",
    "nodes": [
      { "id": "root", "kind": "agent", "role": "root", "name": "research-lead", "model": "haiku", "tools": ["Task"] },
      { "id": "researcher", "kind": "agent", "role": "child", "name": "researcher", "model": "haiku", "tools": ["WebSearch", "Write"] }
    ],
    "edges": [
      { "from": "root", "to": "researcher", "kind": "invoke", "label": "Task" },
      { "from": "root", "to": "Task", "kind": "tool", "label": "Task" },
      { "from": "researcher", "to": "WebSearch", "kind": "tool", "label": "WebSearch" },
      { "from": "researcher", "to": "Write", "kind": "tool", "label": "Write" }
    ]
  }
}
```

Tool names can be separate `kind: tool_group` nodes or implicit labels on edges — dashboard picks one convention; graph supports both.

### Example — OpenAI triage + billing handoff

```json
{
  "source": "openai_agents",
  "graph": {
    "root_id": "triage",
    "nodes": [
      { "id": "triage", "kind": "agent", "role": "root", "name": "Triage", "tools": ["lookup_member"] },
      { "id": "billing", "kind": "agent", "role": "child", "name": "Billing", "tools": ["cancel_membership"] },
      { "id": "mcp_fs", "kind": "mcp_server", "name": "filesystem", "transport": "stdio", "tools": ["read_file", "write_file"] }
    ],
    "edges": [
      { "from": "triage", "to": "billing", "kind": "handoff", "label": "transfer_to_billing" },
      { "from": "billing", "to": "mcp_fs", "kind": "mcp" }
    ]
  }
}
```

### Extraction adapters

```python
# ams/manifest/claude.py
def extract_manifest_from_claude(options: Any, *, redact: bool) -> Manifest: ...

# ams/manifest/openai.py  (future)
def extract_manifest_from_openai(agent: Any, *, redact: bool) -> Manifest: ...

# ams/manifest/normalize.py
def graph_to_topology_summary(graph: AgentGraph) -> dict: ...  # for index
```

Claude hook point (unchanged):

```python
def instrument_options(options, tracer):
    tracer.set_manifest(extract_manifest_from_claude(options, redact=tracer.redact))
```

OpenAI hook point (future):

```python
def instrument_openai_agent(agent, tracer):
    tracer.set_manifest(extract_manifest_from_openai(agent, redact=tracer.redact))
```

Manual:

```python
tracer.set_manifest(Manifest(source="manual", graph=..., captured_at=...))
```

Rules (all adapters):

- Prompts: `instructions_preview` (truncated) + `instructions_hash`; omit preview when `redact=True`.
- MCP secrets: redact args/env (reuse `ams.redact`).
- Partial graph is valid — omit unknown fields.
- `HostedMCPTool` → `mcp_server` node with `transport: hosted` + `url`/`server_label`.

---

## Legacy convenience view (derived, not stored)

Dashboards may derive Claude-shaped views from the graph for simpler rendering:

```typescript
type OrchestratorView = { model?, tools[], subagents: Record<string, SubagentView> }
```

Do **not** persist this separately; compute from `manifest.graph` client-side.

---

## `topology` — observed rollup

Computed in `Tracer.finish()` from events + manifest. Idempotent; derived data only.

### Shape

```typescript
type Topology = {
  agents_used: string[]                        // node ids or agent names that ran
  tools_by_agent: Record<string, string[]>     // agent scope → unique tool names
  mcp_tools_used: McpToolUsage[]
  models_by_agent: Record<string, string>
  delegation_edges: DelegationEdge[]           // observed handoff/invoke links
  errors_by_agent: Record<string, number>
}

type DelegationEdge = {
  from_agent: string
  to_agent: string
  kind: "handoff" | "invoke"
  trigger_tool_use_id?: string
  subagent_event_id?: string
  status: "ok" | "error"
}
```

`SpawnEdge` renamed to `DelegationEdge` with explicit `kind` for cross-SDK parity.

### Agent scope keys

| Scope | Meaning |
|---|---|
| `"agent:{node_id}"` or `"agent:{name}"` | Preferred — matches graph node |
| `"orchestrator"` | Legacy alias for root agent (1.0 compat) |
| `"subagent:{agent_type}"` | Legacy alias for child agents |

### Computation rules

Run after events are sorted, before persist:

1. **`agents_used`** — unique agent names from `Event.scope` / subagent events / active agent spans.
2. **`tools_by_agent`** — bucket `tool_call` by scope; skip spawn tools (`Task`, `Agent`, handoff tools) from leaf lists.
3. **`mcp_tools_used`** — aggregate `tool.kind == mcp` by `(server, tool)`.
4. **`models_by_agent`** — from scoped `llm_message` events.
5. **`delegation_edges`** — one per subagent/delegation event; set `kind` from `SubagentDetail.delegation_kind`.
6. **`errors_by_agent`** — count errors grouped by scope.

---

## Event changes

### `Event.scope` and `Event.agent_id`

```python
class Event(BaseModel):
    …
    scope: Optional[str] = None       # "agent:{name}" preferred; legacy scopes supported
    agent_id: Optional[str] = None    # SDK runtime id when known
```

Population:

| Event type | When set |
|---|---|
| `tool_call` | Hook/runtime `agent_id` → resolve to graph node name |
| `llm_message` | When SDK provides active agent |
| `subagent` / `delegation` | Child agent name + `agent_id` |
| `user_prompt` | Root agent scope |
| `guardrail` | Root agent scope (or target agent if SDK specifies) |

### `SubagentDetail` extensions

```python
class DelegationKind(str, Enum):
    INVOKE = "invoke"      # Task/Agent, agent-as-tool — caller resumes
    HANDOFF = "handoff"    # OpenAI handoff — callee owns conversation

class SubagentDetail(BaseModel):
    …
    delegation_kind: DelegationKind = DelegationKind.INVOKE
    spawn_tool_use_id: Optional[str] = None   # Task/Agent/handoff tool call id
    target_agent: Optional[str] = None        # graph node name / handoff destination
```

Claude sets `delegation_kind=invoke`. OpenAI handoff adapter sets `handoff`. Enables correct diagram edge styling.

Optional new event type for OpenAI-only handoffs without subagent nesting:

```python
class EventType(str, Enum):
    …
    DELEGATION = "delegation"   # handoff control transfer
    GUARDRAIL = "guardrail"     # input/output guardrail check
```

---

## `ToolDetail` classification

```python
class ToolKind(str, Enum):
    BUILTIN = "builtin"        # SDK-provided (WebSearch, Glob, …)
    FUNCTION = "function"      # user @function_tool / Python function
    MCP = "mcp"                # MCP server tool (local or hosted)
    HOSTED = "hosted"          # platform-managed (OpenAI WebSearch, CodeInterpreter, …)
    AGENT = "agent"            # spawn/invoke another agent (Task, Agent, agent-as-tool)
    CUSTOM = "custom"

class McpProvider(str, Enum):
    LOCAL = "local"            # stdio / SSE / streamable HTTP
    HOSTED = "hosted"          # OpenAI HostedMCPTool / Responses-hosted MCP

class ToolDetail(BaseModel):
    name: str
    kind: ToolKind = ToolKind.BUILTIN
    mcp_server: Optional[str] = None
    mcp_tool: Optional[str] = None
    mcp_provider: Optional[McpProvider] = None
    …
```

### Classification (SDK-specific classifiers → shared enum)

| Tool | Claude | OpenAI |
|---|---|---|
| Task, Agent | `AGENT` | — |
| Agent-as-tool wrapper | — | `AGENT` |
| `mcp__server__tool` / prefixed MCP | `MCP` + parse | `MCP` + `mcp_data` on span |
| HostedMCPTool | — | `MCP`, `provider=hosted` |
| WebSearchTool, etc. | — | `HOSTED` |
| @function_tool | — | `FUNCTION` |
| WebSearch, Write, Glob | `BUILTIN` | — |

OpenAI `include_server_in_tool_names` → already encodes server in exposed name; parser should handle `server__tool` patterns from both SDKs.

---

## Index summary changes

Extend `Session.summary()` for list/agent views without loading full sessions.

### New index fields

```json
{
  "schema_version": "1.1",
  "session_id": "…",
  "agent": { "name": "research-lead", "version": "0.1" },
  "…existing index fields…",

  "topology_summary": {
    "graph_source": "claude_agent_sdk",
    "agents_declared": ["research-lead", "researcher"],
    "agents_used": ["research-lead", "researcher"],
    "tools_by_agent": {
      "research-lead": ["Task"],
      "researcher": ["WebSearch", "Write"]
    },
    "mcp_servers": [],
    "delegations": [{ "from": "research-lead", "to": "researcher", "kind": "invoke" }]
  }
}
```

Rules:

- `agents_declared` — agent nodes from `manifest.graph`.
- `agents_used`, tools, delegations — from `topology`.
- No prompts, payloads, or hashes in index.

Dashboard agent page: aggregate `topology_summary` across sessions for one agent name, or read agent registry (below).

---

## Agent registry (optional storage object)

For O(1) agent-page loads at scale.

### Path

```
{prefix}/agents/{agent_name}.json
```

Use URL-safe encoding for agent names with special chars (`urllib.parse.quote(agent_name, safe="")`).

### Shape

```json
{
  "schema_version": "1.1",
  "agent": { "name": "research-lead", "version": "0.1" },
  "manifest": { "graph": { … } },
  "observed": {
    "agents": ["research-lead", "researcher"],
    "tools": ["Task", "WebSearch", "Write"],
    "mcp_servers": ["filesystem"],
    "delegations": [{ "from": "research-lead", "to": "researcher", "kind": "invoke" }]
  },
  "session_count": 42,
  "error_count": 1,
  "last_seen": "2026-06-08T17:00:00.000+00:00",
  "last_session_id": "sess_…"
}
```

### Update policy (`put_session`)

On each write:

1. Read existing registry object (if any).
2. Replace `manifest` if incoming session has a newer `manifest.captured_at`.
3. Union `observed.*` sets with incoming `topology_summary`.
4. Increment `session_count`; update `last_seen`, `error_count`, `last_session_id`.

Implementation: best-effort read-modify-write in `S3Storage.put_session` / `LocalStorage.put_session`. Conflicts from concurrent writes are acceptable (eventual consistency); last writer wins on counters is fine for v1.

Registry is optional — dashboard can aggregate index objects instead.

---

## Storage layout (updated)

```
{prefix}/
  sessions/{YYYY}/{MM}/{DD}/{session_id}.json    # full session (manifest + topology + events)
  index/{session_id}.json                         # summary (+ topology_summary)
  agents/{agent_name}.json                        # optional registry
```

No migration of existing objects required.

---

## Dashboard rendering

### Declared diagram (from `manifest.graph`)

```
┌─ research-lead ─────────────────────────────────────────┐
│  model: haiku    tools: Task                            │
│         ╎ invoke (Task)                                 │
│         ▼                                               │
│  ┌─ researcher ─────────────────────────────────────┐  │
│  │  model: haiku    tools: WebSearch, Write         │  │
│  └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

OpenAI handoff variant: solid arrow root → child, label "handoff"
OpenAI invoke variant: dashed arrow, label "agent_tool"
MCP server: separate box below agent, dotted connector
```

### Observed overlay (from `topology`)

- Bold tools in `tools_by_agent` that were called.
- Gray out declared-but-unused graph nodes.
- Error badge per agent from `errors_by_agent`.
- Delegation edges colored by `kind` (handoff vs invoke).

Data source priority on agent page:

1. `{prefix}/agents/{name}.json` if exists
2. Else aggregate `topology_summary` from index objects for that agent
3. Else fetch last N full sessions and infer from events (1.0 fallback)

---

## Pydantic models (summary)

Add to `ams/schema.py`:

```python
class GraphNode(BaseModel): …
class GraphEdge(BaseModel): …
class AgentGraph(BaseModel): …
class Manifest(BaseModel): …

class DelegationKind(str, Enum): …
class DelegationEdge(BaseModel): …
class Topology(BaseModel): …
class TopologySummary(BaseModel): …
```

---

## Implementation phases

### Phase 1 — Graph manifest + topology (Claude)

- [ ] `ams/manifest/claude.py` → `AgentGraph`
- [ ] `Tracer.set_manifest()` + `instrument_options`
- [ ] `_compute_topology()` with `tools_by_agent`, `delegation_edges`
- [ ] Index `topology_summary`
- [ ] Tests: research_agent demo, 1.0 backward compat

### Phase 2 — Tool classification + delegation links

- [ ] `ToolKind` / `McpProvider` + classifiers per SDK
- [ ] `SubagentDetail.delegation_kind`, `spawn_tool_use_id`
- [ ] Tests: MCP naming (both SDKs), Task → invoke edge

### Phase 3 — Event scope + guardrails

- [ ] `Event.scope`, `agent_id`
- [ ] Optional `guardrail` event type
- [ ] `topology.models_by_agent`

### Phase 4 — OpenAI adapter (new package surface)

- [ ] `ams/manifest/openai.py` — snapshot `Agent` + handoffs + MCP
- [ ] `ams/openai.py` — `instrument_agent(agent, tracer)` or trace processor
- [ ] Map `handoff_span` → `delegation` events with `kind: handoff`
- [ ] Map `FunctionSpanData.mcp_data` → `ToolDetail`

### Phase 5 — Agent registry + dashboard

- [ ] Registry upsert in storage
- [ ] Dashboard `AgentDiagram` — render from `graph`, overlay `topology`
- [ ] Edge styles: solid=handoff, dashed=invoke, dotted=mcp

---

## Non-goals (v1.1)

- Storing full system/subagent prompts in S3 (preview + hash only).
- Real-time streaming topology updates mid-session.
- Version diffing between manifest changes across deploys (future: `agents/{name}/versions/`).
- OTLP re-emission of manifest/topology (can add later; fields are JSON-friendly).

---

## Open questions

1. **MCP tool naming** — validate patterns for both SDKs (`mcp__`, server-prefixed names, OpenAI `mcp_data`).
2. **Parallel same-type agents** — use `agent_id` in scope keys when needed.
3. **OpenAI trace processor vs wrap** — processor gets accurate runtime; config snapshot gets accurate manifest. Likely need both.
4. **OTel alignment** — graph nodes map cleanly to `gen_ai.agent.name`; consider exporting manifest as resource attributes later.

---

## References

- Current contract: [schema.md](schema.md)
- Capture flow: [architecture.md](architecture.md)
- Dashboard: [frontend-notes.md](frontend-notes.md), `dashboard/`
- OpenAI Agents SDK: https://openai.github.io/openai-agents-python/
- OpenAI orchestration (handoffs vs agents-as-tools): https://developers.openai.com/api/docs/guides/agents/orchestration
- OpenAI MCP: https://openai.github.io/openai-agents-python/mcp/
- OpenAI span types: https://openai.github.io/openai-agents-python/ref/tracing/span_data/
