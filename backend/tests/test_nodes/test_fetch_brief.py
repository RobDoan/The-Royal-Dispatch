from unittest.mock import MagicMock
import os
import pytest
from datetime import date
from backend.db.client import get_supabase_client
from backend.state import RoyalState
from backend.nodes.fetch_brief import fetch_brief

def test_get_supabase_client_returns_singleton(mocker):
    mock_client = MagicMock()
    mocker.patch.dict(os.environ, {
        "SUPABASE_URL": "https://test.supabase.co",
        "SUPABASE_SERVICE_KEY": "test-key",
    })
    mocker.patch("backend.db.client.create_client", return_value=mock_client)
    # Reset module-level singleton for test isolation
    import backend.db.client as db_module
    db_module._client = None
    client1 = get_supabase_client()
    client2 = get_supabase_client()
    assert client1 is client2

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
    )

def test_fetch_brief_returns_brief_text(base_state, mocker):
    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
        "text": "She shared her blocks today."
    }
    mocker.patch("backend.nodes.fetch_brief.get_supabase_client", return_value=mock_client)
    result = fetch_brief(base_state)
    assert result["brief"] == "She shared her blocks today."

def test_fetch_brief_uses_fallback_when_no_brief(base_state, mocker):
    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = None
    mocker.patch("backend.nodes.fetch_brief.get_supabase_client", return_value=mock_client)
    result = fetch_brief(base_state)
    assert result["brief"] == "__fallback__"
