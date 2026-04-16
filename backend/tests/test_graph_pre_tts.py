from unittest.mock import MagicMock


def _patch_all_nodes(mocker):
    """Patch every pre-TTS node with a MagicMock returning an empty dict update.

    Patches are applied at each node's source module so they survive
    importlib.reload(backend.graph), which re-executes the `from backend.nodes.X
    import X` statements and would otherwise replace attributes patched on
    backend.graph directly.

    Tests that care about a specific node's output override its return_value.
    """
    mocks = {}
    for name in (
        "fetch_brief",
        "extract_memories",
        "classify_tone",
        "load_persona",
        "fetch_memories",
        "generate_story",
        "infer_situation",
        "generate_life_lesson",
    ):
        m = MagicMock(return_value={})
        mocker.patch(f"backend.nodes.{name}.{name}", m)
        mocks[name] = m
    return mocks


def test_pre_tts_graph_daily_runs_generate_story(mocker):
    mocks = _patch_all_nodes(mocker)
    mocks["generate_story"].return_value = {"story_text": "Dear Emma, [PROUD] today..."}

    # Re-import to rebuild the graph with patched nodes
    import importlib
    import backend.graph as graph_module
    importlib.reload(graph_module)

    initial_state = {
        "princess": "elsa", "date": "2026-04-16", "brief": "", "tone": "",
        "persona": {}, "story_type": "daily", "situation": "", "story_text": "",
        "audio_url": "", "language": "en", "timezone": "America/Los_Angeles",
        "child_id": None, "child_name": "Emma",
    }
    result = graph_module.pre_tts_graph.invoke(initial_state)

    mocks["generate_story"].assert_called_once()
    mocks["infer_situation"].assert_not_called()
    mocks["generate_life_lesson"].assert_not_called()
    assert result["story_text"] == "Dear Emma, [PROUD] today..."


def test_pre_tts_graph_life_lesson_runs_infer_situation_and_generate_life_lesson(mocker):
    mocks = _patch_all_nodes(mocker)
    mocks["infer_situation"].return_value = {"situation": "sharing"}
    mocks["generate_life_lesson"].return_value = {
        "story_text": "Once in Arendelle...",
        "royal_challenge": "Try sharing today.",
    }

    import importlib
    import backend.graph as graph_module
    importlib.reload(graph_module)

    initial_state = {
        "princess": "elsa", "date": "2026-04-16", "brief": "", "tone": "",
        "persona": {}, "story_type": "life_lesson", "situation": "", "story_text": "",
        "audio_url": "", "language": "en", "timezone": "America/Los_Angeles",
        "child_id": None, "child_name": "Emma",
    }
    result = graph_module.pre_tts_graph.invoke(initial_state)

    mocks["generate_story"].assert_not_called()
    mocks["infer_situation"].assert_called_once()
    mocks["generate_life_lesson"].assert_called_once()
    assert result["story_text"] == "Once in Arendelle..."
    assert result["royal_challenge"] == "Try sharing today."


def test_pre_tts_graph_does_not_reference_synthesize_or_store(mocker):
    """Regression guard: pre_tts_graph must not wire synthesize_voice or store_result."""
    import backend.graph as graph_module

    # The compiled graph exposes its node names via get_graph().
    node_names = set(graph_module.pre_tts_graph.get_graph().nodes.keys())
    assert "synthesize_voice" not in node_names
    assert "store_result" not in node_names
