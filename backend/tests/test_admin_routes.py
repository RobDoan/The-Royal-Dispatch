import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from datetime import datetime

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


def make_client(mocker):
    from backend.main import app
    return TestClient(app)


def test_list_users_returns_empty_list(mocker):
    _make_mock_conn(mocker, "backend.routes.admin.get_conn", fetchall=[])
    client = make_client(mocker)
    response = client.get("/admin/users")
    assert response.status_code == 200
    assert response.json() == []


def test_list_users_returns_rows(mocker):
    _make_mock_conn(mocker, "backend.routes.admin.get_conn", fetchall=[
        # No token column in SELECT anymore
        ("uuid-1", "Quy", 12345, datetime(2026, 1, 1)),
    ])
    client = make_client(mocker)
    response = client.get("/admin/users")
    assert response.status_code == 200
    data = response.json()
    assert data[0]["name"] == "Quy"
    assert data[0]["telegram_chat_id"] == 12345
    # Token is computed, not from DB
    assert data[0]["token"].count(".") == 1


def test_create_user_returns_created_user(mocker):
    mock_cursor = _make_mock_conn(mocker, "backend.routes.admin.get_conn")
    mock_cursor.fetchone.side_effect = [
        None,  # Uniqueness check: no existing user
        # INSERT result — no token column
        ("uuid-1", "Quy", 12345, datetime(2026, 1, 1)),
    ]
    client = make_client(mocker)
    response = client.post("/admin/users", json={"name": "Quy", "telegram_chat_id": 12345})
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Quy"
    assert body["telegram_chat_id"] == 12345
    assert body["token"].count(".") == 1  # HMAC token shape


def test_create_user_rejects_missing_name(mocker):
    client = make_client(mocker)
    response = client.post("/admin/users", json={"telegram_chat_id": 12345})
    assert response.status_code == 422


def test_create_user_fails_if_telegram_chat_id_exists(mocker):
    _make_mock_conn(mocker, "backend.routes.admin.get_conn",
                    fetchone=("uuid-existing",))
    client = make_client(mocker)
    response = client.post("/admin/users", json={"name": "New User", "telegram_chat_id": 12345})
    assert response.status_code == 400
    assert response.json()["detail"] == "Telegram chat ID already in use"


def test_delete_user_returns_no_content(mocker):
    _make_mock_conn(mocker, "backend.routes.admin.get_conn", fetchone=("uuid-1",))
    client = make_client(mocker)
    response = client.delete("/admin/users/uuid-1")
    assert response.status_code == 204


def test_delete_user_returns_404_when_not_found(mocker):
    _make_mock_conn(mocker, "backend.routes.admin.get_conn", fetchone=None)
    client = make_client(mocker)
    response = client.delete("/admin/users/nonexistent-id")
    assert response.status_code == 404


def test_get_preferences_returns_config(mocker):
    _make_mock_conn(mocker, "backend.routes.admin.get_conn",
                    fetchone=("child-uuid-1", {"favorite_princesses": ["elsa", "belle"]}))
    client = make_client(mocker)
    response = client.get("/admin/children/child-uuid-1/preferences")
    assert response.status_code == 200
    assert response.json()["preferences"]["favorite_princesses"] == ["elsa", "belle"]


def test_get_preferences_returns_404_when_not_found(mocker):
    _make_mock_conn(mocker, "backend.routes.admin.get_conn", fetchone=None)
    client = make_client(mocker)
    response = client.get("/admin/children/child-uuid-999/preferences")
    assert response.status_code == 404


def test_put_preferences_upserts_and_returns_config(mocker):
    prefs = {"favorite_princesses": ["ariel"]}
    _make_mock_conn(mocker, "backend.routes.admin.get_conn",
                    fetchone=("child-uuid-1", prefs))
    client = make_client(mocker)
    response = client.put("/admin/children/child-uuid-1/preferences", json={"preferences": prefs})
    assert response.status_code == 200
    assert response.json()["preferences"]["favorite_princesses"] == ["ariel"]


def test_list_personas_returns_persona_ids(mocker):
    client = make_client(mocker)
    response = client.get("/admin/personas")
    assert response.status_code == 200
    data = response.json()
    ids = [p["id"] for p in data]
    assert "elsa" in ids
    assert "belle" in ids


def test_get_user_by_chat_id_returns_user(mocker):
    _make_mock_conn(mocker, "backend.routes.users.get_conn", fetchone=("uuid-1", "Quy"))
    client = make_client(mocker)
    response = client.get("/user/by-chat-id?chat_id=12345")
    assert response.status_code == 200
    assert response.json()["user_id"] == "uuid-1"


def test_get_user_by_chat_id_returns_404_for_unknown(mocker):
    _make_mock_conn(mocker, "backend.routes.users.get_conn", fetchone=None)
    client = make_client(mocker)
    response = client.get("/user/by-chat-id?chat_id=99999")
    assert response.status_code == 404


def test_post_story_without_user_id(mocker):
    mock_cursor = _make_mock_conn(mocker, "backend.routes.stories.get_conn")
    mock_cursor.fetchone.return_value = None
    mocker.patch.dict("os.environ", {"BACKEND_PUBLIC_URL": "https://api.example.com"})

    client = make_client(mocker)

    response = client.post("/story", json={
        "princess": "elsa",
        "child_id": "child-uuid-1",
    })
    assert response.status_code == 200
    assert response.json()["audio_url"].startswith("https://api.example.com/story/stream?")
    assert "child_id=child-uuid-1" in response.json()["audio_url"]


def test_get_story_detail_without_user_id(mocker):
    _make_mock_conn(mocker, "backend.routes.stories.get_conn",
                    fetchone=("https://s3.example.com/story.mp3", "Once upon a time...", "Be brave!"))
    client = make_client(mocker)
    response = client.get("/story/today/elsa?type=daily&child_id=child-uuid-1")
    assert response.status_code == 200
    data = response.json()
    assert data["story_text"] == "Once upon a time..."


def test_list_children_returns_children_with_users(mocker):
    mock_cursor = _make_mock_conn(mocker, "backend.routes.admin.get_conn")
    mock_cursor.fetchall.return_value = [
        ("child-1", "Emma", "America/Los_Angeles", {}, datetime(2026, 1, 1),
         "user-1", "Alice", "mom"),
    ]
    client = make_client(mocker)
    response = client.get("/admin/children")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Emma"
    assert len(data[0]["users"]) == 1
    assert data[0]["users"][0]["role"] == "mom"


def test_create_child_standalone(mocker):
    _make_mock_conn(mocker, "backend.routes.admin.get_conn",
                    fetchone=("child-1", "Emma", "America/Los_Angeles", {}, datetime(2026, 1, 1)))
    client = make_client(mocker)
    response = client.post("/admin/children", json={"name": "Emma"})
    assert response.status_code == 201
    assert response.json()["name"] == "Emma"


def test_link_user_to_child(mocker):
    mock_cursor = _make_mock_conn(mocker, "backend.routes.admin.get_conn")
    mock_cursor.fetchone.side_effect = [
        ("Emma",),
        None,
        ("user-1", "child-1", "mom", datetime(2026, 1, 1)),
    ]
    client = make_client(mocker)
    response = client.post("/admin/children/child-1/users", json={"user_id": "user-1", "role": "mom"})
    assert response.status_code == 201


def test_link_user_to_child_name_conflict(mocker):
    mock_cursor = _make_mock_conn(mocker, "backend.routes.admin.get_conn")
    mock_cursor.fetchone.side_effect = [
        ("Emma",),
        ("other-child",),
    ]
    client = make_client(mocker)
    response = client.post("/admin/children/child-1/users", json={"user_id": "user-1", "role": "mom"})
    assert response.status_code == 409


def test_unlink_user_from_child(mocker):
    _make_mock_conn(mocker, "backend.routes.admin.get_conn", fetchone=("user-1", "child-1"))
    client = make_client(mocker)
    response = client.delete("/admin/children/child-1/users/user-1")
    assert response.status_code == 204


def test_admin_lists_calls_for_child(client, mocker):
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_conn.__enter__.return_value = mock_conn
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur
    mocker.patch("backend.routes.admin.get_conn", return_value=mock_conn)

    rows = [
        (
            "call-1", "belle", "en", "completed", "user_ended",
            "2026-04-22T18:00:00+00:00", "2026-04-22T18:04:12+00:00", 252,
            [{"role": "user", "text": "hi"}],
        ),
        (
            "call-2", "elsa", "en", "completed", "timeout",
            "2026-04-22T12:00:00+00:00", "2026-04-22T12:05:00+00:00", 300,
            [{"role": "user", "text": "hello"}],
        ),
    ]
    mock_cur.fetchall.return_value = rows
    mock_cur.fetchone.return_value = (2,)

    resp = client.get("/admin/children/child-abc/calls")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2
    assert body["items"][0]["princess"] == "belle"
    assert body["items"][0]["transcript"][0]["text"] == "hi"
