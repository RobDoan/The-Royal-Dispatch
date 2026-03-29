import logging
from backend.state import RoyalStateOptional
from backend.utils.mem0_client import get_memory

logger = logging.getLogger(__name__)

_EXTRACTION_SYSTEM_PROMPT = (
    "Extract only facts worth remembering long-term about Emma: "
    "her preferences (favorite toys, colors, foods, characters), "
    "social patterns (friendships, sibling dynamics, social wins/struggles), "
    "habits (recurring behaviors she is working on, e.g. brushing teeth, sharing), "
    "and milestones (significant achievements or life events). "
    "Ignore transient details that are not reusable in future stories."
)


def extract_memories(state: RoyalStateOptional) -> dict:
    brief = state.get("brief", "__fallback__")
    if brief == "__fallback__":
        return {}
    try:
        memory = get_memory()
        memory.add(
            [
                {"role": "system", "content": _EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": brief},
            ],
            user_id="emma",
        )
    except Exception:
        logger.warning(
            "extract_memories: mem0 unavailable, skipping memory extraction",
            exc_info=True,
        )
    return {}
