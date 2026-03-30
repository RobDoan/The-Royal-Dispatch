from backend.state import RoyalStateOptional
from backend.db.client import get_conn
from backend.utils.time_utils import get_window_for_date


def fetch_brief(state: RoyalStateOptional) -> dict:
    today = state["date"]
    timezone_str = state["timezone"]
    start, end = get_window_for_date(today, timezone_str)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT text FROM briefs WHERE created_at BETWEEN %s AND %s",
                (start, end),
            )
            rows = cur.fetchall()
    if rows:
        merged = "\n\n".join(row[0] for row in rows if row[0])
        if merged:
            return {"brief": merged}
    return {"brief": "__fallback__"}
