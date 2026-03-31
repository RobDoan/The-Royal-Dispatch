import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch


_UNSET = object()


def _make_mock_conn(mocker, module_path, fetchone=_UNSET, fetchall=_UNSET):
    """Patch get_conn in the given module and return a configured mock cursor."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    mock_ctx = MagicMock()
    mock_ctx.__enter__ = MagicMock(return_value=mock_conn)
    mock_ctx.__exit__ = MagicMock(return_value=False)
    mocker.patch(module_path, return_value=mock_ctx)
    if fetchone is not _UNSET:
        mock_cursor.fetchone.return_value = fetchone
    if fetchall is not _UNSET:
        mock_cursor.fetchall.return_value = fetchall
    return mock_cursor


@pytest.fixture
def client(mocker):
    mocker.patch("backend.main.royal_graph")
    from backend.main import app
    return TestClient(app)


def test_post_brief_stores_and_returns_ok(client, mocker):
    _make_mock_conn(mocker, "backend.main.get_conn")
    response = client.post("/brief", json={"text": "She shared her blocks today."})
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_post_story_triggers_graph_and_returns_audio_url(mocker):
    mock_graph = MagicMock()
    mock_graph.invoke.return_value = {"audio_url": "https://royal-audio.s3.us-east-1.amazonaws.com/audio.mp3"}
    _make_mock_conn(mocker, "backend.main.get_conn", fetchone=None)
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.post("/story", json={"princess": "elsa", "language": "en"})
    assert response.status_code == 200
    assert "audio_url" in response.json()


def test_post_story_rejects_unknown_princess(mocker):
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.post("/story", json={"princess": "unknown", "language": "en"})
    assert response.status_code == 422


def test_post_story_returns_cached_audio_url_without_running_graph(mocker):
    mock_graph = MagicMock()
    _make_mock_conn(mocker, "backend.main.get_conn",
                    fetchone=("https://royal-audio.s3.us-east-1.amazonaws.com/elsa.mp3",))
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.post("/story", json={"princess": "elsa", "language": "en"})
    assert response.status_code == 200
    assert response.json()["audio_url"] == "https://royal-audio.s3.us-east-1.amazonaws.com/elsa.mp3"
    mock_graph.invoke.assert_not_called()


def test_get_today_stories_returns_cached_map(mocker):
    _make_mock_conn(mocker, "backend.main.get_conn",
                    fetchall=[("elsa", "https://royal-audio.s3.us-east-1.amazonaws.com/elsa.mp3")])
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.get("/story/today")
    assert response.status_code == 200
    assert response.json()["cached"]["elsa"] == "https://royal-audio.s3.us-east-1.amazonaws.com/elsa.mp3"


def test_get_story_today_princess_returns_story(mocker):
    _make_mock_conn(mocker, "backend.main.get_conn",
                    fetchone=("https://royal-audio.s3.us-east-1.amazonaws.com/elsa.mp3",
                              "Dear Emma, [PROUD] today you were brave...", None))
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.get("/story/today/elsa")
    assert response.status_code == 200
    assert response.json()["audio_url"] == "https://royal-audio.s3.us-east-1.amazonaws.com/elsa.mp3"
    assert response.json()["story_text"] == "Dear Emma, [PROUD] today you were brave..."


def test_get_story_today_princess_returns_404_when_not_generated(mocker):
    _make_mock_conn(mocker, "backend.main.get_conn", fetchone=None)
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.get("/story/today/elsa")
    assert response.status_code == 404


def test_post_story_life_lesson_triggers_graph(mocker):
    mock_graph = MagicMock()
    mock_graph.invoke.return_value = {"audio_url": "https://royal-audio.s3.us-east-1.amazonaws.com/ll.mp3"}
    _make_mock_conn(mocker, "backend.main.get_conn", fetchone=None)
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.post("/story", json={"princess": "elsa", "language": "en", "story_type": "life_lesson"})
    assert response.status_code == 200
    call_args = mock_graph.invoke.call_args[0][0]
    assert call_args["story_type"] == "life_lesson"


def test_get_story_today_princess_life_lesson_returns_royal_challenge(mocker):
    _make_mock_conn(mocker, "backend.main.get_conn",
                    fetchone=("https://royal-audio.s3.us-east-1.amazonaws.com/elsa-ll.mp3",
                              "Once in Arendelle...", "Try sharing today."))
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.get("/story/today/elsa?type=life_lesson")
    assert response.status_code == 200
    assert response.json()["royal_challenge"] == "Try sharing today."


def test_get_story_today_princess_daily_returns_null_royal_challenge(mocker):
    _make_mock_conn(mocker, "backend.main.get_conn",
                    fetchone=("https://royal-audio.s3.us-east-1.amazonaws.com/elsa.mp3",
                              "Dear Emma...", None))
    mock_graph = MagicMock()
    with patch("backend.main.royal_graph", mock_graph):
        from backend.main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)
        response = c.get("/story/today/elsa")
    assert response.status_code == 200
    assert response.json()["royal_challenge"] is None
