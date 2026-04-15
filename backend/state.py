from typing import TypedDict

class RoyalState(TypedDict):
    princess: str      # "elsa" | "belle" | "cinderella" | "ariel"
    date: str          # ISO date string, e.g. "2026-03-23"
    brief: str         # parent's WhatsApp text; "__fallback__" if none
    tone: str          # "praise" | "habit"
    persona: dict      # loaded from YAML
    story_type: str    # "daily" | "life_lesson"
    situation: str     # teachable situation (life_lesson); "" for daily
    story_text: str    # generated letter with ElevenLabs audio tags
    audio_url: str     # S3 public URL
    language: str      # "en" | "vi"
    timezone: str      # user's IANA timezone, e.g. "America/Los_Angeles"

class RoyalStateOptional(RoyalState, total=False):
    royal_challenge: str | None  # only written by generate_life_lesson; absent for daily
    memories: str                # formatted memory context; empty string if none available
    child_id: str | None         # UUID of the child this story is for; None if unresolved
    child_name: str              # name of the child; defaults to "Emma"
