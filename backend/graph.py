from langgraph.graph import StateGraph, END
from backend.state import RoyalStateOptional
from backend.nodes.fetch_brief import fetch_brief
from backend.nodes.extract_memories import extract_memories
from backend.nodes.classify_tone import classify_tone
from backend.nodes.load_persona import load_persona
from backend.nodes.fetch_memories import fetch_memories
from backend.nodes.generate_story import generate_story
from backend.nodes.infer_situation import infer_situation
from backend.nodes.generate_life_lesson import generate_life_lesson
from backend.nodes.synthesize_voice import synthesize_voice
from backend.nodes.store_result import store_result

def route_story_type(state: RoyalStateOptional) -> str:
    return state["story_type"]

def build_graph():
    graph = StateGraph(RoyalStateOptional)
    graph.add_node("fetch_brief", fetch_brief)
    graph.add_node("extract_memories", extract_memories)
    graph.add_node("classify_tone", classify_tone)
    graph.add_node("load_persona", load_persona)
    graph.add_node("fetch_memories", fetch_memories)
    graph.add_node("generate_story", generate_story)
    graph.add_node("infer_situation", infer_situation)
    graph.add_node("generate_life_lesson", generate_life_lesson)
    graph.add_node("synthesize_voice", synthesize_voice)
    graph.add_node("store_result", store_result)

    graph.set_entry_point("fetch_brief")
    graph.add_edge("fetch_brief", "extract_memories")
    graph.add_edge("extract_memories", "classify_tone")
    graph.add_edge("classify_tone", "load_persona")
    graph.add_edge("load_persona", "fetch_memories")
    graph.add_conditional_edges(
        "fetch_memories",
        route_story_type,
        {"daily": "generate_story", "life_lesson": "infer_situation"},
    )
    graph.add_edge("generate_story", "synthesize_voice")
    graph.add_edge("infer_situation", "generate_life_lesson")
    graph.add_edge("generate_life_lesson", "synthesize_voice")
    graph.add_edge("synthesize_voice", "store_result")
    graph.add_edge("store_result", END)

    return graph.compile()

royal_graph = build_graph()
