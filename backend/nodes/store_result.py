from backend.state import RoyalState
from backend.db.client import get_supabase_client

def store_result(state: RoyalState) -> dict:
    client = get_supabase_client()
    client.table("stories").upsert({
        "date": state["date"],
        "princess": state["princess"],
        "story_text": state["story_text"],
        "audio_url": state["audio_url"],
    }, on_conflict="date,princess").execute()
    return {"audio_url": state["audio_url"]}
