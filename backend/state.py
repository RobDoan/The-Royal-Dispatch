from typing import TypedDict

class RoyalState(TypedDict):
    princess: str      # "elsa" | "belle" | "cinderella" | "ariel"
    date: str          # ISO date string, e.g. "2026-03-23"
    brief: str         # parent's WhatsApp text; "__fallback__" if none
    tone: str          # "praise" | "habit"
    persona: dict      # loaded from YAML
    story_text: str    # generated letter with ElevenLabs audio tags
    audio_url: str     # Supabase Storage public URL
    language: str      # "en" | "vi"
