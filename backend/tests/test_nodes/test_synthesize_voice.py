import pytest
from unittest.mock import MagicMock
from backend.state import RoyalState
from backend.nodes.synthesize_voice import synthesize_voice
from datetime import date

@pytest.fixture
def ready_state() -> RoyalState:
    return RoyalState(
        princess="elsa", date=date.today().isoformat(),
        brief="She shared today.", tone="praise",
        persona={"voice_id": "test-voice-id"},
        story_type="daily", situation="",
        story_text="[PROUD] Emma, you did wonderfully today!",
        audio_url="", language="en",
    )

def test_synthesize_voice_uploads_and_returns_url(ready_state, mocker):
    mock_elevenlabs = MagicMock()
    mock_elevenlabs.text_to_speech.convert.return_value = iter([b"audio_chunk_1", b"audio_chunk_2"])
    mocker.patch("backend.nodes.synthesize_voice.get_elevenlabs_client", return_value=mock_elevenlabs)

    mock_supabase = MagicMock()
    mock_supabase.storage.from_.return_value.upload.return_value = {}
    mock_supabase.storage.from_.return_value.get_public_url.return_value = "https://example.com/audio.mp3"
    mocker.patch("backend.nodes.synthesize_voice.get_supabase_client", return_value=mock_supabase)

    result = synthesize_voice(ready_state)
    assert result["audio_url"] == "https://example.com/audio.mp3"
    assert mock_elevenlabs.text_to_speech.convert.called


def test_synthesize_voice_life_lesson_filename_includes_suffix(mocker):
    state = RoyalState(
        princess="elsa", date="2026-03-24",
        brief="Emma shared today.", tone="praise",
        persona={"voice_id": "test-voice-id"},
        story_type="life_lesson", situation="sharing",
        story_text="[GENTLE] Emma, sharing is caring.",
        audio_url="", language="en",
    )
    mock_elevenlabs = MagicMock()
    mock_elevenlabs.text_to_speech.convert.return_value = iter([b"chunk"])
    mocker.patch("backend.nodes.synthesize_voice.get_elevenlabs_client", return_value=mock_elevenlabs)

    mock_supabase = MagicMock()
    mock_supabase.storage.from_.return_value.upload.return_value = {}
    mock_supabase.storage.from_.return_value.get_public_url.return_value = "https://example.com/life.mp3"
    mocker.patch("backend.nodes.synthesize_voice.get_supabase_client", return_value=mock_supabase)

    synthesize_voice(state)
    upload_path = mock_supabase.storage.from_.return_value.upload.call_args[1]["path"]
    assert "-life_lesson" in upload_path
    assert upload_path == "2026-03-24-elsa-en-life_lesson.mp3"
