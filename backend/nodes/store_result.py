from backend.state import RoyalStateOptional
from backend.db.client import get_conn


def store_result(state: RoyalStateOptional) -> dict:
    user_id = state.get("user_id")
    royal_challenge = state.get("royal_challenge")

    if user_id is not None:
        sql = """
            INSERT INTO stories (date, princess, story_type, language, story_text, audio_url, royal_challenge, user_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (date, princess, story_type, language, user_id) WHERE user_id IS NOT NULL
            DO UPDATE SET
                story_text = EXCLUDED.story_text,
                audio_url = EXCLUDED.audio_url,
                royal_challenge = EXCLUDED.royal_challenge
        """
        params = (
            state["date"], state["princess"], state["story_type"], state["language"],
            state["story_text"], state["audio_url"], royal_challenge, user_id,
        )
    else:
        sql = """
            INSERT INTO stories (date, princess, story_type, language, story_text, audio_url, royal_challenge)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (date, princess, story_type, language) WHERE user_id IS NULL
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
