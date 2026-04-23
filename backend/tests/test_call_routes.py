import os
import uuid
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("ELEVENLABS_API_KEY", "test-key")
os.environ.setdefault("ELEVENLABS_AGENT_ID", "agent-abc")
os.environ.setdefault("ELEVENLABS_WEBHOOK_SECRET", "test-webhook-secret")


@pytest.fixture
def client():
    from backend.main import app
    return TestClient(app)


@pytest.fixture
def mock_db(mocker):
    """Patch the psycopg get_conn so /call/start doesn't hit a real database."""
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_conn.__enter__.return_value = mock_conn
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur
    mocker.patch("backend.routes.call.get_conn", return_value=mock_conn)
    return mock_conn, mock_cur


@pytest.fixture
def signed_url_mock(mocker):
    from backend.services.elevenlabs_convai import SignedUrlResult
    return mocker.patch(
        "backend.routes.call.mint_signed_url",
        return_value=SignedUrlResult(
            signed_url="wss://eleven/conv?sig=abc",
            conversation_id="conv_123",
            expires_at_unix=1_745_000_000,
        ),
    )


@pytest.fixture
def fetch_memories_mock(mocker):
    return mocker.patch(
        "backend.routes.call.fetch_memories",
        return_value={"memories": "- loves dinosaurs\n- afraid of the dark"},
    )


CHILD_ID = str(uuid.uuid4())


def _child_lookup_row(princess_list=("belle",), name="Emma", tz="America/Los_Angeles"):
    """Simulate SELECT c.name, c.preferences, c.timezone returning (name, {favorite_princesses: [...]}, tz)."""
    return (name, {"favorite_princesses": list(princess_list)}, tz)


def _signed_token_for_chat(chat_id: int = 12345) -> str:
    from backend.utils.auth_token import encode
    return encode(chat_id)


def test_start_returns_signed_url(client, mock_db, signed_url_mock, fetch_memories_mock):
    _, cur = mock_db
    # 1) child lookup returns (name, preferences_dict, tz)
    # 2) daily cap count returns 0
    cur.fetchone.side_effect = [_child_lookup_row(("belle", "elsa")), (0,)]

    token = _signed_token_for_chat(12345)
    resp = client.post(
        "/call/start",
        json={"child_id": CHILD_ID, "princess": "belle", "locale": "en"},
        headers={"X-Auth-Token": token},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["signed_url"].startswith("wss://")
    assert body["conversation_id"] == "conv_123"
    assert body["princess_display_name"] == "Belle"
    assert body["max_duration_seconds"] == 300

    # Verify the override payload contained persona prompt + memories + voice + duration
    overrides = signed_url_mock.call_args.kwargs["overrides"]
    assert overrides["tts"]["voice_id"]  # belle's voice id from persona yaml
    prompt = overrides["agent"]["prompt"]["prompt"]
    assert "You are Belle" in prompt
    assert "loves dinosaurs" in prompt
    assert overrides["agent"]["first_message"].startswith("Hi Emma!")
    assert overrides["agent"]["language"] == "en"
    assert overrides["conversation"]["max_duration_seconds"] == 300


def test_start_localizes_for_vi(client, mock_db, signed_url_mock, fetch_memories_mock):
    _, cur = mock_db
    cur.fetchone.side_effect = [_child_lookup_row(("belle",)), (0,)]

    resp = client.post(
        "/call/start",
        json={"child_id": CHILD_ID, "princess": "belle", "locale": "vi"},
        headers={"X-Auth-Token": _signed_token_for_chat()},
    )

    assert resp.status_code == 200
    overrides = signed_url_mock.call_args.kwargs["overrides"]
    assert overrides["agent"]["language"] == "vi"
    assert overrides["agent"]["first_message"].startswith("Chào Emma!")
    assert "Bạn là Belle" in overrides["agent"]["prompt"]["prompt"]


def test_start_rejects_unknown_child(client, mock_db, signed_url_mock):
    _, cur = mock_db
    cur.fetchone.return_value = None  # child not found

    resp = client.post(
        "/call/start",
        json={"child_id": CHILD_ID, "princess": "belle", "locale": "en"},
        headers={"X-Auth-Token": _signed_token_for_chat()},
    )

    assert resp.status_code == 404
    signed_url_mock.assert_not_called()


def test_start_rejects_non_favorite_princess(client, mock_db, signed_url_mock):
    _, cur = mock_db
    cur.fetchone.return_value = _child_lookup_row(("elsa",))  # belle not in favorites

    resp = client.post(
        "/call/start",
        json={"child_id": CHILD_ID, "princess": "belle", "locale": "en"},
        headers={"X-Auth-Token": _signed_token_for_chat()},
    )

    assert resp.status_code == 403
    signed_url_mock.assert_not_called()


def test_start_enforces_daily_cap(client, mock_db, signed_url_mock, fetch_memories_mock):
    _, cur = mock_db
    cur.fetchone.side_effect = [_child_lookup_row(("belle",)), (3,)]  # 3 calls already today

    resp = client.post(
        "/call/start",
        json={"child_id": CHILD_ID, "princess": "belle", "locale": "en"},
        headers={"X-Auth-Token": _signed_token_for_chat()},
    )

    assert resp.status_code == 409
    assert resp.json()["detail"] == "daily_cap_reached"
    signed_url_mock.assert_not_called()


def test_start_handles_elevenlabs_failure(client, mock_db, fetch_memories_mock, mocker):
    from backend.services.elevenlabs_convai import ElevenLabsError
    mocker.patch("backend.routes.call.mint_signed_url", side_effect=ElevenLabsError("boom"))
    _, cur = mock_db
    cur.fetchone.side_effect = [_child_lookup_row(("belle",)), (0,)]

    resp = client.post(
        "/call/start",
        json={"child_id": CHILD_ID, "princess": "belle", "locale": "en"},
        headers={"X-Auth-Token": _signed_token_for_chat()},
    )

    assert resp.status_code == 503
    # Make sure the INSERT was not executed (no calls row inserted).
    insert_calls = [c for c in cur.execute.call_args_list if "INSERT INTO calls" in (c.args[0] if c.args else "")]
    assert not insert_calls
