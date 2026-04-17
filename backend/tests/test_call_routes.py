import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock


def _make_mock_conn(mocker, module_path, fetchone=None):
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    mock_ctx = MagicMock()
    mock_ctx.__enter__ = MagicMock(return_value=mock_conn)
    mock_ctx.__exit__ = MagicMock(return_value=False)
    mocker.patch(module_path, return_value=mock_ctx)
    if fetchone is not None:
        mock_cursor.fetchone.return_value = fetchone
    return mock_cursor


@pytest.fixture
def client(mocker):
    from backend.main import app
    return TestClient(app)


def test_call_start_returns_persona_and_memories(client, mocker):
    mocker.patch("backend.routes.call.fetch_memories", return_value={"memories": "- Loves ice castles\n- Got a gold star"})
    _make_mock_conn(mocker, "backend.routes.call.get_conn", fetchone=("Emma",))
    response = client.get("/call/start?child_id=abc-123&princess=elsa")
    assert response.status_code == 200
    data = response.json()
    assert data["persona"]["name"] == "Queen Elsa"
    assert data["persona"]["voice_id"] == "3NCpLcGW5vNnR78Ytkew"
    assert data["persona"]["origin"] == "Kingdom of Arendelle"
    assert data["persona"]["tone_style"] == "calm, majestic, warmly proud"
    assert "signature_phrase" in data["persona"]
    assert data["memories"] == "- Loves ice castles\n- Got a gold star"
    assert data["child_name"] == "Emma"
    assert "session_id" in data
    assert data["timer_seconds"] == 420


def test_call_start_unknown_princess_returns_404(client, mocker):
    _make_mock_conn(mocker, "backend.routes.call.get_conn", fetchone=("Emma",))
    response = client.get("/call/start?child_id=abc-123&princess=unknown")
    assert response.status_code == 404


def test_call_start_missing_child_returns_422(client):
    response = client.get("/call/start?princess=elsa")
    assert response.status_code == 422


def test_call_tts_streams_audio(client, mocker):
    mock_stream = mocker.patch("backend.routes.call.synthesize_voice_stream", return_value=iter([b"chunk1", b"chunk2"]))
    response = client.post("/call/tts", json={"text": "Hello dear!", "voice_id": "3NCpLcGW5vNnR78Ytkew"})
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.content == b"chunk1chunk2"
    mock_stream.assert_called_once_with("3NCpLcGW5vNnR78Ytkew", "Hello dear!")


def test_call_tts_missing_text_returns_422(client):
    response = client.post("/call/tts", json={"voice_id": "abc"})
    assert response.status_code == 422


def test_call_end_stores_record_and_extracts_memories(client, mocker):
    mock_cursor = _make_mock_conn(mocker, "backend.routes.call.get_conn")
    mock_extract = mocker.patch("backend.routes.call.extract_memories_from_transcript")
    transcript = [{"role": "child", "text": "I got a gold star today!"}, {"role": "princess", "text": "How wonderful!"}]
    response = client.post(
        "/call/end",
        json={
            "session_id": "sess-123",
            "child_id": "child-456",
            "princess": "elsa",
            "duration_seconds": 300,
            "transcript": transcript,
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    mock_cursor.execute.assert_called_once()
    sql = mock_cursor.execute.call_args[0][0]
    assert "INSERT INTO calls" in sql
    mock_extract.assert_called_once_with("child-456", transcript)


def test_call_end_missing_fields_returns_422(client):
    response = client.post("/call/end", json={"session_id": "x"})
    assert response.status_code == 422


def test_full_call_flow(client, mocker):
    """Simulate a complete call: start -> tts -> end."""
    # Setup mocks
    _make_mock_conn(mocker, "backend.routes.call.get_conn", fetchone=("Lily",))
    mocker.patch(
        "backend.routes.call.fetch_memories",
        return_value={"memories": "- Loves butterflies"},
    )
    mocker.patch(
        "backend.routes.call.synthesize_voice_stream",
        return_value=iter([b"audio-data"]),
    )
    mocker.patch("backend.routes.call.extract_memories_from_transcript")

    # 1. Start call
    start_res = client.get("/call/start?child_id=child-1&princess=elsa")
    assert start_res.status_code == 200
    session_id = start_res.json()["session_id"]
    voice_id = start_res.json()["persona"]["voice_id"]

    # 2. TTS request
    tts_res = client.post("/call/tts", json={
        "text": "Hello Lily!",
        "voice_id": voice_id,
    })
    assert tts_res.status_code == 200
    assert tts_res.content == b"audio-data"

    # 3. End call
    end_res = client.post("/call/end", json={
        "session_id": session_id,
        "child_id": "child-1",
        "princess": "elsa",
        "duration_seconds": 180,
        "transcript": [
            {"role": "princess", "text": "Hello Lily!"},
            {"role": "child", "text": "Hi Elsa! I saw a butterfly today!"},
        ],
    })
    assert end_res.status_code == 200
    assert end_res.json()["status"] == "ok"
