import pytest
from unittest.mock import MagicMock, patch

@pytest.fixture
def mock_supabase(mocker):
    mock = MagicMock()
    mocker.patch("backend.db.client.create_client", return_value=mock)
    return mock
