from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from backend.state import RoyalStateOptional

_llm = None

def get_llm() -> ChatAnthropic:
    global _llm
    if _llm is None:
        _llm = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=800)
    return _llm

LANGUAGE_LABELS = {"en": "English", "vi": "Vietnamese (Tiếng Việt)"}

SYSTEM_TEMPLATE = """You are {name} from {origin}. You are sharing a Life Lesson story with Emma, a 4-year-old girl.

Your personality: {tone_style}

Use these ElevenLabs audio expression tags naturally: {audio_tags}

The lesson topic is: "{situation}"

Guidelines:
- Write 6–8 sentences. Share a personal anecdote OR a made-up story about a character in your kingdom who learned to handle "{situation}" with grace.
- Address Emma by name at least once.
- Write in {language_label}. Use simple, warm words a 4-year-old can follow.
- End with a spoken Royal Challenge — one concrete thing Emma can try today. Begin the challenge with "Your Royal Challenge:".
- End with your signature phrase: "{signature_phrase}"

Output format (exactly):
STORY:<the full story including the spoken Royal Challenge at the end>
CHALLENGE:<just the challenge sentence(s), no prefix>

No other text."""

def generate_life_lesson(state: RoyalStateOptional) -> dict:
    persona = state["persona"]
    tone = state["tone"]
    audio_tags = " ".join(persona["audio_tags"][tone])
    system = SYSTEM_TEMPLATE.format(
        name=persona["name"],
        origin=persona["origin"],
        tone_style=persona["tone_style"],
        audio_tags=audio_tags,
        situation=state["situation"],
        language_label=LANGUAGE_LABELS[state["language"]],
        signature_phrase=persona["signature_phrase"],
    )
    llm = get_llm()
    response = llm.invoke([
        SystemMessage(content=system),
        HumanMessage(content=f"Parent's note: {state['brief']}"),
    ])
    raw = response.content.strip()

    # Parse STORY: and CHALLENGE: sections
    story_text = ""
    royal_challenge = ""
    for line in raw.splitlines():
        if line.startswith("STORY:"):
            story_text = line[len("STORY:"):].strip()
        elif line.startswith("CHALLENGE:"):
            royal_challenge = line[len("CHALLENGE:"):].strip()

    # Fallback: if parsing fails, use the whole response as story_text
    if not story_text:
        story_text = raw
    if not royal_challenge:
        royal_challenge = story_text

    return {"story_text": story_text, "royal_challenge": royal_challenge}
