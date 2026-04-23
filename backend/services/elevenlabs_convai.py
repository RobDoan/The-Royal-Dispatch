"""Thin wrapper over ElevenLabs Conversational AI signed-URL minting.

Kept narrow on purpose: one function, one exception type, easy to mock.
"""
import logging
import os
from dataclasses import dataclass

import httpx

from backend.utils.metrics import external_api_calls

logger = logging.getLogger(__name__)


class ElevenLabsError(Exception):
    """Raised when ElevenLabs Convai returns a non-2xx response."""


@dataclass
class SignedUrlResult:
    signed_url: str
    conversation_id: str
    expires_at_unix: int


_SIGNED_URL_ENDPOINT = "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url"


def mint_signed_url(overrides: dict, timeout_s: float = 10.0) -> SignedUrlResult:
    """Mint a single-use signed WebSocket URL for a new Convai conversation.

    `overrides` must follow ElevenLabs' `conversation_config_override` schema
    (agent prompt/first_message/language, tts voice_id, conversation max_duration).
    """
    api_key = os.environ["ELEVENLABS_API_KEY"]
    agent_id = os.environ["ELEVENLABS_AGENT_ID"]

    try:
        response = httpx.post(
            _SIGNED_URL_ENDPOINT,
            params={"agent_id": agent_id},
            headers={"xi-api-key": api_key},
            json={"conversation_config_override": overrides},
            timeout=timeout_s,
        )
    except httpx.TimeoutException:
        external_api_calls.labels(provider="elevenlabs", outcome="timeout").inc()
        raise
    except Exception:
        external_api_calls.labels(provider="elevenlabs", outcome="error").inc()
        raise

    if response.status_code < 200 or response.status_code >= 300:
        external_api_calls.labels(provider="elevenlabs", outcome="error").inc()
        raise ElevenLabsError(
            f"ElevenLabs mint_signed_url returned {response.status_code}: {response.text[:200]}"
        )
    external_api_calls.labels(provider="elevenlabs", outcome="ok").inc()

    body = response.json()
    return SignedUrlResult(
        signed_url=body["signed_url"],
        conversation_id=body["conversation_id"],
        expires_at_unix=body["expires_at_unix_seconds"],
    )
