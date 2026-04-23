import os
from typing import Iterator
from elevenlabs.client import ElevenLabs
from backend.state import RoyalStateOptional
from backend.storage.client import get_storage
from backend.utils.metrics import external_api_calls

_elevenlabs = None


def get_elevenlabs_client() -> ElevenLabs:
    global _elevenlabs
    if _elevenlabs is None:
        _elevenlabs = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    return _elevenlabs


def synthesize_voice(state: RoyalStateOptional) -> dict:
    client = get_elevenlabs_client()
    try:
        audio_chunks = client.text_to_speech.convert(
            voice_id=state["persona"]["voice_id"],
            text=state["story_text"],
            model_id="eleven_v3",
            output_format="mp3_44100_128",
        )
        audio_bytes = b"".join(audio_chunks)
        external_api_calls.labels(provider="elevenlabs", outcome="ok").inc()
    except Exception:
        external_api_calls.labels(provider="elevenlabs", outcome="error").inc()
        raise

    story_type = state["story_type"]
    suffix = f"-{story_type}" if story_type != "daily" else ""
    filename = f"{state['date']}-{state['princess']}-{state['language']}{suffix}.mp3"

    bucket = os.environ["S3_BUCKET"]
    public_url = os.environ["S3_PUBLIC_URL"]
    get_storage().put_object(
        Bucket=bucket,
        Key=filename,
        Body=audio_bytes,
        ContentType="audio/mpeg",
    )
    audio_url = f"{public_url}/{bucket}/{filename}"
    return {"audio_url": audio_url}


def synthesize_voice_stream(voice_id: str, text: str) -> Iterator[bytes]:
    """Stream MP3 chunks from ElevenLabs without buffering or uploading.

    Caller is responsible for consuming the iterator, buffering bytes, and
    persisting the final MP3 to S3 via store_result_from_bytes.
    """
    client = get_elevenlabs_client()
    try:
        result = client.text_to_speech.convert(
            voice_id=voice_id,
            text=text,
            model_id="eleven_v3",
            output_format="mp3_44100_128",
        )
        external_api_calls.labels(provider="elevenlabs", outcome="ok").inc()
        return result
    except Exception:
        external_api_calls.labels(provider="elevenlabs", outcome="error").inc()
        raise
