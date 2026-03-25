from backend.state import RoyalStateOptional
from backend.db.client import get_supabase_client

def store_result(state: RoyalStateOptional) -> dict:
    client = get_supabase_client()
    client.table("stories").upsert({
        "date": state["date"],
        "princess": state["princess"],
        "story_type": state["story_type"],  # required field — always present
        "story_text": state["story_text"],
        "audio_url": state["audio_url"],
        "royal_challenge": state.get("royal_challenge"),  # total=False field — absent for daily
    }, on_conflict="date,princess,story_type").execute()
    return {"audio_url": state["audio_url"]}
