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
    mock_llm.invoke.return_value = MagicMock(content="Sharing With A Sibling.")  # mixed case + period
    with patch("backend.nodes.infer_situation.get_llm", return_value=mock_llm):
        from backend.nodes.infer_situation import infer_situation
        result = infer_situation(make_state("Emma had trouble sharing crayons with her brother"))
    situation = result["situation"]
    assert situation == "sharing with a sibling"  # normalized: lowercased, period removed
    assert len(situation.split()) <= 8

def test_infer_situation_uses_fallback_for_empty_brief():
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content="kindness")
    with patch("backend.nodes.infer_situation.get_llm", return_value=mock_llm):
        from backend.nodes.infer_situation import infer_situation
        result = infer_situation(make_state("__fallback__"))
    assert result["situation"] in ALLOWED_FALLBACKS

def test_infer_situation_clamps_invalid_response_for_short_brief():
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content="something weird and invalid")  # NOT in ALLOWED_FALLBACKS
    with patch("backend.nodes.infer_situation.get_llm", return_value=mock_llm):
        from backend.nodes.infer_situation import infer_situation
        result = infer_situation(make_state("a b c"))  # 3 words < 5 → triggers fallback
    assert result["situation"] == "kindness"  # clamped to first fallback
