import os
import pytest
from unittest.mock import MagicMock


@pytest.fixture
def mock_db_pool(mocker):
    mock_pool = MagicMock()
    import backend.db.client as db_module
    db_module._pool = None
    mocker.patch.dict(os.environ, {"DATABASE_URL": "postgres://royal:pw@localhost/royal_dispatch"})
    mocker.patch("backend.db.client.pool.SimpleConnectionPool", return_value=mock_pool)
    return mock_pool
