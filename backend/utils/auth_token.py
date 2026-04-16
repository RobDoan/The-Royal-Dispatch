"""HMAC-signed stateless tokens for parent onboarding URLs.

Token format: <b64url(payload)>.<b64url(hmac_sha256(payload, AUTH_SECRET))>
Payload: {"chat_id": <int>} JSON with sort_keys=True (deterministic bytes).
Deterministic — same chat_id + same secret always produces the same token.
"""
import base64
import hashlib
import hmac
import json
import os
import sys


# Preserve the exception class across importlib.reload() calls so that
# references captured before a reload still match the raised exception type.
_this_module = sys.modules.get(__name__)
if _this_module is not None and hasattr(_this_module, "InvalidTokenError"):
    InvalidTokenError = _this_module.InvalidTokenError  # type: ignore[assignment]
else:
    class InvalidTokenError(Exception):
        """Raised when a token fails validation (tampered, wrong secret, malformed)."""


def _load_secret() -> bytes:
    secret = os.environ.get("AUTH_SECRET")
    if not secret:
        raise RuntimeError("AUTH_SECRET environment variable is required")
    return secret.encode()


_SECRET = _load_secret()


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(data: str) -> bytes:
    padding = -len(data) % 4  # 0 when aligned, 1/2/3 otherwise
    return base64.urlsafe_b64decode(data + ("=" * padding))


def _sign(payload: bytes) -> str:
    sig = hmac.new(_SECRET, payload, hashlib.sha256).digest()
    return _b64url_encode(sig)


def encode(chat_id: int) -> str:
    """Produce a deterministic signed token for the given chat_id."""
    payload = json.dumps({"chat_id": int(chat_id)}, sort_keys=True).encode()
    return f"{_b64url_encode(payload)}.{_sign(payload)}"


def decode(token: str) -> int:
    """Verify signature and return chat_id; raise InvalidTokenError on any failure."""
    if not isinstance(token, str) or "." not in token:
        raise InvalidTokenError("Token must contain a '.' separator")
    payload_b64, sig_b64 = token.split(".", 1)
    try:
        payload_bytes = _b64url_decode(payload_b64)
    except Exception as exc:
        raise InvalidTokenError("Malformed payload base64") from exc
    expected_sig = _sign(payload_bytes)
    if not hmac.compare_digest(expected_sig, sig_b64):
        raise InvalidTokenError("Signature mismatch")
    try:
        data = json.loads(payload_bytes)
    except json.JSONDecodeError as exc:
        raise InvalidTokenError("Payload is not valid JSON") from exc
    chat_id = data.get("chat_id")
    if isinstance(chat_id, bool) or not isinstance(chat_id, int):
        raise InvalidTokenError("Payload chat_id must be an integer")
    return chat_id
