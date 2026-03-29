import logging
from backend.state import RoyalStateOptional
from backend.utils.mem0_client import get_memory, EMMA_USER_ID

logger = logging.getLogger(__name__)


def _as_list(result) -> list:
    """Normalise mem0 results — some versions return a list, others {'results': [...]}."""
    if isinstance(result, list):
        return result
    return result.get("results", [])


def fetch_memories(state: RoyalStateOptional) -> dict:
    brief = state.get("brief", "__fallback__")
    try:
        memory = get_memory()

        # Build compact Emma profile from 10 most recent memories
        all_memories = _as_list(memory.get_all(user_id=EMMA_USER_ID))
        profile_items = [m for m in all_memories[:10] if m.get("memory")]
        profile_lines = [f"- {m['memory']}" for m in profile_items]
        profile_ids = {m.get("id") for m in profile_items}

        # Contextually relevant memories for today's brief
        relevant_lines = []
        if brief and brief != "__fallback__":
            relevant = _as_list(
                memory.search(query=brief, user_id=EMMA_USER_ID, limit=5)
            )
            relevant_lines = [
                f"[Today: {m['memory']}]"
                for m in relevant
                if m.get("memory") and m.get("id") not in profile_ids
            ]

        all_lines = profile_lines + relevant_lines
        return {"memories": "\n".join(all_lines)}

    except Exception:
        logger.warning(
            "fetch_memories: mem0 unavailable, continuing without memories",
            exc_info=True,
        )
        return {"memories": ""}
