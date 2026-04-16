import os

from backend.state import RoyalStateOptional
from backend.db.client import get_conn
from backend.storage.client import get_storage


def store_result(state: RoyalStateOptional) -> dict:
    child_id = state.get("child_id")
    royal_challenge = state.get("royal_challenge")

    if child_id is not None:
        sql = """
            INSERT INTO stories (date, princess, story_type, language, story_text, audio_url, royal_challenge, child_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (date, princess, story_type, language, child_id) WHERE child_id IS NOT NULL
            DO UPDATE SET
                story_text = EXCLUDED.story_text,
                audio_url = EXCLUDED.audio_url,
                royal_challenge = EXCLUDED.royal_challenge
        """
        params = (
            state["date"], state["princess"], state["story_type"], state["language"],
            state["story_text"], state["audio_url"], royal_challenge, child_id,
        )
    else:
        sql = """
            INSERT INTO stories (date, princess, story_type, language, story_text, audio_url, royal_challenge)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (date, princess, story_type, language) WHERE child_id IS NULL
            DO UPDATE SET
                story_text = EXCLUDED.story_text,
                audio_url = EXCLUDED.audio_url,
                royal_challenge = EXCLUDED.royal_challenge
        """
        params = (
            state["date"], state["princess"], state["story_type"], state["language"],
            state["story_text"], state["audio_url"], royal_challenge,
        )

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)

    return {"audio_url": state["audio_url"]}


def store_result_from_bytes(state: RoyalStateOptional, audio_bytes: bytes) -> None:
    """Upload a fully-buffered MP3 to S3 and upsert the story row.

    Uses the same filename convention as the synthesize_voice node so a
    generation that fell back to the non-streaming path is interchangeable.
    """
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

    # Compose the same state used by the existing store_result node and reuse it.
    state_with_url = dict(state)
    state_with_url["audio_url"] = audio_url
    store_result(state_with_url)
