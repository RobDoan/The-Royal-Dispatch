import os
import concurrent.futures
from datetime import date
from typing import Literal
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from backend.graph import royal_graph
from backend.db.client import get_supabase_client

app = FastAPI(title="Royal Dispatch API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)

class BriefRequest(BaseModel):
    text: str

class StoryRequest(BaseModel):
    princess: Literal["elsa", "belle", "cinderella", "ariel"]
    language: Literal["en", "vi"] = "en"
    date: str | None = None  # defaults to today

class StoryResponse(BaseModel):
    audio_url: str

@app.post("/brief")
def post_brief(req: BriefRequest):
    client = get_supabase_client()
    client.table("briefs").insert({
        "date": date.today().isoformat(),
        "text": req.text,
    }).execute()
    return {"status": "ok"}

@app.post("/story", response_model=StoryResponse)
def post_story(req: StoryRequest):
    story_date = req.date or date.today().isoformat()
    db = get_supabase_client()
    cached = db.table("stories").select("audio_url").eq("date", story_date).eq("princess", req.princess).execute()
    if cached.data:
        return StoryResponse(audio_url=cached.data[0]["audio_url"])
    initial_state = {
        "princess": req.princess,
        "date": story_date,
        "brief": "",
        "tone": "",
        "persona": {},
        "story_text": "",
        "audio_url": "",
        "language": req.language,
    }
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(royal_graph.invoke, initial_state)
        try:
            result = future.result(timeout=60)
        except concurrent.futures.TimeoutError:
            raise HTTPException(status_code=504, detail="Story generation timed out")
    return StoryResponse(audio_url=result["audio_url"])

@app.get("/story/today")
def get_today_stories():
    today = date.today().isoformat()
    client = get_supabase_client()
    result = client.table("stories").select("princess,audio_url").eq("date", today).execute()
    cached = {row["princess"]: row["audio_url"] for row in (result.data or [])}
    return {"date": today, "cached": cached}
