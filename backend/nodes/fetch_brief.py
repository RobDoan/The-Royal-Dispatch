from backend.state import RoyalState
from backend.db.client import get_supabase_client

def fetch_brief(state: RoyalState) -> dict:
    client = get_supabase_client()
    today = state["date"]
    result = (
        client.table("briefs")
        .select("text")
        .eq("date", today)
        .maybe_single()
        .execute()
    )
    if result.data:
        return {"brief": result.data["text"]}
    return {"brief": "__fallback__"}
