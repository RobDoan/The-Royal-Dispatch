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
        audio_url="https://royal-audio.s3.us-east-1.amazonaws.com/audio.mp3",
        language="en",
        timezone="America/Los_Angeles",
    )


def _mock_conn(mocker):
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    mock_ctx = MagicMock()
    mock_ctx.__enter__ = MagicMock(return_value=mock_conn)
    mock_ctx.__exit__ = MagicMock(return_value=False)
    mocker.patch("backend.nodes.store_result.get_conn", return_value=mock_ctx)
    return mock_cursor


def test_store_result_upserts_story_and_returns_audio_url(complete_state, mocker):
    mock_cursor = _mock_conn(mocker)
    result = store_result(complete_state)
    assert result["audio_url"] == "https://royal-audio.s3.us-east-1.amazonaws.com/audio.mp3"
    mock_cursor.execute.assert_called_once()
    sql, params = mock_cursor.execute.call_args[0]
    assert "ON CONFLICT" in sql
    assert "elsa" in params
    assert "en" in params


def test_store_result_includes_royal_challenge_for_life_lesson(mocker):
    state = RoyalState(
        princess="belle", date="2026-03-29",
        brief="She tried sharing.", tone="praise",
        persona={"name": "Belle"},
        story_type="life_lesson", situation="sharing",
        story_text="[GENTLE] Emma, sharing is a gift.",
        audio_url="https://royal-audio.s3.us-east-1.amazonaws.com/life.mp3",
        language="vi",
        timezone="America/Los_Angeles",
    )
    state_with_challenge = dict(state)
    state_with_challenge["royal_challenge"] = "Try sharing one toy today."

    mock_cursor = _mock_conn(mocker)
    result = store_result(state_with_challenge)
    assert result["audio_url"] == "https://royal-audio.s3.us-east-1.amazonaws.com/life.mp3"
    sql, params = mock_cursor.execute.call_args[0]
    assert "Try sharing one toy today." in params


def test_store_result_passes_none_royal_challenge_for_daily(complete_state, mocker):
    mock_cursor = _mock_conn(mocker)
    store_result(complete_state)
    sql, params = mock_cursor.execute.call_args[0]
    assert None in params
