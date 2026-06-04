"""Demo 2 — a multi-agent system (modeled on the SDK 'research-agent' demo).

A lead agent delegates to specialized subagents via the Task tool. This is the
case the research-agent demo hand-rolls ~389 lines of tracking code for
(subagent_tracker.py + message_handler.py + transcript.py) and still captures
no timing, tokens, cost, or reasoning.

With AMS that becomes the four `# AMS` lines below, and you get the whole
session — every subagent, why it was spawned, its nested tool calls, timing,
tokens and cost — as one JSON object.

Run (one-shot):
    export AMS_STORAGE=local AMS_LOCAL_DIR=./ams-data
    python examples/demos/research_agent.py "Find one notable fact about the James Webb telescope and write it to a file."
"""

import sys
import anyio
from claude_agent_sdk import AgentDefinition, ClaudeAgentOptions, ClaudeSDKClient

from ams import Agent, Tracer            # AMS
from ams.claude import instrument_options  # AMS

LEAD_PROMPT = (
    "You are a lead research coordinator. For the user's request, delegate to "
    "the 'researcher' subagent via the Task tool to gather the information and "
    "save it. Keep it to a single researcher. When the researcher is done, give "
    "a one-sentence summary. Do not do the research yourself."
)
RESEARCHER_PROMPT = (
    "You are a researcher. Use WebSearch to find the requested information, then "
    "use Write to save a short note to research_notes.md. Be concise."
)


async def main(user_request: str):
    agents = {
        "researcher": AgentDefinition(
            description="Gathers information from the web and writes notes.",
            tools=["WebSearch", "Write"],
            prompt=RESEARCHER_PROMPT,
            model="haiku",
        ),
    }
    options = ClaudeAgentOptions(
        model="haiku",
        permission_mode="bypassPermissions",
        system_prompt=LEAD_PROMPT,
        allowed_tools=["Task"],
        agents=agents,
    )

    tracer = Tracer(agent=Agent(name="research-lead", version="0.1"), environment="dev", tags=["demo", "research"])  # AMS
    options = instrument_options(options, tracer)  # AMS

    async with ClaudeSDKClient(options=options) as client:
        await client.query(prompt=user_request)
        async for message in client.receive_response():
            tracer.record_message(message)  # AMS
            if type(message).__name__ == "AssistantMessage":
                for block in message.content:
                    if type(block).__name__ == "TextBlock":
                        print(block.text)

    session = tracer.finish()  # AMS
    print(f"\n[AMS] {len(session.events)} events, {session.totals.subagents} subagent(s), "
          f"{session.totals.tool_calls} tool call(s), cost=${session.totals.cost_usd}")


if __name__ == "__main__":
    request = sys.argv[1] if len(sys.argv) > 1 else "Find one notable fact about the James Webb telescope and write it to a file."
    anyio.run(main, request)
