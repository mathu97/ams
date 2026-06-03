"""Optional PII redaction. Off by default — AMS captures full detail unless you
opt in. Turn it on with `Tracer(redact=True)` or `AMS_REDACT=1` when sessions
may contain sensitive caller data (phone numbers, emails, cards)."""

from __future__ import annotations

import re
from typing import Any

_PATTERNS = [
    (re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"), "[email]"),
    (re.compile(r"\+?\d[\d\s().-]{7,}\d"), "[phone]"),
    (re.compile(r"\b(?:\d[ -]*?){13,16}\b"), "[card]"),
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[ssn]"),
]


def redact_text(text: str) -> str:
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def redact(value: Any) -> Any:
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, dict):
        return {k: redact(v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    return value
