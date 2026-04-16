import os
from unittest.mock import MagicMock

from backend.state import RoyalState, RoyalStateOptional
from backend.nodes.store_result import store_result_from_bytes


def _mock_conn(mocker):
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    mock_ctx = MagicMock()
    mock_ctx.__enter__ = MagicMock(return_value=mock_conn)
    mock_ctx.__exit__ = MagicMock(return_value=False)
    mocker.patch("backend.nodes.store_result.get_conn", return_value=mock_ctx)
    return mock_cursor


def _base_state() -> RoyalStateOptional:
    return RoyalState(
        princess="elsa",
        date="2026-04-16",
        brief="Good day.",
        tone="praise",
        persona={"voice_id": "v"},
        story_type="daily",
        situation="",
        story_text="[PROUD] Emma, well done.",
        audio_url="",
        language="en",
        timezone="America/Los_Angeles",
    )


def test_store_result_from_bytes_uploads_to_s3_with_daily_filename(mocker):
    _mock_conn(mocker)
    mock_storage = MagicMock()
    mocker.patch("backend.nodes.store_result.get_storage", return_value=mock_storage)
    mocker.patch.dict(os.environ, {
        "S3_BUCKET": "royal-audio",
        "S3_PUBLIC_URL": "https://minio.example.com",
    })

    store_result_from_bytes(_base_state(), b"mp3bytes")

    mock_storage.put_object.assert_called_once()
    call_kwargs = mock_storage.put_object.call_args[1]
    assert call_kwargs["Bucket"] == "royal-audio"
    assert call_kwargs["Key"] == "2026-04-16-elsa-en.mp3"
    assert call_kwargs["Body"] == b"mp3bytes"
    assert call_kwargs["ContentType"] == "audio/mpeg"


def test_store_result_from_bytes_uses_life_lesson_suffix(mocker):
    _mock_conn(mocker)
    mock_storage = MagicMock()
    mocker.patch("backend.nodes.store_result.get_storage", return_value=mock_storage)
    mocker.patch.dict(os.environ, {
        "S3_BUCKET": "royal-audio",
        "S3_PUBLIC_URL": "https://minio.example.com",
    })
    state = _base_state()
    state["story_type"] = "life_lesson"
    state["situation"] = "sharing"

    store_result_from_bytes(state, b"mp3bytes")

    call_kwargs = mock_storage.put_object.call_args[1]
    assert call_kwargs["Key"] == "2026-04-16-elsa-en-life_lesson.mp3"


def test_store_result_from_bytes_inserts_story_row_with_public_url(mocker):
    mock_cursor = _mock_conn(mocker)
    mock_storage = MagicMock()
    mocker.patch("backend.nodes.store_result.get_storage", return_value=mock_storage)
    mocker.patch.dict(os.environ, {
        "S3_BUCKET": "royal-audio",
        "S3_PUBLIC_URL": "https://minio.example.com",
    })

    store_result_from_bytes(_base_state(), b"mp3bytes")

    mock_cursor.execute.assert_called_once()
    sql, params = mock_cursor.execute.call_args[0]
    assert "ON CONFLICT" in sql
    expected_url = "https://minio.example.com/royal-audio/2026-04-16-elsa-en.mp3"
    assert expected_url in params


def test_store_result_from_bytes_includes_royal_challenge_for_life_lesson(mocker):
    mock_cursor = _mock_conn(mocker)
    mock_storage = MagicMock()
    mocker.patch("backend.nodes.store_result.get_storage", return_value=mock_storage)
    mocker.patch.dict(os.environ, {
        "S3_BUCKET": "royal-audio",
        "S3_PUBLIC_URL": "https://minio.example.com",
    })
    state = dict(_base_state())
    state["story_type"] = "life_lesson"
    state["royal_challenge"] = "Try sharing today."

    store_result_from_bytes(state, b"mp3bytes")

    sql, params = mock_cursor.execute.call_args[0]
    assert "Try sharing today." in params


def test_store_result_from_bytes_includes_child_id_when_present(mocker):
    mock_cursor = _mock_conn(mocker)
    mock_storage = MagicMock()
    mocker.patch("backend.nodes.store_result.get_storage", return_value=mock_storage)
    mocker.patch.dict(os.environ, {
        "S3_BUCKET": "royal-audio",
        "S3_PUBLIC_URL": "https://minio.example.com",
    })
    state = dict(_base_state())
    state["child_id"] = "00000000-0000-0000-0000-000000000001"

    store_result_from_bytes(state, b"mp3bytes")

    sql, params = mock_cursor.execute.call_args[0]
    assert "child_id IS NOT NULL" in sql
    assert "00000000-0000-0000-0000-000000000001" in params
