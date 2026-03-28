import os
import concurrent.futures
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
