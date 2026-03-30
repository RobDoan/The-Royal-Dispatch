import os
import glob
import yaml
import json
import logging
import concurrent.futures
import secrets
from datetime import date
from typing import Literal
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from backend.graph import royal_graph
from backend.db.client import get_conn
from backend.utils.time_utils import get_logical_date_iso
from backend.utils.child_detection import detect_children_in_brief

logger = logging.getLogger(__name__)

app = FastAPI(title="Royal Dispatch API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class BriefRequest(BaseModel):
    text: str
    user_id: str | None = None


class StoryRequest(BaseModel):
    princess: Literal["elsa", "belle", "cinderella", "ariel"]
    language: Literal["en", "vi"] = "en"
    story_type: Literal["daily", "life_lesson"] = "daily"
    date: str | None = None
    timezone: str = "America/Los_Angeles"
    user_id: str | None = None
    child_id: str | None = None


class StoryResponse(BaseModel):
    audio_url: str


class StoryDetailResponse(BaseModel):
    audio_url: str
    story_text: str
    royal_challenge: str | None


@app.post("/brief")
def post_brief(req: BriefRequest):
    today = date.today().isoformat()

    # Resolve which child(ren) this brief is about
    child_ids_to_store: list[str | None] = []

    if req.user_id:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, name FROM children WHERE parent_id = %s ORDER BY created_at",
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


@app.post("/story", response_model=StoryResponse)
def post_story(req: StoryRequest):
    story_date = req.date or get_logical_date_iso(req.timezone)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT audio_url FROM stories
                   WHERE date = %s AND princess = %s AND story_type = %s
                     AND language = %s AND user_id IS NOT DISTINCT FROM %s
                     AND child_id IS NOT DISTINCT FROM %s""",
                (story_date, req.princess, req.story_type, req.language, req.user_id, req.child_id),
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
        "user_id": req.user_id,
        "child_id": req.child_id,
    }
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(royal_graph.invoke, initial_state)
        try:
            result = future.result(timeout=60)
        except concurrent.futures.TimeoutError:
            raise HTTPException(status_code=504, detail="Story generation timed out")
    return StoryResponse(audio_url=result["audio_url"])


@app.get("/story/today")
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


@app.get("/story/today/{princess}", response_model=StoryDetailResponse)
def get_today_story_for_princess(
    princess: str,
    type: str = Query(default="daily"),
    timezone: str = "America/Los_Angeles",
    language: str = "en",
    user_id: str | None = None,
    child_id: str | None = None,
):
    today = get_logical_date_iso(timezone)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT audio_url, story_text, royal_challenge FROM stories
                   WHERE date = %s AND princess = %s AND story_type = %s AND language = %s
                     AND user_id IS NOT DISTINCT FROM %s
                     AND child_id IS NOT DISTINCT FROM %s""",
                (today, princess, type, language, user_id, child_id),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Story not found for today")
    return StoryDetailResponse(audio_url=row[0], story_text=row[1], royal_challenge=row[2])


# ── Pydantic models ───────────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    name: str
    telegram_chat_id: int


class UserResponse(BaseModel):
    id: str
    name: str
    telegram_chat_id: int
    token: str
    created_at: str


class PreferencesResponse(BaseModel):
    user_id: str
    config: dict


class UpdatePreferencesRequest(BaseModel):
    config: dict


class PersonaResponse(BaseModel):
    id: str
    name: str


class UserMeResponse(BaseModel):
    user_id: str
    name: str
    config: dict


class UserByChatIdResponse(BaseModel):
    user_id: str
    name: str


class CreateChildRequest(BaseModel):
    name: str
    timezone: str = "America/Los_Angeles"
    preferences: dict = {}


class ChildResponse(BaseModel):
    id: str
    parent_id: str
    name: str
    timezone: str
    preferences: dict
    created_at: str


# ── Admin: users ──────────────────────────────────────────────────────────────

@app.get("/admin/users", response_model=list[UserResponse])
def admin_list_users():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, telegram_chat_id, token, created_at FROM users ORDER BY created_at")
            rows = cur.fetchall()
    return [
        {"id": str(r[0]), "name": r[1], "telegram_chat_id": r[2], "token": r[3], "created_at": r[4].isoformat()}
        for r in rows
    ]


@app.post("/admin/users", response_model=UserResponse, status_code=201)
def admin_create_user(req: CreateUserRequest):
    token = "tk_" + secrets.token_hex(8)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO users (name, telegram_chat_id, token)
                   VALUES (%s, %s, %s)
                   RETURNING id, name, telegram_chat_id, token, created_at""",
                (req.name, req.telegram_chat_id, token),
            )
            row = cur.fetchone()
    return {"id": str(row[0]), "name": row[1], "telegram_chat_id": row[2], "token": row[3], "created_at": row[4].isoformat()}


@app.delete("/admin/users/{user_id}", status_code=204)
def admin_delete_user(user_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM users WHERE id = %s RETURNING id", (user_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")


# ── Admin: children ───────────────────────────────────────────────────────────

@app.get("/admin/users/{user_id}/children", response_model=list[ChildResponse])
def admin_list_children(user_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, parent_id, name, timezone, preferences, created_at FROM children WHERE parent_id = %s ORDER BY created_at",
                (user_id,),
            )
            rows = cur.fetchall()
    return [
        {
            "id": str(r[0]), "parent_id": str(r[1]), "name": r[2],
            "timezone": r[3], "preferences": r[4], "created_at": r[5].isoformat(),
        }
        for r in rows
    ]


@app.post("/admin/users/{user_id}/children", response_model=ChildResponse, status_code=201)
def admin_create_child(user_id: str, req: CreateChildRequest):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="User not found")
            cur.execute(
                """INSERT INTO children (parent_id, name, timezone, preferences)
                   VALUES (%s, %s, %s, %s)
                   RETURNING id, parent_id, name, timezone, preferences, created_at""",
                (user_id, req.name, req.timezone, json.dumps(req.preferences)),
            )
            row = cur.fetchone()
    return {
        "id": str(row[0]), "parent_id": str(row[1]), "name": row[2],
        "timezone": row[3], "preferences": row[4], "created_at": row[5].isoformat(),
    }


@app.delete("/admin/children/{child_id}", status_code=204)
def admin_delete_child(child_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM children WHERE id = %s RETURNING id", (child_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Child not found")


# ── Admin: preferences ────────────────────────────────────────────────────────

@app.get("/admin/users/{user_id}/preferences", response_model=PreferencesResponse)
def admin_get_preferences(user_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id, config FROM user_preferences WHERE user_id = %s", (user_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Preferences not found")
    return {"user_id": str(row[0]), "config": row[1]}


@app.put("/admin/users/{user_id}/preferences", response_model=PreferencesResponse)
def admin_update_preferences(user_id: str, req: UpdatePreferencesRequest):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO user_preferences (user_id, config) VALUES (%s, %s)
                   ON CONFLICT (user_id) DO UPDATE SET config = EXCLUDED.config
                   RETURNING user_id, config""",
                (user_id, json.dumps(req.config)),
            )
            row = cur.fetchone()
    return {"user_id": str(row[0]), "config": row[1]}


# ── Admin: personas ───────────────────────────────────────────────────────────

@app.get("/admin/personas", response_model=list[PersonaResponse])
def admin_list_personas():
    personas_dir = os.path.join(os.path.dirname(__file__), "personas")
    results = []
    for path in sorted(glob.glob(os.path.join(personas_dir, "*.yaml"))):
        persona_id = os.path.splitext(os.path.basename(path))[0]
        with open(path) as f:
            data = yaml.safe_load(f)
        results.append({"id": persona_id, "name": data.get("name", persona_id)})
    return results


# ── User resolution ───────────────────────────────────────────────────────────

@app.get("/user/me", response_model=UserMeResponse)
def get_user_by_token(token: str = Query(...)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM users WHERE token = %s", (token,))
            user_row = cur.fetchone()
            if not user_row:
                raise HTTPException(status_code=404, detail="User not found")
            cur.execute("SELECT config FROM user_preferences WHERE user_id = %s", (str(user_row[0]),))
            pref_row = cur.fetchone()
    config = pref_row[0] if pref_row else {}
    return {"user_id": str(user_row[0]), "name": user_row[1], "config": config}


@app.get("/user/by-chat-id", response_model=UserByChatIdResponse)
def get_user_by_chat_id(chat_id: int = Query(...)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM users WHERE telegram_chat_id = %s", (chat_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user_id": str(row[0]), "name": row[1]}
