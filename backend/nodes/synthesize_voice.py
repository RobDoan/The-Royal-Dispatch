import os
from elevenlabs.client import ElevenLabs
from backend.state import RoyalStateOptional
from backend.storage.client import get_storage

_elevenlabs = None


def get_elevenlabs_client() -> ElevenLabs:
    global _elevenlabs
    if _elevenlabs is None:
        _elevenlabs = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    return _elevenlabs


def synthesize_voice(state: RoyalStateOptional) -> dict:
    client = get_elevenlabs_client()
    audio_chunks = client.text_to_speech.convert(
        voice_id=state["persona"]["voice_id"],
        text=state["story_text"],
        model_id="eleven_v3",
        output_format="mp3_44100_128",
    )
    audio_bytes = b"".join(audio_chunks)

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
