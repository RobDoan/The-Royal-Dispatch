from unittest.mock import MagicMock
from backend.nodes.synthesize_voice import synthesize_voice_stream


def test_synthesize_voice_stream_yields_chunks_unchanged(mocker):
    mock_client = MagicMock()
    mock_client.text_to_speech.convert.return_value = iter([b"chunk1", b"chunk2", b"chunk3"])
    mocker.patch("backend.nodes.synthesize_voice.get_elevenlabs_client", return_value=mock_client)

    chunks = list(synthesize_voice_stream(voice_id="v-123", text="Hello"))

    assert chunks == [b"chunk1", b"chunk2", b"chunk3"]
    mock_client.text_to_speech.convert.assert_called_once_with(
        voice_id="v-123",
        text="Hello",
        model_id="eleven_v3",
        output_format="mp3_44100_128",
    )


def test_synthesize_voice_stream_does_not_touch_s3(mocker):
    mock_client = MagicMock()
    mock_client.text_to_speech.convert.return_value = iter([b"chunk"])
    mocker.patch("backend.nodes.synthesize_voice.get_elevenlabs_client", return_value=mock_client)
    mock_storage = MagicMock()
    mocker.patch("backend.nodes.synthesize_voice.get_storage", return_value=mock_storage)

    list(synthesize_voice_stream(voice_id="v", text="t"))

    mock_storage.put_object.assert_not_called()
