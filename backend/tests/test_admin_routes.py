import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch


def make_client(mocker):
    mocker.patch("backend.main.royal_graph")
    from backend.main import app
    return TestClient(app)


def test_list_users_returns_empty_list(mocker):
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data = []
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
    client = make_client(mocker)
    response = client.get("/admin/users")
    assert response.status_code == 200
    assert response.json() == []


def test_list_users_returns_rows(mocker):
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data = [
        {"id": "uuid-1", "name": "Quy", "telegram_chat_id": 12345, "token": "tk_abc", "created_at": "2026-01-01T00:00:00Z"},
    ]
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
    client = make_client(mocker)
    response = client.get("/admin/users")
    assert response.status_code == 200
    assert response.json()[0]["name"] == "Quy"


def test_create_user_returns_created_user(mocker):
    created = {"id": "uuid-1", "name": "Quy", "telegram_chat_id": 12345, "token": "tk_abc12345678def90", "created_at": "2026-01-01T00:00:00Z"}
    mock_sb = MagicMock()
    mock_sb.table.return_value.insert.return_value.execute.return_value.data = [created]
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
    mocker.patch("backend.main.secrets.token_hex", return_value="abc12345678def90")
    client = make_client(mocker)
    response = client.post("/admin/users", json={"name": "Quy", "telegram_chat_id": 12345})
    assert response.status_code == 201
    assert response.json()["token"] == "tk_abc12345678def90"


def test_create_user_rejects_missing_name(mocker):
    client = make_client(mocker)
    response = client.post("/admin/users", json={"telegram_chat_id": 12345})
    assert response.status_code == 422


def test_delete_user_returns_no_content(mocker):
    mock_sb = MagicMock()
    mock_sb.table.return_value.delete.return_value.eq.return_value.execute.return_value.data = [{"id": "uuid-1"}]
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
    client = make_client(mocker)
    response = client.delete("/admin/users/uuid-1")
    assert response.status_code == 204


def test_delete_user_returns_404_when_not_found(mocker):
    mock_sb = MagicMock()
    mock_sb.table.return_value.delete.return_value.eq.return_value.execute.return_value.data = []
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
    client = make_client(mocker)
    response = client.delete("/admin/users/nonexistent-id")
    assert response.status_code == 404


def test_get_preferences_returns_config(mocker):
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"user_id": "uuid-1", "config": {"favorite_princesses": ["elsa", "belle"]}}
    ]
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
    client = make_client(mocker)
    response = client.get("/admin/users/uuid-1/preferences")
    assert response.status_code == 200
    assert response.json()["config"]["favorite_princesses"] == ["elsa", "belle"]


def test_get_preferences_returns_404_when_not_found(mocker):
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
    client = make_client(mocker)
    response = client.get("/admin/users/uuid-999/preferences")
    assert response.status_code == 404


def test_put_preferences_upserts_and_returns_config(mocker):
    config = {"favorite_princesses": ["ariel"]}
    mock_sb = MagicMock()
    mock_sb.table.return_value.upsert.return_value.execute.return_value.data = [
        {"user_id": "uuid-1", "config": config}
    ]
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
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
    users_mock = MagicMock()
    users_mock.select.return_value.eq.return_value.execute.return_value.data = [
        {"id": "uuid-1", "name": "Quy", "token": "tk_abc"}
    ]
    prefs_mock = MagicMock()
    prefs_mock.select.return_value.eq.return_value.execute.return_value.data = [
        {"user_id": "uuid-1", "config": {"favorite_princesses": ["elsa"]}}
    ]
    mock_sb = MagicMock()
    mock_sb.table.side_effect = lambda t: users_mock if t == "users" else prefs_mock
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
    client = make_client(mocker)
    response = client.get("/user/me?token=tk_abc")
    assert response.status_code == 200
    assert response.json()["user_id"] == "uuid-1"
    assert response.json()["config"]["favorite_princesses"] == ["elsa"]


def test_get_user_by_token_returns_404_for_unknown_token(mocker):
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
    client = make_client(mocker)
    response = client.get("/user/me?token=bad_token")
    assert response.status_code == 404


def test_get_user_by_chat_id_returns_user(mocker):
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"id": "uuid-1", "name": "Quy"}
    ]
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
    client = make_client(mocker)
    response = client.get("/user/by-chat-id?chat_id=12345")
    assert response.status_code == 200
    assert response.json()["user_id"] == "uuid-1"


def test_get_user_by_chat_id_returns_404_for_unknown(mocker):
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    mocker.patch("backend.main.get_supabase_client", return_value=mock_sb)
    client = make_client(mocker)
    response = client.get("/user/by-chat-id?chat_id=99999")
    assert response.status_code == 404
