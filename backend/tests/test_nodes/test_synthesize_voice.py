import os
import pytest
from unittest.mock import MagicMock
from datetime import date
from backend.state import RoyalState
from backend.nodes.synthesize_voice import synthesize_voice


@pytest.fixture
def ready_state() -> RoyalState:
    return RoyalState(
        princess="elsa", date=date.today().isoformat(),
        brief="She shared today.", tone="praise",
        persona={"voice_id": "test-voice-id"},
        story_type="daily", situation="",
        story_text="[PROUD] Emma, you did wonderfully today!",
        audio_url="", language="en",
        timezone="America/Los_Angeles",
    )


def test_synthesize_voice_uploads_to_s3_and_returns_url(ready_state, mocker):
    mock_elevenlabs = MagicMock()
    mock_elevenlabs.text_to_speech.convert.return_value = iter([b"chunk1", b"chunk2"])
    mocker.patch("backend.nodes.synthesize_voice.get_elevenlabs_client", return_value=mock_elevenlabs)

    mock_s3 = MagicMock()
    mocker.patch("backend.nodes.synthesize_voice.get_storage", return_value=mock_s3)
    mocker.patch.dict(os.environ, {"S3_BUCKET": "royal-audio", "AWS_REGION": "us-east-1"})

    result = synthesize_voice(ready_state)

    mock_s3.put_object.assert_called_once()
    call_kwargs = mock_s3.put_object.call_args[1]
    assert call_kwargs["Bucket"] == "royal-audio"
    assert call_kwargs["ContentType"] == "audio/mpeg"
    assert result["audio_url"].startswith("https://royal-audio.s3.us-east-1.amazonaws.com/")


def test_synthesize_voice_daily_filename_format(ready_state, mocker):
    ready_state["date"] = "2026-03-29"
    ready_state["princess"] = "elsa"
    ready_state["language"] = "en"
    ready_state["story_type"] = "daily"

    mock_elevenlabs = MagicMock()
    mock_elevenlabs.text_to_speech.convert.return_value = iter([b"chunk"])
    mocker.patch("backend.nodes.synthesize_voice.get_elevenlabs_client", return_value=mock_elevenlabs)
    mock_s3 = MagicMock()
    mocker.patch("backend.nodes.synthesize_voice.get_storage", return_value=mock_s3)
    mocker.patch.dict(os.environ, {"S3_BUCKET": "royal-audio", "AWS_REGION": "us-east-1"})

    synthesize_voice(ready_state)

    key = mock_s3.put_object.call_args[1]["Key"]
    assert key == "2026-03-29-elsa-en.mp3"


def test_synthesize_voice_life_lesson_filename_includes_suffix(mocker):
    state = RoyalState(
        princess="elsa", date="2026-03-24",
        brief="Emma shared today.", tone="praise",
        persona={"voice_id": "test-voice-id"},
        story_type="life_lesson", situation="sharing",
        story_text="[GENTLE] Emma, sharing is caring.",
        audio_url="", language="en",
        timezone="America/Los_Angeles",
    )
    mock_elevenlabs = MagicMock()
    mock_elevenlabs.text_to_speech.convert.return_value = iter([b"chunk"])
    mocker.patch("backend.nodes.synthesize_voice.get_elevenlabs_client", return_value=mock_elevenlabs)
    mock_s3 = MagicMock()
    mocker.patch("backend.nodes.synthesize_voice.get_storage", return_value=mock_s3)
    mocker.patch.dict(os.environ, {"S3_BUCKET": "royal-audio", "AWS_REGION": "us-east-1"})

    synthesize_voice(state)

    key = mock_s3.put_object.call_args[1]["Key"]
    assert key == "2026-03-24-elsa-en-life_lesson.mp3"
