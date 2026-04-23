"""Call feature endpoints: /call/start (webhook handler added in Task 6)."""
import logging
from datetime import datetime, timedelta, timezone as tz

import pytz
import yaml
from fastapi import APIRouter, Header, HTTPException
from pathlib import Path
from pydantic import BaseModel, Field

from backend.db.client import get_conn
from backend.nodes.fetch_memories import fetch_memories
from backend.services.elevenlabs_convai import ElevenLabsError, mint_signed_url
from backend.utils.auth_token import InvalidTokenError, decode

logger = logging.getLogger(__name__)
router = APIRouter()

PERSONAS_DIR = Path(__file__).parent.parent / "personas"
MAX_CALL_SECONDS = 300
DAILY_CAP = 3

# Sentinel phrase that every persona YAML uses as the memory-block placeholder.
# It appears in both EN and VI prompts; see backend/personas/*.yaml.
_MEMORY_PLACEHOLDER_EN = "(the backend will append a memory block here automatically)"
_MEMORY_PLACEHOLDER_VI = "(backend sẽ tự động thêm phần ghi nhớ ở đây)"


class CallStartRequest(BaseModel):
    child_id: str
    princess: str
    locale: str = Field(default="en", pattern="^(en|vi)$")


class CallStartResponse(BaseModel):
    conversation_id: str
    signed_url: str
    expires_at: str
    princess_display_name: str
    max_duration_seconds: int


def _load_persona(princess: str) -> dict:
    path = PERSONAS_DIR / f"{princess}.yaml"
    if not path.exists():
        raise HTTPException(status_code=404, detail="unknown_princess")
    return yaml.safe_load(path.read_text())


def _auth_chat_id(header_token: str | None) -> int:
    if not header_token:
        raise HTTPException(status_code=401, detail="missing_token")
    try:
        return decode(header_token)
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="invalid_token")


def _logical_day_start_utc(timezone_str: str) -> datetime:
    """Return the UTC datetime for the most recent 3 AM local in the child's timezone (logical-day boundary)."""
    user_tz = pytz.timezone(timezone_str)
    now_local = datetime.now(user_tz)
    # Compute the 3 AM start of today in local time
    today_3am = now_local.replace(hour=3, minute=0, second=0, microsecond=0)
    # If we're before 3 AM local, the logical day started at 3 AM yesterday
    if now_local < today_3am:
        today_3am = today_3am - timedelta(days=1)
    return today_3am.astimezone(pytz.UTC)


@router.post("/call/start", response_model=CallStartResponse)
def call_start(req: CallStartRequest, x_auth_token: str | None = Header(default=None)):
    chat_id = _auth_chat_id(x_auth_token)
    persona = _load_persona(req.princess)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # 1. Resolve child and verify it's linked to this parent's chat_id
            cur.execute(
                """
                SELECT c.name, c.preferences, c.timezone
                FROM children c
                JOIN user_children uc ON uc.child_id = c.id
                JOIN users u ON u.id = uc.user_id
                WHERE c.id = %s AND u.telegram_chat_id = %s
                """,
                (req.child_id, chat_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="child_not_found")
            child_name, preferences, child_tz = row
            favorites = (preferences or {}).get("favorite_princesses", [])

            if req.princess not in favorites:
                raise HTTPException(status_code=403, detail="princess_not_favorite")

            # 2. Daily cap
            cur.execute(
                "SELECT COUNT(*) FROM calls WHERE child_id = %s AND started_at >= %s",
                (req.child_id, _logical_day_start_utc(child_tz)),
            )
            (count_today,) = cur.fetchone()
            if count_today >= DAILY_CAP:
                raise HTTPException(status_code=409, detail="daily_cap_reached")

    # 3. Fetch child memories (graceful if mem0 down → empty string)
    mem_result = fetch_memories({"child_id": req.child_id, "brief": "__fallback__"})
    memories = mem_result.get("memories", "")

    # 4. Build override payload and mint signed URL
    system_prompt = persona["call_system_prompt"][req.locale]
    placeholder = _MEMORY_PLACEHOLDER_EN if req.locale == "en" else _MEMORY_PLACEHOLDER_VI
    memory_block = memories if memories else "(No notable memories yet.)"
    if placeholder in system_prompt:
        system_prompt = system_prompt.replace(placeholder, memory_block)
    else:
        # Fallback if a future persona forgets the placeholder
        system_prompt = f"{system_prompt}\n\n{memory_block}"
    first_message = persona["call_first_message"][req.locale].replace("{child_name}", child_name)

    overrides = {
        "agent": {
            "prompt": {"prompt": system_prompt},
            "first_message": first_message,
            "language": req.locale,
        },
        "tts": {"voice_id": persona["voice_id"]},
        "conversation": {"max_duration_seconds": MAX_CALL_SECONDS},
    }

    try:
        signed = mint_signed_url(overrides=overrides)
    except ElevenLabsError as exc:
        logger.warning("ElevenLabs mint failed: %s", exc)
        raise HTTPException(status_code=503, detail="upstream_unavailable")

    # 5. Insert the calls row in state='started'
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO calls (child_id, princess, locale, conversation_id, state)
                VALUES (%s, %s, %s, %s, 'started')
                """,
                (req.child_id, req.princess, req.locale, signed.conversation_id),
            )
        conn.commit()

    expires_at_iso = datetime.fromtimestamp(signed.expires_at_unix, tz=tz.utc).isoformat()

    return CallStartResponse(
        conversation_id=signed.conversation_id,
        signed_url=signed.signed_url,
        expires_at=expires_at_iso,
        princess_display_name=persona["name"],
        max_duration_seconds=MAX_CALL_SECONDS,
    )


import hashlib
import hmac
import json as json_lib
import os

from fastapi import Request
from backend.utils.mem0_client import get_memory


_EXTRACTION_SYSTEM_PROMPT = (
    "Extract only facts worth remembering long-term about this child: "
    "their preferences (favorite toys, colors, foods, characters), "
    "social patterns (friendships, sibling dynamics, social wins/struggles), "
    "habits (recurring behaviors they are working on), "
    "and milestones (significant achievements or life events). "
    "Ignore transient details that are not reusable in future conversations."
)


def extract_memories_from_transcript(child_id: str, transcript: list[dict]) -> None:
    """Store memorable facts the child said during the call. Fails silently if mem0 is down."""
    if not child_id or not transcript:
        return
    try:
        memory = get_memory()
        child_text = " ".join(t["text"] for t in transcript if t.get("role") == "user")
        if not child_text.strip():
            return
        memory.add(
            [
                {"role": "system", "content": _EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": child_text},
            ],
            user_id=child_id,
        )
    except Exception:
        logger.warning("extract_memories_from_transcript: mem0 unavailable, skipping", exc_info=True)


def _verify_webhook_signature(body: bytes, header_sig: str | None) -> bool:
    if not header_sig:
        return False
    secret = os.environ["ELEVENLABS_WEBHOOK_SECRET"].encode()
    expected = hmac.new(secret, body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header_sig)


@router.post("/webhooks/elevenlabs/conversation")
async def elevenlabs_webhook(
    request: Request,
    x_elevenlabs_signature: str | None = Header(default=None),
):
    body = await request.body()
    if not _verify_webhook_signature(body, x_elevenlabs_signature):
        raise HTTPException(status_code=401, detail="invalid_signature")

    payload = json_lib.loads(body)
    conversation_id = payload["conversation_id"]

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT child_id FROM calls WHERE conversation_id = %s",
                (conversation_id,),
            )
            row = cur.fetchone()
            if not row:
                logger.warning("Webhook for unknown conversation_id %s — ignoring", conversation_id)
                return {"status": "ignored"}
            (child_id,) = row

            cur.execute(
                """
                UPDATE calls
                SET state = 'completed',
                    ended_at = now(),
                    duration_seconds = %s,
                    transcript = %s,
                    ended_reason = %s
                WHERE conversation_id = %s
                """,
                (
                    payload["duration_seconds"],
                    json_lib.dumps(payload["transcript"]),
                    payload["ended_reason"],
                    conversation_id,
                ),
            )
        conn.commit()

    extract_memories_from_transcript(str(child_id), payload["transcript"])
    return {"status": "ok"}
