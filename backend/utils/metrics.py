from prometheus_client import Counter, Histogram


langgraph_node_duration = Histogram(
    "royal_langgraph_node_duration_seconds",
    "Time spent in each LangGraph node",
    labelnames=("node", "story_type"),
    buckets=(0.1, 0.5, 1, 2, 5, 10, 30, 60),
)

external_api_calls = Counter(
    "royal_external_api_calls_total",
    "External API calls by provider and outcome",
    labelnames=("provider", "outcome"),
)

story_generation_seconds = Histogram(
    "royal_story_generation_seconds",
    "End-to-end story generation time",
    labelnames=("story_type",),
    buckets=(1, 5, 10, 20, 30, 60, 120),
)
