"""Token -> USD cost. The Claude Agent SDK already reports `total_cost_usd` on
the result message, so AMS uses that for the session total. This table is a
fallback for costing an individual LLM call from its token usage.

Prices are USD per million tokens. Update as needed; matching is by substring so
dated model ids (e.g. `claude-opus-4-8-20260101`) resolve to the right family.
"""

from __future__ import annotations

from typing import Optional

from .schema import Usage

# (input, output, cache_write, cache_read) per million tokens
_PRICES: dict[str, tuple[float, float, float, float]] = {
    "claude-opus-4": (15.0, 75.0, 18.75, 1.5),
    "claude-sonnet-4": (3.0, 15.0, 3.75, 0.3),
    "claude-haiku-4": (1.0, 5.0, 1.25, 0.1),
    "claude-3-5-haiku": (0.8, 4.0, 1.0, 0.08),
}


def _match(model: str) -> Optional[tuple[float, float, float, float]]:
    model = model.lower()
    for key, price in _PRICES.items():
        if key in model:
            return price
    return None


def cost_usd(model: Optional[str], usage: Optional[Usage]) -> Optional[float]:
    if not model or usage is None:
        return None
    price = _match(model)
    if price is None:
        return None
    p_in, p_out, p_cw, p_cr = price
    total = (
        usage.input_tokens * p_in
        + usage.output_tokens * p_out
        + usage.cache_creation_input_tokens * p_cw
        + usage.cache_read_input_tokens * p_cr
    )
    return round(total / 1_000_000, 6)
