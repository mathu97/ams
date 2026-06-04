# AMS demos — putting it to the test

Two runnable agents that exercise AMS end to end, modeled on the official
[claude-agent-sdk-demos](https://github.com/anthropics/claude-agent-sdk-demos).
Both were run live and produced real session traces.

> Of the demos in that repo, only **research-agent** is Python (the rest —
> hello-world, email-agent, excel-demo, simple-chatapp, resume-generator — are
> TypeScript), so it's the natural fit for the Python-first AMS SDK. These two
> examples are clean-room reimplementations of its two shapes: a simple
> single-agent tool user, and a multi-agent lead+subagent system.

## The agents

| Demo | Shape | Integration path | Exercises |
|---|---|---|---|
| [`simple_agent.py`](simple_agent.py) | one agent + tools (`query`) | `traced_query` drop-in | prompt, assistant text, tool calls, timing, tokens, cost |
| [`research_agent.py`](research_agent.py) | lead + subagent (`ClaudeSDKClient`) | `instrument_options` + `record_message` + `finish` | **subagents + why invoked**, nested tool calls, web search, multi-turn |

## How many lines of AMS?

This is the headline. AMS is designed so instrumenting an agent is a few lines.

**`simple_agent.py`** — essential footprint is **2 lines**: import `traced_query` and use it instead of `query`. (The demo adds 3 more optional lines for agent name / environment / tags metadata — 5 `# AMS`-tagged lines total.)

**`research_agent.py`** — **5 lines** for a full multi-agent system:
```python
from ams import Agent, Tracer                       # 1
from ams.claude import instrument_options           # 2
tracer = Tracer(agent=..., environment=..., tags=...)# 3
options = instrument_options(options, tracer)        # 4
...
    tracer.record_message(message)                   # 5 (in the receive loop)
session = tracer.finish()                            # (+ finalize)
```

### Versus hand-rolling it

The upstream `research-agent` demo hand-writes its own observability to do
*less* than this:

| File | Lines |
|---|---|
| `research_agent/utils/subagent_tracker.py` | 276 |
| `research_agent/utils/message_handler.py` | 53 |
| `research_agent/utils/transcript.py` | 60 |
| **Total bespoke tracking** | **389** |

…plus the hook wiring in `agent.py`. And that 389 lines still captures **no
timing, no token usage, no cost, and no model reasoning** — it logs tool names
to a JSONL and a text transcript, with manual `RESEARCHER-1` style subagent IDs.

**AMS replaces ~389 lines of partial tracking with ~5 lines and captures more.**

## Run them

```bash
pip install -e ".[dev]"
export AMS_STORAGE=local AMS_LOCAL_DIR=./ams-data   # or configure S3 (see top-level README)

python examples/demos/simple_agent.py
python examples/demos/research_agent.py "Find one notable fact about the Voyager 1 probe and write it to a file."
```

Each writes `ams-data/sessions/<date>/<session_id>.json` (full trace) and
`ams-data/index/<session_id>.json` (compact summary).

## What a captured multi-agent session looks like

From a real run of `research_agent.py` (totals: 11 events, 1 subagent, 3 tool
calls, 6 LLM messages, 30.5s, $0.075):

```
#1  user_prompt   user_prompt
#2  llm_message   assistant
#3  llm_message   assistant
#4  tool_call     tool:Agent            14166ms   ← lead agent delegates (Task)
#5  subagent      subagent:researcher             ← why: "Find one notable fact about
                                                     the Voyager 1 probe… use web search…"
                                                     (linked to the Task call)
#6      tool_call tool:WebSearch         8232ms   ← nested under the subagent (parent_id)
#7  llm_message   assistant
#8  llm_message   assistant
#9      tool_call tool:Write               11ms   ← nested under the subagent
#10 llm_message   assistant
#11 llm_message   assistant   "Done! Voyager 1 became the first human-made object…"
```

Indented events are nested under the subagent via `parent_id`. The subagent
records *why* it was spawned (`invocation_prompt`) and is linked back to the
lead agent's `Task` call. Every tool call has real timing; the session has
token usage and cost. None of this required touching the agent's logic — just
the 5 `# AMS` lines.
