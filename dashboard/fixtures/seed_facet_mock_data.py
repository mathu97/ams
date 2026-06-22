#!/usr/bin/env python3
"""Seed mock facet data for the AMS dashboard.

By default writes to dashboard/fixtures/mock-ams-data/.
Use --merge-into to add facets/activities into an existing AMS_LOCAL_DIR
(e.g. ../ams-data) without wiping sessions.

Usage:
    uv run python dashboard/fixtures/seed_facet_mock_data.py
    uv run python dashboard/fixtures/seed_facet_mock_data.py --merge-into ams-data
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from ams.emit import emit_activity
from ams.schema import Agent, Event, EventType, FacetMember, Session, Status, Totals, Usage
from ams.storage.local import LocalStorage

ROOT = Path(__file__).resolve().parent / "mock-ams-data"

THREAD_HEADLINE = "19c2f4a8b1d3e456"
THREAD_SIMPLE = "18a9e7c2f0b8d123"

FACET_KEYS = ["thread_id", "team_id"]
TEAM_ID = "sweat-and-tonic"

COMMON_MD = {
    "thread_id": THREAD_HEADLINE,
    "team_id": TEAM_ID,
    "agent_id": "email-agent",
}


def _index_session(storage: LocalStorage, session: Session, thread_value: str) -> None:
    storage.put_facet_member(
        "thread_id",
        thread_value,
        FacetMember(
            kind="session",
            ref=session.session_id,
            ref_key=storage.session_key(session),
            timestamp=session.start_time,
            status=session.status,
            summary=session.summary(),
        ),
    )
    team = session.metadata.get("team_id")
    if team:
        storage.put_facet_member(
            "team_id",
            team,
            FacetMember(
                kind="session",
                ref=session.session_id,
                ref_key=storage.session_key(session),
                timestamp=session.start_time,
                status=session.status,
                summary=session.summary(),
            ),
        )


def _session_voyager_draft(storage: LocalStorage) -> Session:
    session = Session(
        session_id="sess_thread_voyager_001",
        trace_id="trace-voyager-001",
        agent=Agent(name="email-agent", version="0.2"),
        environment="dev",
        tags=["demo", "email"],
        metadata={**COMMON_MD, "thread_id": THREAD_HEADLINE},
        start_time="2026-06-20T09:00:00+00:00",
        end_time="2026-06-20T09:00:45+00:00",
        duration_ms=45_000,
        status=Status.OK,
        totals=Totals(
            usage=Usage(input_tokens=4200, output_tokens=890),
            cost_usd=0.042,
            llm_calls=2,
            tool_calls=3,
        ),
        events=[
            Event(
                id="ev-1",
                seq=1,
                type=EventType.USER_PROMPT,
                name="user_prompt",
                start_time="2026-06-20T09:00:00+00:00",
                end_time="2026-06-20T09:00:01+00:00",
                duration_ms=1000,
                prompt="Draft a reply about Voyager 1 for this member email thread.",
            ),
            Event(
                id="ev-2",
                seq=2,
                type=EventType.LLM_MESSAGE,
                name="llm_message",
                start_time="2026-06-20T09:00:01+00:00",
                end_time="2026-06-20T09:00:12+00:00",
                duration_ms=11_000,
                llm={"model": "haiku", "text": "I'll draft a concise fact about Voyager 1."},
            ),
            Event(
                id="ev-3",
                seq=3,
                type=EventType.TOOL_CALL,
                name="tool_call",
                start_time="2026-06-20T09:00:12+00:00",
                end_time="2026-06-20T09:00:28+00:00",
                duration_ms=16_000,
                tool={"name": "CreateDraft", "kind": "function", "input": {"thread_id": THREAD_HEADLINE}},
            ),
        ],
    )
    storage.put_session(session)
    _index_session(storage, session, THREAD_HEADLINE)
    return session


def _session_simple_followup(storage: LocalStorage) -> Session:
    session = Session(
        session_id="sess_thread_simple_001",
        trace_id="trace-simple-001",
        agent=Agent(name="email-agent", version="0.2"),
        environment="dev",
        tags=["demo"],
        metadata={"thread_id": THREAD_SIMPLE, "team_id": "sweat-and-tonic"},
        start_time="2026-06-19T14:30:00+00:00",
        end_time="2026-06-19T14:30:22+00:00",
        duration_ms=22_000,
        status=Status.OK,
        totals=Totals(
            usage=Usage(input_tokens=1800, output_tokens=320),
            cost_usd=0.018,
            llm_calls=1,
            tool_calls=1,
        ),
        events=[
            Event(
                id="ev-s1",
                seq=1,
                type=EventType.USER_PROMPT,
                name="user_prompt",
                start_time="2026-06-19T14:30:00+00:00",
                prompt="Reply confirming their class booking.",
            ),
        ],
    )
    storage.put_session(session)
    _index_session(storage, session, THREAD_SIMPLE)
    return session


def _emit_backend_lifecycle(storage: LocalStorage) -> None:
    emit_activity(
        source="backend-demo",
        type="draft_created",
        name="Gmail draft created",
        timestamp="2026-06-20T09:00:30+00:00",
        metadata=COMMON_MD,
        attributes={
            "gmail_draft_id": "r-1234567890",
            "applied_labels": ["AI_DRAFT", "PENDING_REVIEW"],
        },
        index_facets=FACET_KEYS,
        storage=storage,
    )

    emit_activity(
        source="backend-demo",
        type="draft_updated",
        name="Draft labels refreshed",
        timestamp="2026-06-20T09:01:30+00:00",
        metadata=COMMON_MD,
        attributes={
            "gmail_draft_id": "r-1234567890",
            "applied_labels": ["AI_DRAFT", "PENDING_REVIEW", "NEEDS_STAFF"],
        },
        index_facets=FACET_KEYS,
        storage=storage,
    )

    emit_activity(
        source="backend-demo",
        type="reconcile_decision",
        name="Staff sent edited draft",
        timestamp="2026-06-20T10:15:00+00:00",
        metadata={**COMMON_MD, "run_id": "run_reconcile_8842", "draft_id": "draft_voyager_001"},
        attributes={
            "reason_code": "sent_with_edits",
            "new_state": "SENT",
            "transitioned": True,
            "edit_distance": 47,
            "delete_outcome": "pending",
            "human_edited": True,
            "gmail_draft_id": "r-1234567890",
            "sunday_draft_body": (
                "Hi Alex,\n\n"
                "Great question! Voyager 1 launched in 1977 and is now the most distant "
                "human-made object from Earth — over 15 billion miles away.\n\n"
                "See you at class,\nSunday"
            ),
            "live_gmail_draft_body": (
                "Hi Alex,\n\n"
                "Great question! Voyager 1 launched in 1977 and is still sending data back "
                "from interstellar space — over 15 billion miles away. Pretty wild that a "
                "probe from the 70s is still talking to us.\n\n"
                "See you at class,\nJamie (S&T front desk)"
            ),
        },
        index_facets=FACET_KEYS,
        storage=storage,
    )

    emit_activity(
        source="backend-demo",
        type="prior_draft_deleted",
        name="Superseded AI draft removed",
        timestamp="2026-06-20T10:15:02+00:00",
        metadata=COMMON_MD,
        attributes={"reason_code": "reviewer_deleted_with_followup"},
        index_facets=FACET_KEYS,
        storage=storage,
    )

    emit_activity(
        source="backend-demo",
        type="gmail_draft_deleted",
        name="Gmail draft deleted (recovery)",
        timestamp="2026-06-20T10:15:05+00:00",
        metadata=COMMON_MD,
        attributes={
            "reason_code": "recovery_delete",
            "gmail_draft_id": "r-1234567890",
            "outcome": "ok",
        },
        index_facets=FACET_KEYS,
        storage=storage,
    )


def _emit_simple_thread_activity(storage: LocalStorage) -> None:
    emit_activity(
        source="backend-demo",
        type="draft_created",
        name="Booking confirmation draft",
        timestamp="2026-06-19T14:30:18+00:00",
        metadata={
            "thread_id": THREAD_SIMPLE,
            "email_thread_id": THREAD_SIMPLE,
            "team_id": "sweat-and-tonic",
        },
        attributes={
            "gmail_draft_id": "r-9988776655",
            "applied_labels": ["AI_DRAFT"],
        },
        index_facets=FACET_KEYS,
        storage=storage,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed facet mock data for dashboard dev")
    parser.add_argument(
        "--merge-into",
        type=Path,
        help="Existing AMS_LOCAL_DIR to merge into (does not wipe sessions/index)",
    )
    args = parser.parse_args()

    target = (args.merge_into or ROOT).resolve()
    merge = args.merge_into is not None

    if not merge:
        if ROOT.exists():
            shutil.rmtree(ROOT)
        ROOT.mkdir(parents=True)

    storage = LocalStorage(root=str(target))
    _session_voyager_draft(storage)
    _emit_backend_lifecycle(storage)
    _session_simple_followup(storage)
    _emit_simple_thread_activity(storage)

    if not merge:
        agents_dir = target / "agents"
        agents_dir.mkdir(exist_ok=True)
        (agents_dir / "email-agent.json").write_text(
            json.dumps(
                {
                    "agent_name": "email-agent",
                    "session_count": 2,
                    "error_count": 0,
                    "last_seen": "2026-06-20T09:00:45+00:00",
                    "last_session_id": "sess_thread_voyager_001",
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    print(f"Wrote facet mock data to {target}")
    for facet in FACET_KEYS:
        values = storage.list_facet_values(facet)
        if not values:
            continue
        print(f"  {facet}: {values}")


if __name__ == "__main__":
    main()
