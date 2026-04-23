import os
from unittest.mock import patch, MagicMock

import pytest

from backend.services.elevenlabs_convai import mint_signed_url, ElevenLabsError


@pytest.fixture(autouse=True)
def _env():
    os.environ["ELEVENLABS_API_KEY"] = "test-key"
    os.environ["ELEVENLABS_AGENT_ID"] = "agent-abc"
    yield


def test_mint_signed_url_posts_agent_id_and_overrides_and_returns_signed_url():
    overrides = {"agent": {"prompt": {"prompt": "be Belle"}}}

    fake_response = MagicMock()
    fake_response.status_code = 200
    fake_response.json.return_value = {
        "signed_url": "wss://api.elevenlabs.io/v1/convai/conversation?signature=abc",
        "conversation_id": "conv_123",
        "expires_at_unix_seconds": 1745000000,
    }

    with patch("backend.services.elevenlabs_convai.httpx.post", return_value=fake_response) as mock_post:
        result = mint_signed_url(overrides=overrides)

    mock_post.assert_called_once()
    call = mock_post.call_args
    assert "agent_id=agent-abc" in call.kwargs["params"].__repr__() or call.kwargs.get("params", {}).get("agent_id") == "agent-abc"
    assert call.kwargs["headers"]["xi-api-key"] == "test-key"
    assert call.kwargs["json"] == {"conversation_config_override": overrides}

    assert result.signed_url.startswith("wss://")
    assert result.conversation_id == "conv_123"
    assert result.expires_at_unix == 1745000000


def test_mint_signed_url_raises_on_non_2xx():
    fake_response = MagicMock()
    fake_response.status_code = 500
    fake_response.text = "ElevenLabs is on fire"

    with patch("backend.services.elevenlabs_convai.httpx.post", return_value=fake_response):
        with pytest.raises(ElevenLabsError) as exc:
            mint_signed_url(overrides={})

    assert "500" in str(exc.value)
