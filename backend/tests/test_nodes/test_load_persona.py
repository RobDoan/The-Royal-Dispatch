import pytest
from backend.state import RoyalState
from backend.nodes.load_persona import load_persona
from datetime import date

@pytest.fixture
def elsa_state() -> RoyalState:
    return RoyalState(
        princess="elsa", date=date.today().isoformat(),
        brief="She shared today.", tone="praise",
        persona={}, story_text="", audio_url="", language="en",
    )

def test_load_persona_returns_elsa_config(elsa_state):
    result = load_persona(elsa_state)
    persona = result["persona"]
    assert persona["name"] == "Queen Elsa"
    assert "voice_id" in persona
    assert "audio_tags" in persona
    assert "praise" in persona["audio_tags"]

def test_load_persona_raises_for_unknown_princess():
    state = RoyalState(
        princess="unknown", date=date.today().isoformat(),
        brief="test", tone="praise",
        persona={}, story_text="", audio_url="", language="en",
    )
    with pytest.raises(FileNotFoundError):
        load_persona(state)
