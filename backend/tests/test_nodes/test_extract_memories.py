from unittest.mock import MagicMock
from backend.nodes.extract_memories import extract_memories


def test_extract_memories_skips_fallback(mocker):
    """When brief is __fallback__, mem0 must not be called."""
    state = {"brief": "__fallback__", "child_id": "abc-123"}
    mock_get_memory = mocker.patch("backend.nodes.extract_memories.get_memory")
    result = extract_memories(state)
    mock_get_memory.assert_not_called()
    assert result == {}


def test_extract_memories_skips_when_no_child_id(mocker):
    """When child_id is absent, mem0 must not be called."""
    state = {"brief": "Sophie shared her toys today."}
    mock_get_memory = mocker.patch("backend.nodes.extract_memories.get_memory")
    result = extract_memories(state)
    mock_get_memory.assert_not_called()
    assert result == {}


def test_extract_memories_skips_when_child_id_is_none(mocker):
    """When child_id is explicitly None, mem0 must not be called."""
    state = {"brief": "Sophie shared her toys today.", "child_id": None}
    mock_get_memory = mocker.patch("backend.nodes.extract_memories.get_memory")
    result = extract_memories(state)
    mock_get_memory.assert_not_called()
    assert result == {}


def test_extract_memories_calls_memory_add_with_child_id(mocker):
    """When child_id is present, memory.add() is called with user_id=child_id."""
    child_id = "abc-123"
    state = {"brief": "Emma shared her toys and loves her blue teddy bear.", "child_id": child_id}
    mock_memory = MagicMock()
    mocker.patch("backend.nodes.extract_memories.get_memory", return_value=mock_memory)

    result = extract_memories(state)

    mock_memory.add.assert_called_once()
    call_args = mock_memory.add.call_args
    messages = call_args[0][0]
    assert any(
        msg["role"] == "user" and msg["content"] == state["brief"] for msg in messages
    )
    assert call_args[1]["user_id"] == child_id
    assert result == {}


def test_extract_memories_system_prompt_covers_all_categories(mocker):
    """System message must mention preferences, habits, milestones, social patterns."""
    state = {"brief": "Emma had a great day.", "child_id": "abc-123"}
    mock_memory = MagicMock()
    mocker.patch("backend.nodes.extract_memories.get_memory", return_value=mock_memory)

    extract_memories(state)

    messages = mock_memory.add.call_args[0][0]
    system_content = next(m["content"] for m in messages if m["role"] == "system")
    for keyword in ("preferences", "habits", "milestones", "social"):
        assert keyword.lower() in system_content.lower(), f"System prompt missing: {keyword}"


def test_extract_memories_handles_mem0_error_gracefully(mocker):
    """If mem0 raises, the node returns {} without propagating the exception."""
    state = {"brief": "Emma had a great day.", "child_id": "abc-123"}
    mock_memory = MagicMock()
    mock_memory.add.side_effect = Exception("Qdrant unreachable")
    mocker.patch("backend.nodes.extract_memories.get_memory", return_value=mock_memory)

    result = extract_memories(state)  # must not raise

    assert result == {}
