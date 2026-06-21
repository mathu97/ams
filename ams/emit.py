"""Emit standalone activities — the session-less write path.

A Tracer accumulates a whole agent run and writes it once. But plenty of the
work worth observing happens outside an agent session: a backend job, a cron
reconciler, a webhook, a human action. `emit_activity` records one such event
as a single object and fans it out to the same facet entities the agent's
sessions land under, so a thread (or tenant, or customer) view shows agent
runs and backend events on one timeline.

Like the rest of AMS, it never raises into the caller — a monitoring failure
must never break the thing being monitored.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from .facets import facet_pairs
from .schema import Activity, FacetMember, Status

logger = logging.getLogger("ams")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def emit_activity(
    *,
    source: str,
    type: str,
    name: str,
    metadata: Optional[dict[str, Any]] = None,
    attributes: Optional[dict[str, Any]] = None,
    status: Status = Status.OK,
    environment: Optional[str] = None,
    tags: Optional[list[str]] = None,
    index_facets: Optional[list[str]] = None,
    note: Optional[str] = None,
    activity_id: Optional[str] = None,
    timestamp: Optional[str] = None,
    storage=None,
) -> Optional[Activity]:
    """Record one standalone event and index it under each configured facet.

    `metadata` carries the facet values (e.g. {"thread_id": ...}); `index_facets`
    names which of those keys become browsable entities. Returns the Activity,
    or None if it could not be built or persisted.
    """
    try:
        activity = Activity(
            id=activity_id or uuid.uuid4().hex,
            source=source,
            type=type,
            name=name,
            timestamp=timestamp or _now_iso(),
            status=status,
            environment=environment,
            tags=tags or [],
            metadata=metadata or {},
            attributes=attributes or {},
            note=note,
        )
    except Exception:
        logger.exception("ams: failed to build activity")
        return None

    if storage is None:
        from .storage import from_env

        try:
            storage = from_env()
        except Exception:
            logger.exception("ams: failed to resolve storage for activity")
            return None

    try:
        location = storage.put_activity(activity)
        logger.info("ams: wrote activity %s -> %s", activity.id, location)
    except Exception:
        logger.exception("ams: failed to persist activity %s", activity.id)
        return activity

    for key, value in facet_pairs(activity.metadata, index_facets):
        try:
            member = FacetMember(
                kind="activity",
                ref=activity.id,
                ref_key=storage.activity_key(activity),
                timestamp=activity.timestamp,
                status=activity.status,
                summary=activity.summary(),
            )
            storage.put_facet_member(key, value, member)
        except Exception:
            logger.exception(
                "ams: failed to index activity %s facet %s", activity.id, key
            )
    return activity
