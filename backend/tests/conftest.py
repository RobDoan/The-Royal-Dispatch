import os
import pytest
from unittest.mock import MagicMock


@pytest.fixture(autouse=True, scope="session")
def _auth_secret_default():
    os.environ.setdefault("AUTH_SECRET", "test-secret-hex")
    os.environ.setdefault("N8N_SHARED_SECRET", "test-n8n-secret")
    os.environ.setdefault("FRONTEND_URL", "http://localhost:3000")


@pytest.fixture
def mock_db_pool(mocker):
    mock_pool = MagicMock()
    import backend.db.client as db_module
    db_module._pool = None
    mocker.patch.dict(os.environ, {"DATABASE_URL": "postgres://royal:pw@localhost/royal_dispatch"})
    mocker.patch("backend.db.client.pool.SimpleConnectionPool", return_value=mock_pool)
    return mock_pool
