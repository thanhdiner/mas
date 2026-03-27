from collections.abc import Generator
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.main as main_module


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
    async def noop() -> None:
        return None

    monkeypatch.setattr(main_module, "connect_db", noop)
    monkeypatch.setattr(main_module, "close_db", noop)

    with TestClient(main_module.app) as test_client:
        yield test_client
