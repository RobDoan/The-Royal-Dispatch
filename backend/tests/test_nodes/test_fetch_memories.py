from unittest.mock import MagicMock
from backend.nodes.fetch_memories import fetch_memories


def test_fetch_memories_combines_profile_and_relevant(mocker):
    """Profile memories appear as bullets; relevant non-overlapping memories appear with [Today:] prefix."""
    state = {"brief": "Emma shared her crayons today."}
    mock_memory = MagicMock()
    mock_memory.get_all.return_value = [
        {"id": "1", "memory": "Emma loves her blue teddy bear"},
        {"id": "2", "memory": "Emma is working on brushing her teeth"},
    ]
    mock_memory.search.return_value = [
        {"id": "3", "memory": "Emma helped a friend share at school"},
    ]
    mocker.patch("backend.nodes.fetch_memories.get_memory", return_value=mock_memory)

    result = fetch_memories(state)

    assert "- Emma loves her blue teddy bear" in result["memories"]
    assert "- Emma is working on brushing her teeth" in result["memories"]
    assert "[Today: Emma helped a friend share at school]" in result["memories"]


def test_fetch_memories_deduplicates_relevant_already_in_profile(mocker):
    """A memory already in the profile must not appear again under [Today:]."""
    state = {"brief": "Emma shared her crayons."}
    mock_memory = MagicMock()
    mock_memory.get_all.return_value = [
        {"id": "1", "memory": "Emma loves her blue teddy bear"},
    ]
    mock_memory.search.return_value = [
        {"id": "1", "memory": "Emma loves her blue teddy bear"},  # same id
    ]
    mocker.patch("backend.nodes.fetch_memories.get_memory", return_value=mock_memory)

    result = fetch_memories(state)

    assert result["memories"].count("Emma loves her blue teddy bear") == 1


def test_fetch_memories_skips_search_on_fallback_brief(mocker):
    """When brief is __fallback__, search must not be called; profile is still returned."""
    state = {"brief": "__fallback__"}
    mock_memory = MagicMock()
    mock_memory.get_all.return_value = [
        {"id": "1", "memory": "Emma loves her blue teddy bear"},
    ]
    mocker.patch("backend.nodes.fetch_memories.get_memory", return_value=mock_memory)

    result = fetch_memories(state)

    mock_memory.search.assert_not_called()
    assert "Emma loves her blue teddy bear" in result["memories"]


def test_fetch_memories_returns_empty_string_on_error(mocker):
    """If mem0 raises, returns memories='' without propagating the exception."""
    state = {"brief": "Emma had a great day."}
    mock_memory = MagicMock()
    mock_memory.get_all.side_effect = Exception("Qdrant unreachable")
    mocker.patch("backend.nodes.fetch_memories.get_memory", return_value=mock_memory)

    result = fetch_memories(state)

    assert result == {"memories": ""}


def test_fetch_memories_returns_empty_string_when_no_memories(mocker):
    """When mem0 has nothing stored yet, returns memories=''."""
    state = {"brief": "Emma had a great day."}
    mock_memory = MagicMock()
    mock_memory.get_all.return_value = []
    mock_memory.search.return_value = []
    mocker.patch("backend.nodes.fetch_memories.get_memory", return_value=mock_memory)

    result = fetch_memories(state)

    assert result == {"memories": ""}
