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
    from backend.main import app
    return TestClient(app)


def test_post_brief_stores_and_returns_ok(client, mocker):
    _make_mock_conn(mocker, "backend.routes.stories.get_conn")
    response = client.post("/brief", json={"text": "She shared her blocks today.", "user_id": "test-user-id"})
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_post_story_cache_miss_returns_streaming_url_without_invoking_graph(mocker):
    """On cache miss, POST /story returns a streaming URL and does NO pipeline work."""
    _make_mock_conn(mocker, "backend.routes.stories.get_conn", fetchone=None)
    mocker.patch.dict("os.environ", {"BACKEND_PUBLIC_URL": "https://api.example.com"})
    mock_pre_tts = MagicMock()
    with patch("backend.routes.stories.pre_tts_graph", mock_pre_tts):
        from backend.main import app
        c = TestClient(app)
        response = c.post("/story", json={"princess": "elsa", "language": "en"})
    assert response.status_code == 200
    audio_url = response.json()["audio_url"]
    assert audio_url.startswith("https://api.example.com/story/stream?")
    assert "princess=elsa" in audio_url
    assert "language=en" in audio_url
    assert "story_type=daily" in audio_url
    mock_pre_tts.invoke.assert_not_called()


def test_post_story_rejects_unknown_princess(mocker):
    from backend.main import app
    c = TestClient(app)
    response = c.post("/story", json={"princess": "unknown", "language": "en"})
    assert response.status_code == 422


def test_post_story_returns_cached_audio_url_without_running_graph(mocker):
    _make_mock_conn(mocker, "backend.routes.stories.get_conn",
                    fetchone=("https://royal-audio.s3.us-east-1.amazonaws.com/elsa.mp3",))
    from backend.main import app
    c = TestClient(app)
    response = c.post("/story", json={"princess": "elsa", "language": "en"})
    assert response.status_code == 200
    assert response.json()["audio_url"] == "https://royal-audio.s3.us-east-1.amazonaws.com/elsa.mp3"


def test_get_today_stories_returns_cached_map(mocker):
    _make_mock_conn(mocker, "backend.routes.stories.get_conn",
                    fetchall=[("elsa", "https://royal-audio.s3.us-east-1.amazonaws.com/elsa.mp3")])
    from backend.main import app
    c = TestClient(app)
    response = c.get("/story/today")
    assert response.status_code == 200
    assert response.json()["cached"]["elsa"] == "https://royal-audio.s3.us-east-1.amazonaws.com/elsa.mp3"


def test_get_story_today_princess_returns_story(mocker):
    _make_mock_conn(mocker, "backend.routes.stories.get_conn",
                    fetchone=("https://royal-audio.s3.us-east-1.amazonaws.com/elsa.mp3",
                              "Dear Emma, [PROUD] today you were brave...", None))
    from backend.main import app
    c = TestClient(app)
    response = c.get("/story/today/elsa")
    assert response.status_code == 200
    assert response.json()["audio_url"] == "https://royal-audio.s3.us-east-1.amazonaws.com/elsa.mp3"
    assert response.json()["story_text"] == "Dear Emma, [PROUD] today you were brave..."


def test_get_story_today_princess_returns_404_when_not_generated(mocker):
    _make_mock_conn(mocker, "backend.routes.stories.get_conn", fetchone=None)
    from backend.main import app
    c = TestClient(app)
    response = c.get("/story/today/elsa")
    assert response.status_code == 404


def test_post_story_life_lesson_cache_miss_returns_streaming_url_with_story_type(mocker):
    _make_mock_conn(mocker, "backend.routes.stories.get_conn", fetchone=None)
    mocker.patch.dict("os.environ", {"BACKEND_PUBLIC_URL": "https://api.example.com"})
    mock_pre_tts = MagicMock()
    with patch("backend.routes.stories.pre_tts_graph", mock_pre_tts):
        from backend.main import app
        c = TestClient(app)
        response = c.post("/story", json={"princess": "elsa", "language": "en", "story_type": "life_lesson"})
    assert response.status_code == 200
    assert "story_type=life_lesson" in response.json()["audio_url"]
    mock_pre_tts.invoke.assert_not_called()


def test_post_story_cache_miss_includes_child_id_in_streaming_url(mocker):
    _make_mock_conn(mocker, "backend.routes.stories.get_conn", fetchone=None)
    mocker.patch.dict("os.environ", {"BACKEND_PUBLIC_URL": "https://api.example.com"})
    mock_pre_tts = MagicMock()
    with patch("backend.routes.stories.pre_tts_graph", mock_pre_tts):
        from backend.main import app
        c = TestClient(app)
        response = c.post("/story", json={
            "princess": "elsa", "language": "en",
            "child_id": "00000000-0000-0000-0000-000000000001",
        })
    assert response.status_code == 200
    assert "child_id=00000000-0000-0000-0000-000000000001" in response.json()["audio_url"]
    mock_pre_tts.invoke.assert_not_called()


def test_get_story_today_princess_life_lesson_returns_royal_challenge(mocker):
    _make_mock_conn(mocker, "backend.routes.stories.get_conn",
                    fetchone=("https://royal-audio.s3.us-east-1.amazonaws.com/elsa-ll.mp3",
                              "Once in Arendelle...", "Try sharing today."))
    from backend.main import app
    c = TestClient(app)
    response = c.get("/story/today/elsa?type=life_lesson")
    assert response.status_code == 200
    assert response.json()["royal_challenge"] == "Try sharing today."


def test_get_story_today_princess_daily_returns_null_royal_challenge(mocker):
    _make_mock_conn(mocker, "backend.routes.stories.get_conn",
                    fetchone=("https://royal-audio.s3.us-east-1.amazonaws.com/elsa.mp3",
                              "Dear Emma...", None))
    from backend.main import app
    c = TestClient(app)
    response = c.get("/story/today/elsa")
    assert response.status_code == 200
    assert response.json()["royal_challenge"] is None


def test_get_story_stream_redirects_when_cached(mocker):
    """If the cache fills between POST and GET, return a 302 to the S3 URL."""
    _make_mock_conn(mocker, "backend.routes.stories.get_conn",
                    fetchone=("https://minio.example.com/royal-audio/elsa.mp3",))
    mock_pre_tts = MagicMock()
    with patch("backend.routes.stories.pre_tts_graph", mock_pre_tts):
        from backend.main import app
        c = TestClient(app)
        response = c.get(
            "/story/stream",
            params={"princess": "elsa", "date": "2026-04-16", "language": "en",
                    "story_type": "daily", "timezone": "America/Los_Angeles"},
            follow_redirects=False,
        )
    assert response.status_code == 302
    assert response.headers["location"] == "https://minio.example.com/royal-audio/elsa.mp3"
    mock_pre_tts.invoke.assert_not_called()


def test_get_story_stream_streams_chunks_on_cache_miss(mocker):
    """Cache miss: run pre_tts_graph, stream ElevenLabs chunks, schedule finalize."""
    _make_mock_conn(mocker, "backend.routes.stories.get_conn", fetchone=None)

    mock_pre_tts = MagicMock()
    mock_pre_tts.invoke.return_value = {
        "princess": "elsa", "date": "2026-04-16", "brief": "", "tone": "praise",
        "persona": {"voice_id": "v-123"}, "story_type": "daily", "situation": "",
        "story_text": "Dear Emma, [PROUD] today...", "audio_url": "",
        "language": "en", "timezone": "America/Los_Angeles",
        "child_id": None, "child_name": "Emma",
    }

    def fake_stream(voice_id, text):
        assert voice_id == "v-123"
        assert text == "Dear Emma, [PROUD] today..."
        yield b"chunk1"
        yield b"chunk2"
        yield b"chunk3"

    mock_finalize = MagicMock()

    with patch("backend.routes.stories.pre_tts_graph", mock_pre_tts), \
         patch("backend.routes.stories.synthesize_voice_stream", fake_stream), \
         patch("backend.routes.stories.store_result_from_bytes", mock_finalize):
        from backend.main import app
        c = TestClient(app)
        response = c.get(
            "/story/stream",
            params={"princess": "elsa", "date": "2026-04-16", "language": "en",
                    "story_type": "daily", "timezone": "America/Los_Angeles"},
        )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/mpeg")
    assert response.content == b"chunk1chunk2chunk3"

    # Give the finalize task a chance to run on the event loop.
    # TestClient shuts down the loop synchronously, so by the time we get here
    # the detached asyncio.create_task should have run.
    mock_finalize.assert_called_once()
    state_arg, bytes_arg = mock_finalize.call_args[0]
    assert bytes_arg == b"chunk1chunk2chunk3"
    assert state_arg["story_text"] == "Dear Emma, [PROUD] today..."


def test_get_story_stream_does_not_finalize_on_elevenlabs_error(mocker):
    """If ElevenLabs raises mid-stream, no row is inserted."""
    _make_mock_conn(mocker, "backend.routes.stories.get_conn", fetchone=None)

    mock_pre_tts = MagicMock()
    mock_pre_tts.invoke.return_value = {
        "princess": "elsa", "date": "2026-04-16", "brief": "", "tone": "praise",
        "persona": {"voice_id": "v-123"}, "story_type": "daily", "situation": "",
        "story_text": "text", "audio_url": "",
        "language": "en", "timezone": "America/Los_Angeles",
        "child_id": None, "child_name": "Emma",
    }

    def failing_stream(voice_id, text):
        yield b"chunk1"
        raise RuntimeError("elevenlabs exploded")

    mock_finalize = MagicMock()

    with patch("backend.routes.stories.pre_tts_graph", mock_pre_tts), \
         patch("backend.routes.stories.synthesize_voice_stream", failing_stream), \
         patch("backend.routes.stories.store_result_from_bytes", mock_finalize):
        from backend.main import app
        c = TestClient(app)
        # The stream will terminate early; TestClient accepts whatever bytes arrive
        # before the error.
        response = c.get(
            "/story/stream",
            params={"princess": "elsa", "date": "2026-04-16", "language": "en",
                    "story_type": "daily", "timezone": "America/Los_Angeles"},
        )
    # StreamingResponse returns 200 even if the generator raises mid-stream;
    # the client just gets truncated bytes.
    assert response.status_code == 200
    mock_finalize.assert_not_called()


def test_get_story_stream_passes_child_id_to_cache_lookup(mocker):
    """child_id is part of the cache key; lookup must include it."""
    mock_cursor = _make_mock_conn(mocker, "backend.routes.stories.get_conn", fetchone=None)
    mock_pre_tts = MagicMock()
    mock_pre_tts.invoke.return_value = {
        "princess": "elsa", "date": "2026-04-16", "brief": "", "tone": "praise",
        "persona": {"voice_id": "v"}, "story_type": "daily", "situation": "",
        "story_text": "t", "audio_url": "",
        "language": "en", "timezone": "America/Los_Angeles",
        "child_id": "child-uuid-1", "child_name": "Emma",
    }

    def stream(voice_id, text):
        yield b"x"

    with patch("backend.routes.stories.pre_tts_graph", mock_pre_tts), \
         patch("backend.routes.stories.synthesize_voice_stream", stream), \
         patch("backend.routes.stories.store_result_from_bytes", MagicMock()):
        from backend.main import app
        c = TestClient(app)
        c.get(
            "/story/stream",
            params={"princess": "elsa", "date": "2026-04-16", "language": "en",
                    "story_type": "daily", "timezone": "America/Los_Angeles",
                    "child_id": "child-uuid-1"},
        )

    # First execute() is the cache lookup; assert child_id appears in its params.
    lookup_call = mock_cursor.execute.call_args_list[0]
    sql, params = lookup_call[0]
    assert "child_id IS NOT DISTINCT FROM" in sql
    assert "child-uuid-1" in params
