import pytest
from unittest.mock import MagicMock
from backend.state import RoyalState
from backend.nodes.store_result import store_result
from datetime import date

@pytest.fixture
def complete_state() -> RoyalState:
    return RoyalState(
        princess="elsa", date=date.today().isoformat(),
        brief="She shared today.", tone="praise",
        persona={"name": "Queen Elsa"},
        story_type="daily", situation="",
        story_text="[PROUD] Emma, you are wonderful.",
        audio_url="https://example.com/audio.mp3",
        language="en",
    )

def test_store_result_upserts_to_supabase(complete_state, mocker):
    mock_client = MagicMock()
    mock_client.table.return_value.upsert.return_value.execute.return_value = MagicMock()
    mocker.patch("backend.nodes.store_result.get_supabase_client", return_value=mock_client)
    result = store_result(complete_state)
    assert result["audio_url"] == "https://example.com/audio.mp3"
    mock_client.table.assert_called_with("stories")
    call_kwargs = mock_client.table.return_value.upsert.call_args[0][0]
    assert call_kwargs["princess"] == "elsa"
    assert call_kwargs["audio_url"] == "https://example.com/audio.mp3"
