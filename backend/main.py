import os
import concurrent.futures
import secrets
import glob as glob_module
from datetime import date
from typing import Literal
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from backend.graph import royal_graph
from backend.db.client import get_supabase_client
from backend.utils.time_utils import get_logical_date_iso

app = FastAPI(title="Royal Dispatch API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class BriefRequest(BaseModel):
    text: str

class StoryRequest(BaseModel):
    princess: Literal["elsa", "belle", "cinderella", "ariel"]
    language: Literal["en", "vi"] = "en"
    story_type: Literal["daily", "life_lesson"] = "daily"
    date: str | None = None
    timezone: str = "America/Los_Angeles"

class StoryResponse(BaseModel):
    audio_url: str

class StoryDetailResponse(BaseModel):
    audio_url: str
    story_text: str
    royal_challenge: str | None

@app.post("/brief")
def post_brief(req: BriefRequest):
    client = get_supabase_client()
    # Simplified: rely on created_at timestamp automatically added by database
    client.table("briefs").insert({
        "text": req.text,
    }).execute()
    return {"status": "ok"}

@app.post("/story", response_model=StoryResponse)
def post_story(req: StoryRequest):
    story_date = req.date or get_logical_date_iso(req.timezone)
    db = get_supabase_client()
    cached = (
        db.table("stories")
        .select("audio_url")
        .eq("date", story_date)
        .eq("princess", req.princess)
        .eq("story_type", req.story_type)
        .execute()
    )
    if cached.data:
        return StoryResponse(audio_url=cached.data[0]["audio_url"])
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
    }
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(royal_graph.invoke, initial_state)
        try:
            result = future.result(timeout=60)
        except concurrent.futures.TimeoutError:
            raise HTTPException(status_code=504, detail="Story generation timed out")
    return StoryResponse(audio_url=result["audio_url"])

@app.get("/story/today")
def get_today_stories(timezone: str = "America/Los_Angeles"):
    today = get_logical_date_iso(timezone)
    client = get_supabase_client()
    result = (
        client.table("stories")
        .select("princess,audio_url")
        .eq("date", today)
        .eq("story_type", "daily")
        .execute()
    )
    cached = {row["princess"]: row["audio_url"] for row in (result.data or [])}
    return {"date": today, "cached": cached}

@app.get("/story/today/{princess}", response_model=StoryDetailResponse)
def get_today_story_for_princess(
    princess: str,
    type: str = Query(default="daily"),
    timezone: str = "America/Los_Angeles",
):
    today = get_logical_date_iso(timezone)
    client = get_supabase_client()
    result = (
        client.table("stories")
        .select("audio_url,story_text,royal_challenge")
        .eq("date", today)
        .eq("princess", princess)
        .eq("story_type", type)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Story not found for today")
    row = result.data[0]
    return StoryDetailResponse(
        audio_url=row["audio_url"],
        story_text=row["story_text"],
        royal_challenge=row.get("royal_challenge"),
    )


# ── Pydantic models ──────────────────────────────────────────────────────────

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

# ── Admin: users ─────────────────────────────────────────────────────────────

@app.get("/admin/users", response_model=list[UserResponse])
def admin_list_users():
    client = get_supabase_client()
    result = client.table("users").select("*").order("created_at").execute()
    return result.data or []

@app.post("/admin/users", response_model=UserResponse, status_code=201)
def admin_create_user(req: CreateUserRequest):
    token = "tk_" + secrets.token_hex(8)
    client = get_supabase_client()
    result = client.table("users").insert({
        "name": req.name,
        "telegram_chat_id": req.telegram_chat_id,
        "token": token,
    }).execute()
    return result.data[0]

@app.delete("/admin/users/{user_id}", status_code=204)
def admin_delete_user(user_id: str):
    client = get_supabase_client()
    client.table("users").delete().eq("id", user_id).execute()

# ── Admin: preferences ───────────────────────────────────────────────────────

@app.get("/admin/users/{user_id}/preferences", response_model=PreferencesResponse)
def admin_get_preferences(user_id: str):
    client = get_supabase_client()
    result = client.table("user_preferences").select("*").eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Preferences not found")
    return result.data[0]

@app.put("/admin/users/{user_id}/preferences", response_model=PreferencesResponse)
def admin_update_preferences(user_id: str, req: UpdatePreferencesRequest):
    client = get_supabase_client()
    result = client.table("user_preferences").upsert({
        "user_id": user_id,
        "config": req.config,
    }).execute()
    return result.data[0]

# ── Admin: personas ──────────────────────────────────────────────────────────

@app.get("/admin/personas", response_model=list[PersonaResponse])
def admin_list_personas():
    import yaml
    personas_dir = os.path.join(os.path.dirname(__file__), "personas")
    results = []
    for path in sorted(glob_module.glob(os.path.join(personas_dir, "*.yaml"))):
        persona_id = os.path.splitext(os.path.basename(path))[0]
        with open(path) as f:
            data = yaml.safe_load(f)
        results.append({"id": persona_id, "name": data.get("name", persona_id)})
    return results

# ── User resolution ───────────────────────────────────────────────────────────

@app.get("/user/me", response_model=UserMeResponse)
def get_user_by_token(token: str = Query(...)):
    client = get_supabase_client()
    result = client.table("users").select("id,name,token").eq("token", token).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    user = result.data[0]
    prefs = get_supabase_client().table("user_preferences").select("config").eq("user_id", user["id"]).execute()
    config = prefs.data[0]["config"] if prefs.data else {}
    return {"user_id": user["id"], "name": user["name"], "config": config}

@app.get("/user/by-chat-id", response_model=UserByChatIdResponse)
def get_user_by_chat_id(chat_id: int = Query(...)):
    client = get_supabase_client()
    result = client.table("users").select("id,name").eq("telegram_chat_id", chat_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    user = result.data[0]
    return {"user_id": user["id"], "name": user["name"]}
