import os
import pytest
from unittest.mock import MagicMock
from datetime import date
import backend.db.client as db_module


# ── DB client tests ──────────────────────────────────────────────────────────

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


# ── fetch_brief tests ────────────────────────────────────────────────────────

from backend.state import RoyalState
from backend.nodes.fetch_brief import fetch_brief


@pytest.fixture
def base_state() -> RoyalState:
    return RoyalState(
        princess="elsa",
        date=date.today().isoformat(),
        brief="",
        tone="",
        persona={},
        story_type="daily",
        situation="",
        story_text="",
        audio_url="",
        language="en",
        timezone="America/Los_Angeles",
    )


def _mock_conn_with_rows(mocker, rows):
    """Helper: patch get_conn to return a mock connection whose cursor yields rows."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    mock_cursor.fetchall.return_value = rows
    mock_ctx = MagicMock()
    mock_ctx.__enter__ = MagicMock(return_value=mock_conn)
    mock_ctx.__exit__ = MagicMock(return_value=False)
    mocker.patch("backend.nodes.fetch_brief.get_conn", return_value=mock_ctx)
    return mock_cursor


def test_fetch_brief_returns_merged_brief_text(base_state, mocker):
    _mock_conn_with_rows(mocker, [("She shared her blocks today.",), ("She also cleaned up.",)])
    result = fetch_brief(base_state)
    assert "She shared her blocks today." in result["brief"]
    assert "She also cleaned up." in result["brief"]


def test_fetch_brief_uses_fallback_when_no_brief(base_state, mocker):
    _mock_conn_with_rows(mocker, [])
    result = fetch_brief(base_state)
    assert result["brief"] == "__fallback__"
