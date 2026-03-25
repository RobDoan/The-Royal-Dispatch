from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from backend.state import RoyalStateOptional

_llm = None

def get_llm() -> ChatAnthropic:
    global _llm
    if _llm is None:
        _llm = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=10)
    return _llm

CLASSIFY_SYSTEM = """You are a tone classifier. Given a parent's note about their child's day,
respond with exactly one word: either "praise" or "habit".
- "praise": the child did something good worth celebrating
- "habit": the child struggled with a habit that needs gentle modeling
Respond with only the single word."""

def classify_tone(state: RoyalStateOptional) -> dict:
    if state["brief"] == "__fallback__":
        return {"tone": "praise"}
    llm = get_llm()
    response = llm.invoke([
        SystemMessage(content=CLASSIFY_SYSTEM),
        HumanMessage(content=state["brief"]),
    ])
    tone = response.content.strip().lower()
    if tone not in ("praise", "habit"):
        tone = "praise"
    return {"tone": tone}
