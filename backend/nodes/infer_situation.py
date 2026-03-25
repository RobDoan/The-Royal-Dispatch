from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from backend.state import RoyalStateOptional

_llm = None

ALLOWED_FALLBACKS = ["kindness", "patience", "courage", "sharing", "honesty", "trying new things"]

def get_llm() -> ChatAnthropic:
    global _llm
    if _llm is None:
        _llm = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=20)
    return _llm

SYSTEM_PROMPT = """You are a children's life-lesson classifier.
Given a parent's note about their child's day, respond with a SHORT phrase (max 8 words) describing one teachable situation — something the child can learn to handle with grace.

If the note contains no clear teachable moment (or is "__fallback__"), respond with exactly one of these options:
kindness, patience, courage, sharing, honesty, trying new things

Respond with the situation phrase only. No punctuation, no explanation."""

def infer_situation(state: RoyalStateOptional) -> dict:
    brief = state["brief"]
    llm = get_llm()
    response = llm.invoke([
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=brief),
    ])
    situation = response.content.strip().lower().rstrip(".")
    # If LLM returns something outside our allowed list for edge cases, clamp to a fallback
    if situation not in ALLOWED_FALLBACKS and (
        brief == "__fallback__" or len(brief.split()) < 5
    ):
        situation = ALLOWED_FALLBACKS[0]  # "kindness" as safe default
    return {"situation": situation}
