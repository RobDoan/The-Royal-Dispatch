import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from datetime import date

@pytest.fixture
def client(mocker):
    mocker.patch("backend.main.royal_graph")
    from backend.main import app
    return TestClient(app)

def test_post_brief_stores_and_returns_ok(client, mocker):
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.insert.return_value.execute.return_value = MagicMock()
    mocker.patch("backend.main.get_supabase_client", return_value=mock_supabase)
    response = client.post("/brief", json={"text": "She shared her blocks today."})
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_post_story_triggers_graph_and_returns_audio_url(mocker):
    mock_graph = MagicMock()
    mock_graph.invoke.return_value = {"audio_url": "https://example.com/audio.mp3"}
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
    with patch("backend.main.royal_graph", mock_graph), \
         patch("backend.main.get_supabase_client", return_value=mock_supabase):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.post("/story", json={"princess": "elsa", "language": "en"})
    assert response.status_code == 200
    assert response.json()["audio_url"] == "https://example.com/audio.mp3"

def test_post_story_rejects_unknown_princess(mocker):
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.post("/story", json={"princess": "unknown", "language": "en"})
    assert response.status_code == 422

def test_post_story_returns_cached_audio_url_without_running_graph(mocker):
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"audio_url": "https://example.com/cached-elsa.mp3"},
    ]
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph), \
         patch("backend.main.get_supabase_client", return_value=mock_supabase):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.post("/story", json={"princess": "elsa", "language": "en"})
    assert response.status_code == 200
    assert response.json()["audio_url"] == "https://example.com/cached-elsa.mp3"
    mock_graph.invoke.assert_not_called()

def test_get_today_stories_returns_cached_map(mocker):
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"princess": "elsa", "audio_url": "https://example.com/elsa.mp3"},
    ]
    mocker.patch("backend.main.get_supabase_client", return_value=mock_supabase)
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.get("/story/today")
    assert response.status_code == 200
    assert response.json()["cached"]["elsa"] == "https://example.com/elsa.mp3"
