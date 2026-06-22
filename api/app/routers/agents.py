from fastapi import APIRouter, HTTPException

from app import service

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("")
def list_agents() -> list[dict]:
    return service.list_agents()


@router.get("/{name}")
def get_agent(name: str) -> dict:
    agent = service.get_agent(name)
    if agent is None:
        raise HTTPException(status_code=404, detail="agent not found")
    return agent


@router.get("/{name}/sessions")
def list_agent_sessions(name: str) -> list[dict]:
    return service.list_session_indexes(agent=name)
