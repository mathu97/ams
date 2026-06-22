from fastapi import APIRouter

from app import service

router = APIRouter(prefix="/facets", tags=["facets"])


@router.get("/{facet}")
def list_facet_entities(facet: str) -> list[dict]:
    """Every value of a facet (e.g. every thread_id) with a lightweight rollup,
    newest first. AMS treats the facet key as opaque, so this works for
    thread_id, team_id, customer_email, ... whatever the producer indexed."""
    return service.list_facet_entities(facet)


@router.get("/{facet}/{value}")
def get_entity_timeline(facet: str, value: str) -> list[dict]:
    """The merged timeline for one entity: agent sessions and backend activities
    sharing this facet value, ordered by time."""
    return service.get_entity_timeline(facet, value)
