from typing import Optional

from fastapi import APIRouter, HTTPException

from ams.schema import Session

from app import service

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("")
def list_sessions(agent: Optional[str] = None) -> list[dict]:
    """Compact session index summaries, newest first; optional ?agent= filter."""
    return service.list_session_indexes(agent=agent)


@router.get("/{session_id}")
def get_session(session_id: str) -> Session:
    """The full session including events."""
    session = service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session not found")
    return session
