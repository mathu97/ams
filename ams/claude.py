"""Glue between AMS and `claude_agent_sdk`. This is the whole integration
surface: swap `query` for `traced_query`, or merge `tracer.hooks()` into your
options if you drive a ClaudeSDKClient yourself."""

from __future__ import annotations

from typing import Any, AsyncIterator, Optional

from .tracer import Tracer


def instrument_options(options: Any, tracer: Tracer) -> Any:
    """Merge AMS hooks into an existing ClaudeAgentOptions, keeping any of yours."""
    merged = dict(getattr(options, "hooks", None) or {})
    for name, matchers in tracer.hooks().items():
        merged[name] = list(merged.get(name, [])) + list(matchers)
    options.hooks = merged
    return options


async def traced_query(
    *,
    prompt: Any,
    options: Any = None,
    tracer: Optional[Tracer] = None,
    **tracer_kwargs: Any,
) -> AsyncIterator[Any]:
    """Drop-in replacement for `claude_agent_sdk.query` that records the session.

        from ams.claude import traced_query

        async for message in traced_query(prompt="...", options=options):
            print(message)

    Extra keyword args (storage, agent, environment, tags, metadata, redact)
    are forwarded to `Tracer`. On stream completion the session is written to
    storage automatically.
    """
    from claude_agent_sdk import ClaudeAgentOptions, query

    tracer = tracer or Tracer(**tracer_kwargs)
    options = options or ClaudeAgentOptions()
    options = instrument_options(options, tracer)

    async for message in tracer.watch(query(prompt=prompt, options=options)):
        yield message
