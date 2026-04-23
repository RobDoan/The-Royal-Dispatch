import logging

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from backend.state import RoyalStateOptional
from backend.utils.metrics import external_api_calls

logger = logging.getLogger(__name__)

_llm = None

def get_llm() -> ChatAnthropic:
    global _llm
    if _llm is None:
        _llm = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=800)
    return _llm

LANGUAGE_LABELS = {"en": "English", "vi": "Vietnamese (Tiếng Việt)"}

SYSTEM_TEMPLATE = """You are {name} from {origin}. You are sharing a Life Lesson story with {child_name}.

Your personality: {tone_style}

Use these ElevenLabs audio expression tags naturally: {audio_tags}

The lesson topic is: "{situation}"

Guidelines:
- Write 6–8 sentences. Share a personal anecdote OR a made-up story about a character in your kingdom who learned to handle "{situation}" with grace.
- Address {child_name} by name at least once.
- Write in {language_label}. Use simple, warm words a 4-year-old can follow.
- End with a spoken Royal Challenge — one concrete thing {child_name} can try today. Begin the challenge with "Your Royal Challenge:".
- End with your signature phrase: "{signature_phrase}"

Output format (exactly):
STORY:<the full story including the spoken Royal Challenge at the end>
CHALLENGE:<just the challenge sentence(s), no prefix>

No other text."""

def generate_life_lesson(state: RoyalStateOptional) -> dict:
    persona = state["persona"]
    tone = state["tone"]
    audio_tags = " ".join(persona["audio_tags"][tone])
    language_label = LANGUAGE_LABELS.get(state["language"], "English")
    child_name = state.get("child_name", "Emma")
    system = SYSTEM_TEMPLATE.format(
        name=persona["name"],
        origin=persona["origin"],
        tone_style=persona["tone_style"],
        audio_tags=audio_tags,
        situation=state["situation"],
        language_label=language_label,
        signature_phrase=persona["signature_phrase"],
        child_name=child_name,
    )
    llm = get_llm()
    try:
        response = llm.invoke([
            SystemMessage(content=system),
            HumanMessage(content=f"Parent's note: {state['brief']}"),
        ])
        external_api_calls.labels(provider="anthropic", outcome="ok").inc()
    except Exception:
        external_api_calls.labels(provider="anthropic", outcome="error").inc()
        raise
    raw = response.content.strip()

    # Parse STORY: and CHALLENGE: sections using a state-machine approach
    story_lines = []
    royal_challenge = ""
    in_story = False

    for line in raw.splitlines():
        if line.startswith("CHALLENGE:"):
            royal_challenge = line[len("CHALLENGE:"):].strip()
            in_story = False
        elif line.startswith("STORY:"):
            story_lines.append(line[len("STORY:"):].strip())
            in_story = True
        elif in_story:
            story_lines.append(line)

    story_text = " ".join(story_lines).strip()

    # Fallback: if parsing fails, use the whole response as story_text
    if not story_text:
        story_text = raw
    if not royal_challenge:
        logger.warning("generate_life_lesson: CHALLENGE: section missing from LLM output; royal_challenge set to empty string")
        royal_challenge = ""

    return {"story_text": story_text, "royal_challenge": royal_challenge}
