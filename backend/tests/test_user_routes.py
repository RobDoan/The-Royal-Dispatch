import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock
from datetime import datetime

_UNSET = object()


def _make_mock_conn(mocker, module_path, fetchone=_UNSET, fetchall=_UNSET):
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


def make_client(mocker):
    mocker.patch("backend.routes.stories.royal_graph")
    from backend.main import app
    return TestClient(app)


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", "test-secret-hex")
    monkeypatch.setenv("N8N_SHARED_SECRET", "n8n-shared")
    monkeypatch.setenv("FRONTEND_URL", "https://example.test")


def test_register_link_rejects_missing_secret(mocker):
    client = make_client(mocker)
    r = client.post("/user/register-link", json={"telegram_chat_id": 42})
    assert r.status_code == 401


def test_register_link_rejects_wrong_secret(mocker):
    client = make_client(mocker)
    r = client.post("/user/register-link", json={"telegram_chat_id": 42},
                    headers={"X-N8N-Secret": "wrong"})
    assert r.status_code == 401


def test_register_link_returns_token_and_url(mocker):
    client = make_client(mocker)
    r = client.post("/user/register-link", json={"telegram_chat_id": 42},
                    headers={"X-N8N-Secret": "n8n-shared"})
    assert r.status_code == 200
    body = r.json()
    assert body["token"].count(".") == 1
    assert body["onboarding_url"] == f"https://example.test/onboarding?token={body['token']}"


def test_register_link_is_deterministic(mocker):
    client = make_client(mocker)
    r1 = client.post("/user/register-link", json={"telegram_chat_id": 42},
                     headers={"X-N8N-Secret": "n8n-shared"})
    r2 = client.post("/user/register-link", json={"telegram_chat_id": 42},
                     headers={"X-N8N-Secret": "n8n-shared"})
    assert r1.json()["token"] == r2.json()["token"]


def test_register_link_rejects_when_secret_not_configured(mocker, monkeypatch):
    monkeypatch.delenv("N8N_SHARED_SECRET", raising=False)
    client = make_client(mocker)
    r = client.post("/user/register-link", json={"telegram_chat_id": 42},
                    headers={"X-N8N-Secret": "anything"})
    assert r.status_code == 401


def test_user_me_invalid_token_returns_401(mocker):
    client = make_client(mocker)
    r = client.get("/user/me?token=not-a-token")
    assert r.status_code == 401


def test_user_me_unknown_chat_id_returns_stub(mocker):
    _make_mock_conn(mocker, "backend.routes.users.get_conn", fetchone=None)
    client = make_client(mocker)
    from backend.utils.auth_token import encode
    token = encode(999)
    r = client.get(f"/user/me?token={token}")
    assert r.status_code == 200
    body = r.json()
    assert body == {"user_id": None, "name": None, "children": []}


def test_user_me_known_chat_id_returns_profile(mocker):
    mock_cursor = _make_mock_conn(mocker, "backend.routes.users.get_conn")
    mock_cursor.fetchone.return_value = ("uuid-user", "Parent Name")
    mock_cursor.fetchall.return_value = [
        ("uuid-child-1", "Emma", {"favorite_princesses": ["elsa", "belle"]}),
        ("uuid-child-2", "Lily", {"favorite_princesses": []}),
    ]
    client = make_client(mocker)
    from backend.utils.auth_token import encode
    token = encode(123)
    r = client.get(f"/user/me?token={token}")
    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == "uuid-user"
    assert body["name"] == "Parent Name"
    assert len(body["children"]) == 2
    assert body["children"][0]["name"] == "Emma"
    assert body["children"][0]["preferences"]["favorite_princesses"] == ["elsa", "belle"]
