"""Using AMS with ClaudeSDKClient (when you drive the conversation yourself).

Merge `tracer.hooks()` into your options, feed streamed messages to the tracer,
and call `finish()` when the turn is done.
"""

import anyio

from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

from ams import Agent, Tracer
from ams.claude import instrument_options


async def main():
    tracer = Tracer(agent=Agent(name="support-bot", version="2026.06"), environment="prod")
    options = instrument_options(ClaudeAgentOptions(), tracer)

    async with ClaudeSDKClient(options=options) as client:
        await client.query("Help me cancel my membership.")
        async for message in client.receive_response():
            tracer.record_message(message)
            print(type(message).__name__)

    session = tracer.finish()
    print(f"recorded {len(session.events)} events, cost=${session.totals.cost_usd}")


if __name__ == "__main__":
    anyio.run(main)
