"""Read side of the facet index — assemble one entity's timeline.

Given a facet and a value (e.g. "thread_id", "<id>"), list every member —
agent sessions and standalone activities alike — ordered by time. This is
what turns "browse by session" into "browse by thread / tenant / customer":
a single entity view stitched from whatever wrote to it.
"""

from __future__ import annotations

from typing import Any, Optional

from .schema import FacetMember


def load_entity_timeline(
    facet: str,
    value: str,
    *,
    storage=None,
    expand: bool = False,
) -> list[dict[str, Any]]:
    """Return the time-ordered members of one entity.

    Each item is {"member": FacetMember, "record": <full record or None>}.
    With expand=False the full record is left None (cheap — pointers only);
    with expand=True each member's full session/activity JSON is fetched.
    """
    if storage is None:
        from .storage import from_env

        storage = from_env()

    members: list[FacetMember] = storage.list_facet_members(facet, value)
    out: list[dict[str, Any]] = []
    for member in members:
        record: Optional[dict] = None
        if expand and member.ref_key:
            record = storage.read_record(member.ref_key)
        out.append({"member": member, "record": record})
    return out
