"""Facet correlation — the generic, domain-agnostic grouping primitive.

A facet is just a metadata key whose value becomes a browsable entity. AMS
treats facet keys as opaque strings: a caller indexing email work might use
`thread_id`, a multi-tenant app might use `tenant`, another might index
nothing. AMS never assigns meaning to a facet key.

On write, sessions and activities fan out one append-only pointer per facet
under `facets/{key}/{value}/members/`, so a reader can list everything for an
entity by listing one prefix instead of scanning every session.
"""

from __future__ import annotations

from typing import Any


def facet_pairs(
    metadata: dict[str, Any] | None,
    index_facets: list[str] | None,
) -> list[tuple[str, str]]:
    """(key, value) for each configured facet present with a non-empty value.

    Values are stringified so any JSON-scalar metadata value can be a facet.
    """
    if not metadata or not index_facets:
        return []
    pairs: list[tuple[str, str]] = []
    for key in index_facets:
        value = metadata.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            pairs.append((key, text))
    return pairs
