import json
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

_llm = None


def get_llm() -> ChatAnthropic:
    global _llm
    if _llm is None:
        _llm = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=100)
    return _llm


_DETECT_SYSTEM = (
    "You are a name detector. Given a parent's note and a list of child names, "
    "return a JSON array of names from the list that are mentioned in the note. "
    "Account for nicknames, typos, and alternative spellings. "
    "If no names match, return an empty array []. "
    "Respond with only the JSON array, no other text."
)


def detect_children_in_brief(brief_text: str, child_names: list[str]) -> list[str]:
    """Return the subset of child_names mentioned in brief_text, using an LLM."""
    if not child_names:
        return []
    llm = get_llm()
    prompt = f"Children names: {json.dumps(child_names)}\n\nParent's note: {brief_text}"
    response = llm.invoke([
        SystemMessage(content=_DETECT_SYSTEM),
        HumanMessage(content=prompt),
    ])
    try:
        matched = json.loads(response.content.strip())
        if isinstance(matched, list):
            return [n for n in matched if n in child_names]
        return []
    except (json.JSONDecodeError, TypeError):
        return []
