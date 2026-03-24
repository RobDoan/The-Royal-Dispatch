from unittest.mock import MagicMock
import os
from backend.db.client import get_supabase_client

def test_get_supabase_client_returns_singleton(mocker):
    mock_client = MagicMock()
    mocker.patch.dict(os.environ, {
        "SUPABASE_URL": "https://test.supabase.co",
        "SUPABASE_SERVICE_KEY": "test-key",
    })
    mocker.patch("backend.db.client.create_client", return_value=mock_client)
    # Reset module-level singleton for test isolation
    import backend.db.client as db_module
    db_module._client = None
    client1 = get_supabase_client()
    client2 = get_supabase_client()
    assert client1 is client2
