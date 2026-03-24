import pytest
from unittest.mock import MagicMock
from backend.state import RoyalState
from backend.nodes.classify_tone import classify_tone
from datetime import date

@pytest.fixture
def praise_state() -> RoyalState:
    return RoyalState(
        princess="elsa", date=date.today().isoformat(),
        brief="She shared her blocks with her friend today.",
        tone="", persona={}, story_text="", audio_url="", language="en",
    )

@pytest.fixture
def habit_state() -> RoyalState:
    return RoyalState(
        princess="elsa", date=date.today().isoformat(),
        brief="She refused to brush her teeth tonight.",
        tone="", persona={}, story_text="", audio_url="", language="en",
    )

@pytest.fixture
def fallback_state() -> RoyalState:
    return RoyalState(
        princess="elsa", date=date.today().isoformat(),
        brief="__fallback__",
        tone="", persona={}, story_text="", audio_url="", language="en",
    )

def test_classify_tone_returns_praise(praise_state, mocker):
    mock_llm = MagicMock()
    mock_llm.invoke.return_value.content = "praise"
    mocker.patch("backend.nodes.classify_tone.get_llm", return_value=mock_llm)
    result = classify_tone(praise_state)
    assert result["tone"] == "praise"

def test_classify_tone_returns_habit(habit_state, mocker):
    mock_llm = MagicMock()
    mock_llm.invoke.return_value.content = "habit"
    mocker.patch("backend.nodes.classify_tone.get_llm", return_value=mock_llm)
    result = classify_tone(habit_state)
    assert result["tone"] == "habit"

def test_classify_tone_skips_llm_for_fallback(fallback_state, mocker):
    mock_get_llm = mocker.patch("backend.nodes.classify_tone.get_llm")
    result = classify_tone(fallback_state)
    mock_get_llm.assert_not_called()
    assert result["tone"] == "praise"
