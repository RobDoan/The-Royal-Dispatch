import os
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock


# Set required env vars at conftest import time so test modules that import
# backend.main at module level (e.g. tests/test_utils/test_metrics.py) can
# succeed during collection.
os.environ.setdefault("AUTH_SECRET", "test-secret-hex")
os.environ.setdefault("N8N_SHARED_SECRET", "test-n8n-secret")
os.environ.setdefault("FRONTEND_URL", "http://localhost:3000")


@pytest.fixture(autouse=True, scope="session")
def _auth_secret_default():
    os.environ.setdefault("AUTH_SECRET", "test-secret-hex")
    os.environ.setdefault("N8N_SHARED_SECRET", "test-n8n-secret")
    os.environ.setdefault("FRONTEND_URL", "http://localhost:3000")


@pytest.fixture
def client():
    from backend.main import app
    return TestClient(app)


@pytest.fixture
def mock_db_pool(mocker):
    mock_pool = MagicMock()
    import backend.db.client as db_module
    db_module._pool = None
    mocker.patch.dict(os.environ, {"DATABASE_URL": "postgres://royal:pw@localhost/royal_dispatch"})
    mocker.patch("backend.db.client.pool.SimpleConnectionPool", return_value=mock_pool)
    return mock_pool
