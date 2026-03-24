from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from backend.state import RoyalState

_llm = None

def get_llm() -> ChatAnthropic:
    global _llm
    if _llm is None:
        _llm = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=600)
    return _llm

STORY_SYSTEM_TEMPLATE = """You are {name} from {origin}. You are writing a short, warm bedtime letter to Emma, a 4-year-old girl.

Your personality: {tone_style}

Use these ElevenLabs audio expression tags naturally in your letter: {audio_tags}

Guidelines:
- Write 4–6 sentences maximum. This is bedtime — keep it short and soothing.
- Address Emma by name at least once.
- Write in {language_label}. Use natural, simple words a 4-year-old can follow.
- End with your signature phrase: "{signature_phrase}"
- {tone_instruction}

Output only the letter text with audio tags. No headers, no explanations."""

TONE_INSTRUCTIONS = {
    "praise": "Celebrate what Emma did today directly and warmly. Make her feel seen and proud.",
    "habit": 'Tell a short story about a character from your world who learned the same habit. Use this metaphor as inspiration: "{metaphor}". Never lecture — just model through story.',
}

LANGUAGE_LABELS = {"en": "English", "vi": "Vietnamese (Tiếng Việt)"}

def generate_story(state: RoyalState) -> dict:
    if state["brief"] == "__fallback__":
        lang = state["language"]
        return {"story_text": state["persona"]["fallback_letter"][lang]}

    persona = state["persona"]
    tone = state["tone"]
    audio_tags = " ".join(persona["audio_tags"][tone])
    tone_instruction = TONE_INSTRUCTIONS[tone].format(
        metaphor=persona.get("metaphor", "")
    )
    system = STORY_SYSTEM_TEMPLATE.format(
        name=persona["name"],
        origin=persona["origin"],
        tone_style=persona["tone_style"],
        audio_tags=audio_tags,
        language_label=LANGUAGE_LABELS[state["language"]],
        signature_phrase=persona["signature_phrase"],
        tone_instruction=tone_instruction,
    )
    llm = get_llm()
    response = llm.invoke([
        SystemMessage(content=system),
        HumanMessage(content=f"Parent's note about Emma's day: {state['brief']}"),
    ])
    return {"story_text": response.content.strip()}
