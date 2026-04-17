import json as json_lib
import logging
import uuid

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.db.client import get_conn
from backend.nodes.fetch_memories import fetch_memories
from backend.nodes.load_persona import load_persona
from backend.nodes.synthesize_voice import synthesize_voice_stream
from backend.utils.mem0_client import get_memory

logger = logging.getLogger(__name__)
router = APIRouter()
TIMER_SECONDS = 420  # 7 minutes


class CallStartResponse(BaseModel):
    persona: dict
    memories: str
    child_name: str
    session_id: str
    timer_seconds: int


@router.get("/call/start", response_model=CallStartResponse)
def call_start(child_id: str = Query(...), princess: str = Query(...)):
    try:
        result = load_persona({"princess": princess})
        persona = result["persona"]
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Unknown princess: {princess}")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT name FROM children WHERE id = %s", (child_id,))
            row = cur.fetchone()
    child_name = row[0] if row else "Friend"

    mem_result = fetch_memories({"child_id": child_id, "brief": "__fallback__"})
    memories = mem_result.get("memories", "")

    return CallStartResponse(
        persona={
            "name": persona["name"],
            "voice_id": persona["voice_id"],
            "tone_style": persona["tone_style"],
            "signature_phrase": persona["signature_phrase"],
            "origin": persona["origin"],
        },
        memories=memories,
        child_name=child_name,
        session_id=str(uuid.uuid4()),
        timer_seconds=TIMER_SECONDS,
    )


class TtsRequest(BaseModel):
    text: str
    voice_id: str


@router.post("/call/tts")
def call_tts(req: TtsRequest):
    chunks = synthesize_voice_stream(req.voice_id, req.text)
    return StreamingResponse(chunks, media_type="audio/mpeg")


class CallEndRequest(BaseModel):
    session_id: str
    child_id: str
    princess: str
    duration_seconds: int
    transcript: list[dict]


def extract_memories_from_transcript(child_id: str, transcript: list[dict]) -> None:
    if not child_id or not transcript:
        return
    try:
        memory = get_memory()
        child_text = " ".join(turn["text"] for turn in transcript if turn.get("role") == "child")
        if not child_text.strip():
            return
        extraction_prompt = (
            "Extract only facts worth remembering long-term about this child: "
            "their preferences (favorite toys, colors, foods, characters), "
            "social patterns (friendships, sibling dynamics, social wins/struggles), "
            "habits (recurring behaviors they are working on), "
            "and milestones (significant achievements or life events). "
            "Ignore transient details that are not reusable in future conversations."
        )
        memory.add(
            [{"role": "system", "content": extraction_prompt}, {"role": "user", "content": child_text}],
            user_id=child_id,
        )
    except Exception:
        logger.warning("extract_memories_from_transcript: mem0 unavailable, skipping", exc_info=True)


@router.post("/call/end")
def call_end(req: CallEndRequest):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO calls (id, child_id, princess, duration_seconds, turn_count, transcript)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (
                    req.session_id,
                    req.child_id,
                    req.princess,
                    req.duration_seconds,
                    len(req.transcript),
                    json_lib.dumps(req.transcript),
                ),
            )
    extract_memories_from_transcript(req.child_id, req.transcript)
    return {"status": "ok"}
