import concurrent.futures
import logging
from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.db.client import get_conn
from backend.graph import royal_graph
from backend.utils.child_detection import detect_children_in_brief
from backend.utils.time_utils import get_logical_date_iso

logger = logging.getLogger(__name__)

router = APIRouter()


class BriefRequest(BaseModel):
    text: str
    user_id: str | None = None


class StoryRequest(BaseModel):
    princess: Literal["elsa", "belle", "cinderella", "ariel"]
    language: Literal["en", "vi"] = "en"
    story_type: Literal["daily", "life_lesson"] = "daily"
    date: str | None = None
    timezone: str = "America/Los_Angeles"
    child_id: str | None = None


class StoryResponse(BaseModel):
    audio_url: str


class StoryDetailResponse(BaseModel):
    audio_url: str
    story_text: str
    royal_challenge: str | None


@router.post("/brief")
def post_brief(req: BriefRequest):
    today = date.today().isoformat()

    # Resolve which child(ren) this brief is about
    child_ids_to_store: list[str | None] = []

    if req.user_id:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT c.id, c.name FROM children c
                       JOIN user_children uc ON c.id = uc.child_id
                       WHERE uc.user_id = %s ORDER BY c.created_at""",
                    (req.user_id,),
                )
                children = cur.fetchall()  # list of (id, name)

        if len(children) == 0:
            child_ids_to_store = [None]
        elif len(children) == 1:
            child_ids_to_store = [str(children[0][0])]
        else:
            child_names = [row[1] for row in children]
            try:
                matched_names = detect_children_in_brief(req.text, child_names)
            except Exception:
                logger.warning("post_brief: child detection failed, storing with child_id=None", exc_info=True)
                matched_names = []
            name_to_id = {row[1]: str(row[0]) for row in children}
            child_ids_to_store = [name_to_id[n] for n in matched_names if n in name_to_id]
            if not child_ids_to_store:
                child_ids_to_store = [None]
    else:
        child_ids_to_store = [None]

    with get_conn() as conn:
        with conn.cursor() as cur:
            for child_id in child_ids_to_store:
                cur.execute(
                    "INSERT INTO briefs (date, text, user_id, child_id) VALUES (%s, %s, %s, %s)",
                    (today, req.text, req.user_id, child_id),
                )
    return {"status": "ok"}


@router.post("/story", response_model=StoryResponse)
def post_story(req: StoryRequest):
    story_date = req.date or get_logical_date_iso(req.timezone)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT audio_url FROM stories
                   WHERE date = %s AND princess = %s AND story_type = %s
                     AND language = %s
                     AND child_id IS NOT DISTINCT FROM %s""",
                (story_date, req.princess, req.story_type, req.language, req.child_id),
            )
            row = cur.fetchone()
    if row:
        return StoryResponse(audio_url=row[0])
    initial_state = {
        "princess": req.princess,
        "date": story_date,
        "brief": "",
        "tone": "",
        "persona": {},
        "story_type": req.story_type,
        "situation": "",
        "story_text": "",
        "audio_url": "",
        "language": req.language,
        "timezone": req.timezone,
        "child_id": req.child_id,
    }
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(royal_graph.invoke, initial_state)
        try:
            result = future.result(timeout=60)
        except concurrent.futures.TimeoutError:
            raise HTTPException(status_code=504, detail="Story generation timed out")
    return StoryResponse(audio_url=result["audio_url"])


@router.get("/story/today")
def get_today_stories(timezone: str = "America/Los_Angeles", language: str = "en"):
    today = get_logical_date_iso(timezone)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT princess, audio_url FROM stories
                   WHERE date = %s AND story_type = 'daily' AND language = %s""",
                (today, language),
            )
            rows = cur.fetchall()
    cached = {row[0]: row[1] for row in rows}
    return {"date": today, "cached": cached}


@router.get("/story/today/{princess}", response_model=StoryDetailResponse)
def get_today_story_for_princess(
    princess: str,
    type: str = Query(default="daily"),
    timezone: str = "America/Los_Angeles",
    language: str = "en",
    child_id: str | None = None,
):
    today = get_logical_date_iso(timezone)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT audio_url, story_text, royal_challenge FROM stories
                   WHERE date = %s AND princess = %s AND story_type = %s AND language = %s
                     AND child_id IS NOT DISTINCT FROM %s""",
                (today, princess, type, language, child_id),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Story not found for today")
    return StoryDetailResponse(audio_url=row[0], story_text=row[1], royal_challenge=row[2])
