from backend.state import RoyalStateOptional
from backend.db.client import get_supabase_client
from backend.utils.time_utils import get_window_for_date

def fetch_brief(state: RoyalStateOptional) -> dict:
    client = get_supabase_client()
    today = state["date"]
    timezone_str = state["timezone"]
    start, end = get_window_for_date(today, timezone_str)
    result = (
        client.table("briefs")
        .select("text")
        .gte("created_at", start)
        .lte("created_at", end)
        .execute()
    )
    if result.data:
        merged_brief = "\n\n".join(item["text"] for item in result.data if item.get("text"))
        if merged_brief:
            return {"brief": merged_brief}
    return {"brief": "__fallback__"}
