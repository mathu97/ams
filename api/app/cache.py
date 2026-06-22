import threading
import time
from typing import Any, Callable


class TTLCache:
    """A tiny in-process TTL cache. Synchronous on purpose: the service layer
    calls blocking ams storage (boto3), and FastAPI runs our sync handlers in a
    threadpool, so there's no event loop to block. Misses are loaded under the
    lock so a burst of concurrent requests for a cold key does one fetch, not N.
    """

    def __init__(self, ttl: float) -> None:
        self.ttl = ttl
        self._store: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get_or_set(self, key: str, loader: Callable[[], Any]) -> Any:
        now = time.monotonic()
        hit = self._store.get(key)
        if hit is not None and hit[0] > now:
            return hit[1]
        with self._lock:
            hit = self._store.get(key)
            if hit is not None and hit[0] > now:
                return hit[1]
            value = loader()
            self._store[key] = (now + self.ttl, value)
            return value

    def clear(self) -> None:
        with self._lock:
            self._store.clear()
