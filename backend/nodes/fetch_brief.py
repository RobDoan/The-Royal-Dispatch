from backend.state import RoyalStateOptional
from backend.db.client import get_conn
from backend.utils.time_utils import get_window_for_date


def fetch_brief(state: RoyalStateOptional) -> dict:
    today = state["date"]
    timezone_str = state["timezone"]
    child_id = state.get("child_id")
    start, end = get_window_for_date(today, timezone_str)
    result: dict = {}
    with get_conn() as conn:
        with conn.cursor() as cur:
            if child_id:
                cur.execute("SELECT name FROM children WHERE id = %s", (child_id,))
                name_row = cur.fetchone()
                if name_row:
                    result["child_name"] = name_row[0]
            cur.execute(
                """SELECT text FROM briefs
                   WHERE created_at BETWEEN %s AND %s
                   AND child_id IS NOT DISTINCT FROM %s""",
                (start, end, child_id),
            )
            rows = cur.fetchall()
    if rows:
        merged = "\n\n".join(row[0] for row in rows if row[0])
        if merged:
            result["brief"] = merged
            return result
    result["brief"] = "__fallback__"
    return result
