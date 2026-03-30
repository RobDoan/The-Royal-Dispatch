import os
import pytest
from unittest.mock import MagicMock
import backend.db.client as db_module


def test_get_db_returns_singleton(mocker):
    mock_pool = MagicMock()
    mocker.patch.dict(os.environ, {"DATABASE_URL": "postgres://royal:pw@localhost/royal_dispatch"})
    mocker.patch("backend.db.client.pool.SimpleConnectionPool", return_value=mock_pool)
    db_module._pool = None
    from backend.db.client import get_db
    p1 = get_db()
    p2 = get_db()
    assert p1 is p2


def test_get_conn_commits_on_success(mocker):
    mock_pool = MagicMock()
    mock_conn = MagicMock()
    mock_pool.getconn.return_value = mock_conn
    mocker.patch("backend.db.client.get_db", return_value=mock_pool)
    from backend.db.client import get_conn
    with get_conn() as conn:
        assert conn is mock_conn
    mock_conn.commit.assert_called_once()
    mock_pool.putconn.assert_called_once_with(mock_conn)


def test_get_conn_rolls_back_on_exception(mocker):
    mock_pool = MagicMock()
    mock_conn = MagicMock()
    mock_pool.getconn.return_value = mock_conn
    mocker.patch("backend.db.client.get_db", return_value=mock_pool)
    from backend.db.client import get_conn
    with pytest.raises(ValueError):
        with get_conn() as conn:
            raise ValueError("boom")
    mock_conn.rollback.assert_called_once()
    mock_pool.putconn.assert_called_once_with(mock_conn)
