import logging
from backend.state import RoyalStateOptional
from backend.utils.mem0_client import get_memory

logger = logging.getLogger(__name__)

_EXTRACTION_SYSTEM_PROMPT = (
    "Extract only facts worth remembering long-term about this child: "
    "their preferences (favorite toys, colors, foods, characters), "
    "social patterns (friendships, sibling dynamics, social wins/struggles), "
    "habits (recurring behaviors they are working on, e.g. brushing teeth, sharing), "
    "and milestones (significant achievements or life events). "
    "Ignore transient details that are not reusable in future stories."
)


def extract_memories(state: RoyalStateOptional) -> dict:
    brief = state.get("brief", "__fallback__")
    child_id = state.get("child_id")
    if brief == "__fallback__" or not child_id:
        return {}
    try:
        memory = get_memory()
        memory.add(
            [
                {"role": "system", "content": _EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": brief},
            ],
            user_id=child_id,
        )
    except Exception:
        logger.warning(
            "extract_memories: mem0 unavailable, skipping memory extraction",
            exc_info=True,
        )
    return {}
