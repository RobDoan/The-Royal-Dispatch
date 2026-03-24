import os
import pytest
from unittest.mock import MagicMock

@pytest.fixture
def mock_supabase(mocker):
    mock = MagicMock()
    # Reset the singleton so the mock is used, not a previously-created client
    import backend.db.client as db_module
    db_module._client = None
    # Ensure env vars are set so os.environ[] lookups don't raise KeyError
    mocker.patch.dict(os.environ, {
        "SUPABASE_URL": "https://test.supabase.co",
        "SUPABASE_SERVICE_KEY": "test-key",
    })
    mocker.patch("backend.db.client.create_client", return_value=mock)
    return mock
