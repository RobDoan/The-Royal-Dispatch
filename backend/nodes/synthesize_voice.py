import os
from elevenlabs.client import ElevenLabs
from backend.state import RoyalStateOptional
from backend.db.client import get_supabase_client

_elevenlabs = None

def get_elevenlabs_client() -> ElevenLabs:
    global _elevenlabs
    if _elevenlabs is None:
        _elevenlabs = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    return _elevenlabs

BUCKET = os.environ.get("SUPABASE_STORAGE_BUCKET", "royal-audio")

def synthesize_voice(state: RoyalStateOptional) -> dict:
    client = get_elevenlabs_client()
    # NOTE: Use "eleven_v3" for ElevenLabs v3 Expressive Mode (supports audio tags).
    # Use "eleven_multilingual_v2" if v3 is not yet available on your plan.
    # Check your ElevenLabs dashboard for available model IDs.
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
    supabase = get_supabase_client()
    supabase.storage.from_(BUCKET).upload(
        path=filename,
        file=audio_bytes,
        file_options={"content-type": "audio/mpeg", "upsert": "true"},
    )
    public_url = supabase.storage.from_(BUCKET).get_public_url(filename)
    return {"audio_url": public_url}
