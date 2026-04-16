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


def test_put_user_me_rejects_invalid_token(mocker):
    client = make_client(mocker)
    r = client.put("/user/me?token=bogus", json={"name": "X", "children": []})
    assert r.status_code == 401


def test_put_user_me_requires_at_least_one_child(mocker):
    mocker.patch("backend.routes.users.list_personas_ids", return_value={"elsa", "belle"})
    client = make_client(mocker)
    from backend.utils.auth_token import encode
    token = encode(42)
    r = client.put(f"/user/me?token={token}", json={"name": "Parent", "children": []})
    assert r.status_code == 422


def test_put_user_me_rejects_empty_name(mocker):
    mocker.patch("backend.routes.users.list_personas_ids", return_value={"elsa"})
    client = make_client(mocker)
    from backend.utils.auth_token import encode
    token = encode(42)
    r = client.put(
        f"/user/me?token={token}",
        json={"name": "  ", "children": [{"id": None, "name": "Emma",
              "preferences": {"favorite_princesses": []}}]},
    )
    assert r.status_code == 422


def test_put_user_me_rejects_unknown_persona(mocker):
    mocker.patch("backend.routes.users.list_personas_ids", return_value={"elsa"})
    client = make_client(mocker)
    from backend.utils.auth_token import encode
    token = encode(42)
    r = client.put(
        f"/user/me?token={token}",
        json={"name": "Parent", "children": [{"id": None, "name": "Emma",
              "preferences": {"favorite_princesses": ["olaf"]}}]},
    )
    assert r.status_code == 422
    assert "olaf" in r.json()["detail"].lower()


def test_put_user_me_rejects_too_many_favorites(mocker):
    mocker.patch("backend.routes.users.list_personas_ids",
                 return_value={"a", "b", "c", "d", "e", "f"})
    client = make_client(mocker)
    from backend.utils.auth_token import encode
    token = encode(42)
    r = client.put(
        f"/user/me?token={token}",
        json={"name": "Parent", "children": [{"id": None, "name": "Emma",
              "preferences": {"favorite_princesses": ["a", "b", "c", "d", "e", "f"]}}]},
    )
    assert r.status_code == 422


def test_put_user_me_initial_onboarding_creates_user_and_children(mocker):
    mocker.patch("backend.routes.users.list_personas_ids", return_value={"elsa", "belle"})
    mocker.patch("backend.routes.users.delete_child_memories")  # no-op
    mock_cursor = _make_mock_conn(mocker, "backend.routes.users.get_conn")
    # Sequence of fetchone() calls during PUT transaction:
    # 1. SELECT existing user by chat_id → None (new)
    # 2. INSERT users RETURNING → ("uuid-user", "Parent Name")
    # 3. INSERT children RETURNING → ("uuid-child-1",)
    # 4. Final SELECT user for response → ("uuid-user", "Parent Name")
    mock_cursor.fetchone.side_effect = [
        None,
        ("uuid-user", "Parent Name"),
        ("uuid-child-1",),
        ("uuid-user", "Parent Name"),
    ]
    # Final SELECT children returns the newly-linked child
    mock_cursor.fetchall.side_effect = [
        [],  # existing children before reconcile
        [("uuid-child-1", "Emma", {"favorite_princesses": ["elsa"]})],  # final read
    ]
    client = make_client(mocker)
    from backend.utils.auth_token import encode
    token = encode(42)
    r = client.put(
        f"/user/me?token={token}",
        json={
            "name": "Parent Name",
            "children": [{"id": None, "name": "Emma",
                          "preferences": {"favorite_princesses": ["elsa"]}}],
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == "uuid-user"
    assert body["name"] == "Parent Name"
    assert body["children"][0]["name"] == "Emma"


def test_put_user_me_edit_removes_child(mocker):
    mocker.patch("backend.routes.users.list_personas_ids", return_value={"elsa"})
    mock_mem = mocker.patch("backend.routes.users.delete_child_memories")
    mock_cursor = _make_mock_conn(mocker, "backend.routes.users.get_conn")
    mock_cursor.fetchone.side_effect = [
        ("uuid-user", "Parent Name"),  # existing user
        ("uuid-user", "Parent Name"),  # UPDATE users RETURNING
        ("uuid-user", "Parent Name"),  # final SELECT user
    ]
    mock_cursor.fetchall.side_effect = [
        [("uuid-child-1",), ("uuid-child-2",)],  # existing linked children
        [("uuid-child-1", "Emma", {"favorite_princesses": []})],  # final read
    ]
    client = make_client(mocker)
    from backend.utils.auth_token import encode
    token = encode(42)
    r = client.put(
        f"/user/me?token={token}",
        json={
            "name": "Parent Name",
            "children": [
                {"id": "uuid-child-1", "name": "Emma",
                 "preferences": {"favorite_princesses": []}},
            ],
        },
    )
    assert r.status_code == 200
    mock_mem.assert_called_once_with("uuid-child-2")


def test_put_user_me_rejects_duplicate_child_name(mocker):
    mocker.patch("backend.routes.users.list_personas_ids", return_value={"elsa"})
    client = make_client(mocker)
    from backend.utils.auth_token import encode
    token = encode(42)
    r = client.put(
        f"/user/me?token={token}",
        json={
            "name": "Parent",
            "children": [
                {"id": None, "name": "Emma", "preferences": {"favorite_princesses": []}},
                {"id": None, "name": "Emma", "preferences": {"favorite_princesses": []}},
            ],
        },
    )
    assert r.status_code == 409
