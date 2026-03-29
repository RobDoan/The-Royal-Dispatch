import pytest
from unittest.mock import MagicMock
from backend.state import RoyalState
from backend.nodes.generate_story import generate_story
from datetime import date

@pytest.fixture
def praise_state() -> RoyalState:
    return RoyalState(
        princess="elsa", date=date.today().isoformat(),
        brief="She shared her blocks today.",
        tone="praise",
        persona={
            "name": "Queen Elsa",
            "origin": "Kingdom of Arendelle",
            "tone_style": "calm, majestic",
            "audio_tags": {"praise": ["[PROUD]", "[CALM]"]},
            "signature_phrase": "The cold never bothered me.",
            "metaphor": "Self-control is like the ice.",
            "fallback_letter": {"en": "fallback", "vi": "fallback"},
        },
        story_type="daily", situation="", story_text="", audio_url="", language="en",
    )

def test_generate_story_returns_text_with_audio_tags(praise_state, mocker):
    mock_llm = MagicMock()
    mock_llm.invoke.return_value.content = "[PROUD] Emma, I heard you shared your blocks today! [CALM] That makes you a true princess."
    mocker.patch("backend.nodes.generate_story.get_llm", return_value=mock_llm)
    result = generate_story(praise_state)
    assert "[PROUD]" in result["story_text"]
    assert "Emma" in result["story_text"]

def test_generate_story_uses_fallback_letter_when_no_brief(mocker):
    state = RoyalState(
        princess="elsa", date=date.today().isoformat(),
        brief="__fallback__", tone="praise",
        persona={
            "fallback_letter": {"en": "Emma, I was thinking of you.", "vi": "Emma ơi."},
        },
        story_type="daily", situation="", story_text="", audio_url="", language="en",
    )
    mock_get_llm = mocker.patch("backend.nodes.generate_story.get_llm")
    result = generate_story(state)
    mock_get_llm.assert_not_called()
    assert result["story_text"] == "Emma, I was thinking of you."

def test_generate_story_uses_vi_fallback_when_language_vi(mocker):
    state = RoyalState(
        princess="elsa", date=date.today().isoformat(),
        brief="__fallback__", tone="praise",
        persona={
            "fallback_letter": {"en": "Emma, thinking of you.", "vi": "Emma ơi, nhớ em."},
        },
        story_type="daily", situation="", story_text="", audio_url="", language="vi",
    )
    mocker.patch("backend.nodes.generate_story.get_llm")
    result = generate_story(state)
    assert result["story_text"] == "Emma ơi, nhớ em."


def test_generate_story_includes_memories_in_system_prompt(praise_state, mocker):
    """When memories are present, the system prompt includes them under 'What I know about Emma'."""
    praise_state["memories"] = (
        "- Emma loves her blue teddy bear\n- She is working on brushing her teeth"
    )
    mock_llm = MagicMock()
    mock_llm.invoke.return_value.content = "[PROUD] Emma, you did great!"
    mocker.patch("backend.nodes.generate_story.get_llm", return_value=mock_llm)

    generate_story(praise_state)

    system_msg = mock_llm.invoke.call_args[0][0][0]
    assert "What I know about Emma" in system_msg.content
    assert "Emma loves her blue teddy bear" in system_msg.content


def test_generate_story_omits_memory_section_when_memories_empty(praise_state, mocker):
    """When memories is empty string, 'What I know about Emma' must not appear in the prompt."""
    praise_state["memories"] = ""
    mock_llm = MagicMock()
    mock_llm.invoke.return_value.content = "[PROUD] Emma, you did great!"
    mocker.patch("backend.nodes.generate_story.get_llm", return_value=mock_llm)

    generate_story(praise_state)

    system_msg = mock_llm.invoke.call_args[0][0][0]
    assert "What I know about Emma" not in system_msg.content


def test_generate_story_omits_memory_section_when_memories_absent(praise_state, mocker):
    """When memories key is absent from state, no memory section in prompt."""
    # praise_state fixture doesn't include memories — simulates nodes before fetch_memories ran
    mock_llm = MagicMock()
    mock_llm.invoke.return_value.content = "[PROUD] Emma, you did great!"
    mocker.patch("backend.nodes.generate_story.get_llm", return_value=mock_llm)

    generate_story(praise_state)

    system_msg = mock_llm.invoke.call_args[0][0][0]
    assert "What I know about Emma" not in system_msg.content
