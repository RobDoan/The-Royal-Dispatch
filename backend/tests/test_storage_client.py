import os
from unittest.mock import MagicMock


def test_get_storage_returns_singleton(mocker):
    mock_s3 = MagicMock()
    mocker.patch.dict(os.environ, {
        "S3_ACCESS_KEY": "test-key",
        "S3_SECRET_KEY": "test-secret",
        "S3_ENDPOINT_URL": "http://minio:9000",
    })
    mocker.patch("backend.storage.client.boto3.client", return_value=mock_s3)
    import backend.storage.client as storage_module
    storage_module._client = None
    from backend.storage.client import get_storage
    s1 = get_storage()
    s2 = get_storage()
    assert s1 is s2
    assert s1 is mock_s3
