from backend.state import RoyalStateOptional
from backend.db.client import get_supabase_client

def fetch_brief(state: RoyalStateOptional) -> dict:
    client = get_supabase_client()
    today = state["date"]
    result = (
        client.table("briefs")
        .select("text")
        .eq("date", today)
        .execute()
    )
    if result.data:
        merged_brief = "\n\n".join(item["text"] for item in result.data if item.get("text"))
        if merged_brief:
            return {"brief": merged_brief}
    return {"brief": "__fallback__"}
