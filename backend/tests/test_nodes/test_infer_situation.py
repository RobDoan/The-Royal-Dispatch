import pytest
from unittest.mock import MagicMock, patch

ALLOWED_FALLBACKS = {"kindness", "patience", "courage", "sharing", "honesty", "trying new things"}

def make_state(brief: str) -> dict:
    return {
        "princess": "elsa", "date": "2026-03-24", "brief": brief,
        "tone": "praise", "persona": {}, "story_type": "life_lesson",
        "situation": "", "story_text": "", "audio_url": "", "language": "en",
    }

def test_infer_situation_extracts_from_brief():
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content="sharing with a sibling")
    with patch("backend.nodes.infer_situation.get_llm", return_value=mock_llm):
        from backend.nodes.infer_situation import infer_situation
        result = infer_situation(make_state("Emma had trouble sharing crayons with her brother"))
    situation = result["situation"]
    assert isinstance(situation, str)
    assert len(situation.split()) <= 8
    assert situation.strip() != ""

def test_infer_situation_uses_fallback_for_empty_brief():
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content="kindness")
    with patch("backend.nodes.infer_situation.get_llm", return_value=mock_llm):
        from backend.nodes.infer_situation import infer_situation
        result = infer_situation(make_state("__fallback__"))
    assert result["situation"] in ALLOWED_FALLBACKS

def test_infer_situation_uses_fallback_for_non_teachable_brief():
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content="courage")
    with patch("backend.nodes.infer_situation.get_llm", return_value=mock_llm):
        from backend.nodes.infer_situation import infer_situation
        result = infer_situation(make_state("Emma ate breakfast and watched TV"))
    assert result["situation"] in ALLOWED_FALLBACKS
