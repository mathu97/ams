import json

from ams import emit_activity, load_entity_timeline
from ams.facets import facet_pairs
from ams.schema import Activity, FacetMember, Status
from ams.storage.local import LocalStorage
from ams.tracer import Tracer


def test_facet_pairs_filters_missing_and_empty():
    md = {"thread_id": "T1", "team_id": "", "blank": None, "n": 5}
    pairs = facet_pairs(md, ["thread_id", "team_id", "blank", "n", "absent"])
    assert pairs == [("thread_id", "T1"), ("n", "5")]
    assert facet_pairs(None, ["x"]) == []
    assert facet_pairs({"x": "y"}, None) == []


def _activity(thread="T1", id="act-1", ts="2026-06-20T10:00:00+00:00"):
    return Activity(
        id=id,
        source="sunday-backend",
        type="gmail_draft_deleted",
        name="draft deleted",
        timestamp=ts,
        metadata={"thread_id": thread},
        attributes={"reason_code": "superseded_by_staff_send", "human_edited": True},
    )


def test_put_activity_and_read_record(tmp_path):
    storage = LocalStorage(root=str(tmp_path))
    location = storage.put_activity(_activity())
    assert (tmp_path / "activities" / "act-1.json").exists()
    raw = storage.read_record("activities/act-1.json")
    assert raw["type"] == "gmail_draft_deleted"
    assert raw["attributes"]["human_edited"] is True
    assert str(tmp_path / "activities" / "act-1.json") == location


def test_facet_member_roundtrip_and_listing(tmp_path):
    storage = LocalStorage(root=str(tmp_path))
    member = FacetMember(
        kind="activity",
        ref="act-1",
        ref_key="activities/act-1.json",
        timestamp="2026-06-20T10:00:00+00:00",
        summary={"type": "gmail_draft_deleted"},
    )
    storage.put_facet_member("thread_id", "T1", member)

    assert storage.list_facet_values("thread_id") == ["T1"]
    members = storage.list_facet_members("thread_id", "T1")
    assert len(members) == 1
    assert members[0].ref == "act-1"
    assert members[0].kind == "activity"


def test_list_facet_members_sorted_by_timestamp(tmp_path):
    storage = LocalStorage(root=str(tmp_path))
    for ref, ts in [("b", "2026-06-20T12:00:00+00:00"), ("a", "2026-06-20T09:00:00+00:00")]:
        storage.put_facet_member(
            "thread_id",
            "T1",
            FacetMember(kind="activity", ref=ref, timestamp=ts),
        )
    members = storage.list_facet_members("thread_id", "T1")
    assert [m.ref for m in members] == ["a", "b"]


def test_emit_activity_writes_and_indexes(tmp_path):
    storage = LocalStorage(root=str(tmp_path))
    activity = emit_activity(
        source="sunday-backend",
        type="state_transition",
        name="draft discarded",
        metadata={"thread_id": "T9", "team_id": "team-1"},
        attributes={"from": "PENDING_REVIEW", "to": "DISCARDED"},
        index_facets=["thread_id"],
        storage=storage,
    )
    assert activity is not None
    assert (tmp_path / "activities" / f"{activity.id}.json").exists()

    members = storage.list_facet_members("thread_id", "T9")
    assert len(members) == 1
    assert members[0].kind == "activity"
    assert members[0].ref == activity.id
    # team_id was not configured as a facet, so no pointer for it
    assert storage.list_facet_values("team_id") == []


def test_emit_activity_never_raises_on_storage_failure():
    class Broken:
        def put_activity(self, activity):
            raise RuntimeError("boom")

        def activity_key(self, activity):
            return "x"

    activity = emit_activity(
        source="s", type="t", name="n", storage=Broken()
    )
    assert activity is not None  # built and returned despite persist failure


def test_tracer_indexes_session_under_facet(tmp_path):
    storage = LocalStorage(root=str(tmp_path))
    tracer = Tracer(
        storage=storage,
        metadata={"thread_id": "T5"},
        index_facets=["thread_id"],
    )
    session = tracer.finish()
    assert session is not None

    members = storage.list_facet_members("thread_id", "T5")
    assert len(members) == 1
    assert members[0].kind == "session"
    assert members[0].ref == session.session_id


def test_load_entity_timeline_merges_session_and_activity(tmp_path):
    storage = LocalStorage(root=str(tmp_path))
    Tracer(
        storage=storage, metadata={"thread_id": "T7"}, index_facets=["thread_id"]
    ).finish()
    emit_activity(
        source="sunday-backend",
        type="gmail_draft_deleted",
        name="deleted",
        metadata={"thread_id": "T7"},
        attributes={"human_edited": False},
        index_facets=["thread_id"],
        storage=storage,
    )

    timeline = load_entity_timeline("thread_id", "T7", storage=storage)
    kinds = {item["member"].kind for item in timeline}
    assert kinds == {"session", "activity"}
    timestamps = [item["member"].timestamp for item in timeline]
    assert timestamps == sorted(timestamps)
    assert all(item["record"] is None for item in timeline)  # not expanded

    expanded = load_entity_timeline("thread_id", "T7", storage=storage, expand=True)
    activity_item = next(i for i in expanded if i["member"].kind == "activity")
    assert activity_item["record"]["attributes"]["human_edited"] is False
