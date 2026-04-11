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
    mocker.patch("backend.routes.stories.royal_graph")
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
        ("uuid-1", "Quy", 12345, "tk_abc", datetime(2026, 1, 1)),
    ])
    client = make_client(mocker)
    response = client.get("/admin/users")
    assert response.status_code == 200
    assert response.json()[0]["name"] == "Quy"


def test_create_user_returns_created_user(mocker):
    _make_mock_conn(mocker, "backend.routes.admin.get_conn",
                    fetchone=("uuid-1", "Quy", 12345, "tk_abc12345678def90", datetime(2026, 1, 1)))
    mocker.patch("backend.routes.admin.secrets.token_hex", return_value="abc12345678def90")
    client = make_client(mocker)
    response = client.post("/admin/users", json={"name": "Quy", "telegram_chat_id": 12345})
    assert response.status_code == 201
    assert response.json()["token"] == "tk_abc12345678def90"


def test_create_user_rejects_missing_name(mocker):
    client = make_client(mocker)
    response = client.post("/admin/users", json={"telegram_chat_id": 12345})
    assert response.status_code == 422


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
                    fetchone=("uuid-1", {"favorite_princesses": ["elsa", "belle"]}))
    client = make_client(mocker)
    response = client.get("/admin/users/uuid-1/preferences")
    assert response.status_code == 200
    assert response.json()["config"]["favorite_princesses"] == ["elsa", "belle"]


def test_get_preferences_returns_404_when_not_found(mocker):
    _make_mock_conn(mocker, "backend.routes.admin.get_conn", fetchone=None)
    client = make_client(mocker)
    response = client.get("/admin/users/uuid-999/preferences")
    assert response.status_code == 404


def test_put_preferences_upserts_and_returns_config(mocker):
    config = {"favorite_princesses": ["ariel"]}
    _make_mock_conn(mocker, "backend.routes.admin.get_conn",
                    fetchone=("uuid-1", config))
    client = make_client(mocker)
    response = client.put("/admin/users/uuid-1/preferences", json={"config": config})
    assert response.status_code == 200
    assert response.json()["config"]["favorite_princesses"] == ["ariel"]


def test_list_personas_returns_persona_ids(mocker):
    client = make_client(mocker)
    response = client.get("/admin/personas")
    assert response.status_code == 200
    data = response.json()
    ids = [p["id"] for p in data]
    assert "elsa" in ids
    assert "belle" in ids


def test_get_user_by_token_returns_user(mocker):
    mock_cursor = _make_mock_conn(mocker, "backend.routes.users.get_conn")
    mock_cursor.fetchone.side_effect = [
        ("uuid-1", "Quy"),
        ({"favorite_princesses": ["elsa"]},),
    ]
    client = make_client(mocker)
    response = client.get("/user/me?token=tk_abc")
    assert response.status_code == 200
    assert response.json()["user_id"] == "uuid-1"
    assert response.json()["config"]["favorite_princesses"] == ["elsa"]


def test_get_user_by_token_returns_404_for_unknown_token(mocker):
    _make_mock_conn(mocker, "backend.routes.users.get_conn", fetchone=None)
    client = make_client(mocker)
    response = client.get("/user/me?token=bad_token")
    assert response.status_code == 404


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
