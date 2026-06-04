"""Demo 1 — a single agent with tools (modeled on the SDK 'hello-world' demo).

Shows the minimal AMS footprint: import traced_query and use it instead of
query. Everything else is a normal Claude Agent SDK program. The full session
(prompt, reasoning, every tool call with timing, tokens, cost) is written to
storage when the stream ends.

Run:
    export AMS_STORAGE=local AMS_LOCAL_DIR=./ams-data
    python examples/demos/simple_agent.py
"""

import anyio
from claude_agent_sdk import ClaudeAgentOptions

from ams import Agent
from ams.claude import traced_query  # AMS


async def main():
    options = ClaudeAgentOptions(
        model="haiku",
        permission_mode="bypassPermissions",
        allowed_tools=["Glob", "Read"],
    )
    async for message in traced_query(  # AMS  (was: query)
        prompt="Use Glob to list the Python files under the ams/ package, then tell me how many there are.",
        options=options,
        agent=Agent(name="file-explorer", version="0.1"),  # AMS
        environment="dev",                                  # AMS
        tags=["demo", "simple"],                            # AMS
    ):
        if type(message).__name__ == "AssistantMessage":
            for block in message.content:
                if type(block).__name__ == "TextBlock":
                    print(block.text)


if __name__ == "__main__":
    anyio.run(main)
