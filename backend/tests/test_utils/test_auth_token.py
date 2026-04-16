import os
import pytest


@pytest.fixture(autouse=True)
def _auth_secret(monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", "test-secret-32-bytes-hex-placeholder")


def test_encode_decode_roundtrip():
    from backend.utils.auth_token import encode, decode
    token = encode(12345)
    assert decode(token) == 12345


def test_encode_is_deterministic():
    from backend.utils.auth_token import encode
    assert encode(42) == encode(42)


def test_encode_differs_per_chat_id():
    from backend.utils.auth_token import encode
    assert encode(1) != encode(2)


def test_decode_rejects_tampered_payload():
    from backend.utils.auth_token import encode, decode, InvalidTokenError
    token = encode(12345)
    payload_b64, sig = token.split(".", 1)
    # Swap for a different valid-looking payload but keep old signature
    tampered = encode(99999).split(".", 1)[0] + "." + sig
    with pytest.raises(InvalidTokenError):
        decode(tampered)


def test_decode_rejects_wrong_secret(monkeypatch):
    from backend.utils.auth_token import encode, decode, InvalidTokenError
    token = encode(12345)
    monkeypatch.setenv("AUTH_SECRET", "different-secret")
    # Clear module cache if module caches secret at import time
    import importlib, backend.utils.auth_token as at
    importlib.reload(at)
    with pytest.raises(InvalidTokenError):
        at.decode(token)


def test_decode_rejects_missing_signature():
    from backend.utils.auth_token import decode, InvalidTokenError
    with pytest.raises(InvalidTokenError):
        decode("no-dot-here")


def test_decode_rejects_malformed_b64():
    from backend.utils.auth_token import decode, InvalidTokenError
    with pytest.raises(InvalidTokenError):
        decode("!!!.!!!")


def test_decode_rejects_non_int_chat_id():
    from backend.utils.auth_token import _sign, InvalidTokenError, decode
    import base64, json
    # Craft a properly-signed payload whose chat_id is a string
    payload = json.dumps({"chat_id": "not-an-int"}, sort_keys=True).encode()
    payload_b64 = base64.urlsafe_b64encode(payload).rstrip(b"=").decode()
    sig_b64 = _sign(payload)
    token = f"{payload_b64}.{sig_b64}"
    with pytest.raises(InvalidTokenError):
        decode(token)


def test_decode_rejects_bool_chat_id():
    from backend.utils.auth_token import _sign, InvalidTokenError, decode
    import base64, json
    # Craft a signed payload where chat_id is a boolean (which is int subclass)
    payload = json.dumps({"chat_id": True}, sort_keys=True).encode()
    payload_b64 = base64.urlsafe_b64encode(payload).rstrip(b"=").decode()
    sig_b64 = _sign(payload)
    token = f"{payload_b64}.{sig_b64}"
    with pytest.raises(InvalidTokenError):
        decode(token)


def test_missing_auth_secret_raises(monkeypatch):
    monkeypatch.delenv("AUTH_SECRET", raising=False)
    import importlib, backend.utils.auth_token as at
    with pytest.raises(RuntimeError, match="AUTH_SECRET"):
        importlib.reload(at)
