from unittest.mock import MagicMock, patch

MOCK_PERSONA = {
    "name": "Queen Elsa",
    "origin": "Kingdom of Arendelle",
    "tone_style": "wise and warm",
    "audio_tags": {"praise": ["[PROUD]"], "habit": ["[GENTLE]"]},
    "signature_phrase": "The cold never bothered me anyway.",
    "metaphor": "a snowflake finding its place",
}

def make_state(language: str = "en") -> dict:
    return {
        "princess": "elsa", "date": "2026-03-24", "brief": "Emma had trouble sharing",
        "tone": "habit", "persona": MOCK_PERSONA, "story_type": "life_lesson",
        "situation": "sharing with a sibling", "story_text": "",
        "audio_url": "", "language": language,
    }

def test_generate_life_lesson_sets_story_text_and_royal_challenge():
    challenge = "Try sharing one favourite thing with someone today."
    story = f"Once in Arendelle there was a girl who learned to share. {challenge}"
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content=f"STORY:{story}\nCHALLENGE:{challenge}")
    with patch("backend.nodes.generate_life_lesson.get_llm", return_value=mock_llm):
        from backend.nodes.generate_life_lesson import generate_life_lesson
        result = generate_life_lesson(make_state())
    assert result["story_text"] != ""
    assert result["royal_challenge"] is not None
    assert result["royal_challenge"] != ""

def test_royal_challenge_appears_in_story_text():
    challenge = "Try giving a hug to someone you love today."
    story_body = "Once there was a little snowflake who learned kindness."
    full_story = f"{story_body} Your Royal Challenge: {challenge}"
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(
        content=f"STORY:{full_story}\nCHALLENGE:{challenge}"
    )
    with patch("backend.nodes.generate_life_lesson.get_llm", return_value=mock_llm):
        from backend.nodes.generate_life_lesson import generate_life_lesson
        result = generate_life_lesson(make_state())
    assert result["royal_challenge"] in result["story_text"]
