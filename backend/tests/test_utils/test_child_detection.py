from unittest.mock import MagicMock
from backend.utils.child_detection import detect_children_in_brief


def test_returns_empty_list_when_no_children():
    """If no children registered, returns [] without calling LLM."""
    result = detect_children_in_brief("Emma had a great day", [])
    assert result == []


def test_returns_matched_names(mocker):
    """LLM returns a matched name that is in the provided list."""
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content='["Emma"]')
    mocker.patch("backend.utils.child_detection.get_llm", return_value=mock_llm)

    result = detect_children_in_brief("Emma had a great day", ["Emma", "Sophie"])

    assert result == ["Emma"]


def test_returns_multiple_matched_names(mocker):
    """LLM returns multiple matched names."""
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content='["Emma", "Sophie"]')
    mocker.patch("backend.utils.child_detection.get_llm", return_value=mock_llm)

    result = detect_children_in_brief("Emma and Sophie had a great day", ["Emma", "Sophie"])

    assert result == ["Emma", "Sophie"]


def test_returns_empty_list_when_no_match(mocker):
    """LLM returns [] when no children are mentioned."""
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content='[]')
    mocker.patch("backend.utils.child_detection.get_llm", return_value=mock_llm)

    result = detect_children_in_brief("Had a wonderful day", ["Emma", "Sophie"])

    assert result == []


def test_filters_out_names_not_in_list(mocker):
    """LLM hallucinated a name not in the registered list — must be filtered out."""
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content='["InvalidName", "Emma"]')
    mocker.patch("backend.utils.child_detection.get_llm", return_value=mock_llm)

    result = detect_children_in_brief("Emma had a great day", ["Emma", "Sophie"])

    assert result == ["Emma"]


def test_handles_invalid_json_gracefully(mocker):
    """If LLM returns non-JSON, returns [] without raising."""
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content='not valid json at all')
    mocker.patch("backend.utils.child_detection.get_llm", return_value=mock_llm)

    result = detect_children_in_brief("Emma had a great day", ["Emma"])

    assert result == []


def test_handles_non_list_json_gracefully(mocker):
    """If LLM returns valid JSON but not a list, returns []."""
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content='{"name": "Emma"}')
    mocker.patch("backend.utils.child_detection.get_llm", return_value=mock_llm)

    result = detect_children_in_brief("Emma had a great day", ["Emma"])

    assert result == []
