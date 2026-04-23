from prometheus_client import REGISTRY
from fastapi.testclient import TestClient

from backend.main import app
from backend.utils.metrics import (
    external_api_calls,
    langgraph_node_duration,
    story_generation_seconds,
)


client = TestClient(app)


def test_metrics_endpoint_exposes_prometheus_format():
    response = client.get("/metrics")
    assert response.status_code == 200
    body = response.text
    assert "# HELP" in body
    assert "# TYPE" in body


def test_custom_metrics_are_registered():
    response = client.get("/metrics")
    body = response.text
    assert "royal_langgraph_node_duration_seconds" in body
    assert "royal_external_api_calls_total" in body
    assert "royal_story_generation_seconds" in body


def test_external_api_calls_counter_increments():
    before = _counter_value("royal_external_api_calls_total", provider="anthropic", outcome="ok")
    external_api_calls.labels(provider="anthropic", outcome="ok").inc()
    after = _counter_value("royal_external_api_calls_total", provider="anthropic", outcome="ok")
    assert after == before + 1


def test_langgraph_histogram_records_observations():
    langgraph_node_duration.labels(node="generate_story", story_type="daily").observe(1.5)
    count = REGISTRY.get_sample_value(
        "royal_langgraph_node_duration_seconds_count",
        {"node": "generate_story", "story_type": "daily"},
    )
    assert count is not None and count >= 1


def test_story_generation_histogram_records_observations():
    story_generation_seconds.labels(story_type="daily").observe(10.0)
    count = REGISTRY.get_sample_value(
        "royal_story_generation_seconds_count",
        {"story_type": "daily"},
    )
    assert count is not None and count >= 1


def _counter_value(name: str, **labels: str) -> float:
    value = REGISTRY.get_sample_value(name, labels)
    return value if value is not None else 0.0
