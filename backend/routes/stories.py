import asyncio
import json
import logging
import os
import time
from datetime import date
from typing import Literal
from urllib.parse import urlencode
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel

from backend.db.client import get_conn
from backend.graph import pre_tts_graph
from backend.nodes.store_result import store_result_from_bytes
from backend.nodes.synthesize_voice import synthesize_voice_stream
from backend.utils.child_detection import detect_children_in_brief
from backend.utils.time_utils import get_logical_date_iso

logger = logging.getLogger(__name__)

# Track detached finalize tasks so the event loop doesn't GC them mid-flight.
# asyncio only holds weak references to tasks started via create_task; without
# a strong reference, a long-running task can silently disappear.
_pending_finalize_tasks: set[asyncio.Task] = set()

# In-memory cache for pre-TTS pipeline results, keyed by generation_id.
# The SSE /story/generate endpoint stores them here so /story/stream can
# pick them up without re-running the LLM.
_generation_cache: dict[str, tuple[dict, float]] = {}
_GENERATION_CACHE_TTL = 300  # seconds


def _cache_generation(generation_id: str, pre_state: dict) -> None:
    now = time.time()
    expired = [k for k, (_, ts) in _generation_cache.items() if now - ts > _GENERATION_CACHE_TTL]
    for k in expired:
        del _generation_cache[k]
    _generation_cache[generation_id] = (pre_state, now)


def _pop_generation(generation_id: str) -> dict | None:
    entry = _generation_cache.pop(generation_id, None)
    if not entry:
        return None
    pre_state, ts = entry
    if time.time() - ts > _GENERATION_CACHE_TTL:
        return None
    return pre_state

router = APIRouter()


class BriefRequest(BaseModel):
    text: str
    user_id: str


class StoryRequest(BaseModel):
    princess: Literal["elsa", "belle", "cinderella", "ariel", "rapunzel", "moana", "raya", "mirabel", "chase", "marshall", "skye", "rubble"]
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
    cached = _lookup_cached_story(
        story_date, req.princess, req.story_type, req.language, req.child_id
    )
    if cached:
        return StoryResponse(audio_url=cached)

    # Cache miss: return a streaming URL. The browser hits it, and THAT
    # request runs the pipeline + streams ElevenLabs bytes.
    params = {
        "princess": req.princess,
        "date": story_date,
        "language": req.language,
        "story_type": req.story_type,
        "timezone": req.timezone,
    }
    if req.child_id:
        params["child_id"] = req.child_id
    base = os.environ["BACKEND_PUBLIC_URL"].rstrip("/")
    streaming_url = f"{base}/story/stream?{urlencode(params)}"
    return StoryResponse(audio_url=streaming_url)


def _lookup_cached_story(
    story_date: str, princess: str, story_type: str, language: str, child_id: str | None
) -> str | None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT audio_url FROM stories
                   WHERE date = %s AND princess = %s AND story_type = %s
                     AND language = %s
                     AND child_id IS NOT DISTINCT FROM %s""",
                (story_date, princess, story_type, language, child_id),
            )
            row = cur.fetchone()
    return row[0] if row else None


async def _tee_and_save(pre_state: dict):
    """Stream ElevenLabs chunks to the client while buffering for S3 upload.

    On normal completion: schedules finalize() to upload MP3 + insert row.
    On client disconnect: drains remaining ElevenLabs chunks then schedules finalize.
    On ElevenLabs error mid-stream: returns without persisting (next tap regenerates).
    """
    buffer = bytearray()
    chunks = synthesize_voice_stream(
        voice_id=pre_state["persona"]["voice_id"],
        text=pre_state["story_text"],
    )
    client_disconnected = False
    try:
        for chunk in chunks:
            buffer.extend(chunk)
            try:
                yield chunk
            except (GeneratorExit, asyncio.CancelledError):
                client_disconnected = True
                break
    except Exception:
        logger.exception("ElevenLabs streaming failed mid-generation")
        return

    if client_disconnected:
        try:
            for chunk in chunks:
                buffer.extend(chunk)
        except Exception:
            logger.exception("ElevenLabs drain after disconnect failed")
            return

    # Detached from the request task: this task is owned by the event loop,
    # so it survives the request's cancellation on client disconnect.
    task = asyncio.create_task(_finalize(pre_state, bytes(buffer)))
    _pending_finalize_tasks.add(task)
    task.add_done_callback(_pending_finalize_tasks.discard)


async def _finalize(pre_state: dict, audio_bytes: bytes) -> None:
    try:
        await asyncio.to_thread(store_result_from_bytes, pre_state, audio_bytes)
    except Exception:
        logger.exception("finalize failed to persist audio/row")


@router.get("/story/generate")
async def generate_story_sse(
    princess: Literal["elsa", "belle", "cinderella", "ariel", "rapunzel", "moana", "raya", "mirabel", "chase", "marshall", "skye", "rubble"],
    language: Literal["en", "vi"] = "en",
    story_type: Literal["daily", "life_lesson"] = "daily",
    timezone: str = "America/Los_Angeles",
    child_id: str | None = None,
):
    """SSE endpoint: streams generation progress so the frontend can show
    story text immediately when the LLM finishes (before TTS)."""
    story_date = get_logical_date_iso(timezone)

    # ── cached story ──────────────────────────────────────────────
    cached = _lookup_cached_story(story_date, princess, story_type, language, child_id)
    if cached:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT story_text, royal_challenge FROM stories
                       WHERE date = %s AND princess = %s AND story_type = %s
                         AND language = %s AND child_id IS NOT DISTINCT FROM %s""",
                    (story_date, princess, story_type, language, child_id),
                )
                row = cur.fetchone()
        story_text = row[0] if row else ""
        royal_challenge = row[1] if row else None

        async def cached_events():
            yield f"event: cached\ndata: {json.dumps({'story_text': story_text, 'royal_challenge': royal_challenge, 'audio_url': cached})}\n\n"

        return StreamingResponse(
            cached_events(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
        )

    # ── generate new story ────────────────────────────────────────
    generation_id = str(uuid4())

    async def events():
        yield "event: status\ndata: generating\n\n"

        initial_state = {
            "princess": princess,
            "date": story_date,
            "brief": "",
            "tone": "",
            "persona": {},
            "story_type": story_type,
            "situation": "",
            "story_text": "",
            "audio_url": "",
            "language": language,
            "timezone": timezone,
            "child_id": child_id,
            "child_name": "Emma",
        }

        try:
            pre_state = await asyncio.to_thread(pre_tts_graph.invoke, initial_state)
        except Exception:
            logger.exception("Story generation failed")
            yield "event: error\ndata: generation_failed\n\n"
            return

        _cache_generation(generation_id, pre_state)

        params_dict: dict[str, str] = {
            "princess": princess,
            "date": story_date,
            "language": language,
            "story_type": story_type,
            "timezone": timezone,
            "generation_id": generation_id,
        }
        if child_id:
            params_dict["child_id"] = child_id
        base = os.environ["BACKEND_PUBLIC_URL"].rstrip("/")
        audio_url = f"{base}/story/stream?{urlencode(params_dict)}"

        yield f"event: ready\ndata: {json.dumps({'story_text': pre_state.get('story_text', ''), 'royal_challenge': pre_state.get('royal_challenge'), 'audio_url': audio_url})}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@router.get("/story/stream")
async def get_story_stream(
    princess: Literal["elsa", "belle", "cinderella", "ariel", "rapunzel", "moana", "raya", "mirabel", "chase", "marshall", "skye", "rubble"],
    date: str,
    language: Literal["en", "vi"],
    story_type: Literal["daily", "life_lesson"],
    timezone: str,
    child_id: str | None = None,
    generation_id: str | None = None,
):
    # Re-check the cache: if it filled between POST and GET, redirect to S3.
    cached = _lookup_cached_story(date, princess, story_type, language, child_id)
    if cached:
        return RedirectResponse(cached, status_code=302)

    # If the SSE /story/generate endpoint already ran the LLM, reuse its result.
    pre_state = _pop_generation(generation_id) if generation_id else None

    if not pre_state:
        initial_state = {
            "princess": princess,
            "date": date,
            "brief": "",
            "tone": "",
            "persona": {},
            "story_type": story_type,
            "situation": "",
            "story_text": "",
            "audio_url": "",
            "language": language,
            "timezone": timezone,
            "child_id": child_id,
            "child_name": "Emma",
        }
        pre_state = await asyncio.to_thread(pre_tts_graph.invoke, initial_state)

    return StreamingResponse(
        _tee_and_save(pre_state),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store"},
    )


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
