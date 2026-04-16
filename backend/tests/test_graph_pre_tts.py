from unittest.mock import MagicMock, patch
import importlib
import sys


def test_pre_tts_graph_daily_runs_generate_story(mocker):
    """Test that pre_tts_graph runs the daily story generation path."""
    # Patch all nodes at the source before importing the graph module
    with patch("backend.nodes.fetch_brief.fetch_brief", MagicMock(return_value={})), \
         patch("backend.nodes.extract_memories.extract_memories", MagicMock(return_value={})), \
         patch("backend.nodes.classify_tone.classify_tone", MagicMock(return_value={})), \
         patch("backend.nodes.load_persona.load_persona", MagicMock(return_value={})), \
         patch("backend.nodes.fetch_memories.fetch_memories", MagicMock(return_value={})), \
         patch("backend.nodes.generate_story.generate_story", MagicMock(return_value={"story_text": "Dear Emma, [PROUD] today..."})), \
         patch("backend.nodes.infer_situation.infer_situation", MagicMock(return_value={})), \
         patch("backend.nodes.generate_life_lesson.generate_life_lesson", MagicMock(return_value={})):

        # Clear the module cache and reload to get fresh imports with patches
        if "backend.graph" in sys.modules:
            del sys.modules["backend.graph"]

        import backend.graph as graph_module

        initial_state = {
            "princess": "elsa", "date": "2026-04-16", "brief": "", "tone": "",
            "persona": {}, "story_type": "daily", "situation": "", "story_text": "",
            "audio_url": "", "language": "en", "timezone": "America/Los_Angeles",
            "child_id": None, "child_name": "Emma",
        }
        result = graph_module.pre_tts_graph.invoke(initial_state)

        assert result["story_text"] == "Dear Emma, [PROUD] today..."


def test_pre_tts_graph_life_lesson_runs_infer_situation_and_generate_life_lesson(mocker):
    """Test that pre_tts_graph runs the life_lesson path."""
    # Patch all nodes at the source before importing the graph module
    with patch("backend.nodes.fetch_brief.fetch_brief", MagicMock(return_value={})), \
         patch("backend.nodes.extract_memories.extract_memories", MagicMock(return_value={})), \
         patch("backend.nodes.classify_tone.classify_tone", MagicMock(return_value={})), \
         patch("backend.nodes.load_persona.load_persona", MagicMock(return_value={})), \
         patch("backend.nodes.fetch_memories.fetch_memories", MagicMock(return_value={})), \
         patch("backend.nodes.generate_story.generate_story", MagicMock(return_value={})), \
         patch("backend.nodes.infer_situation.infer_situation", MagicMock(return_value={"situation": "sharing"})), \
         patch("backend.nodes.generate_life_lesson.generate_life_lesson", MagicMock(return_value={"story_text": "Once in Arendelle...", "royal_challenge": "Try sharing today."})):

        # Clear the module cache and reload to get fresh imports with patches
        if "backend.graph" in sys.modules:
            del sys.modules["backend.graph"]

        import backend.graph as graph_module

        initial_state = {
            "princess": "elsa", "date": "2026-04-16", "brief": "", "tone": "",
            "persona": {}, "story_type": "life_lesson", "situation": "", "story_text": "",
            "audio_url": "", "language": "en", "timezone": "America/Los_Angeles",
            "child_id": None, "child_name": "Emma",
        }
        result = graph_module.pre_tts_graph.invoke(initial_state)

        assert result["story_text"] == "Once in Arendelle..."
        assert result["royal_challenge"] == "Try sharing today."


def test_pre_tts_graph_does_not_reference_synthesize_or_store(mocker):
    """Regression guard: pre_tts_graph must not wire synthesize_voice or store_result."""
    import backend.graph as graph_module

    # The compiled graph exposes its node names via get_graph().
    node_names = set(graph_module.pre_tts_graph.get_graph().nodes.keys())
    assert "synthesize_voice" not in node_names
    assert "store_result" not in node_names
