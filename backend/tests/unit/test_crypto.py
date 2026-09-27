"""Stored credentials are encrypted, and a wrong key fails loudly."""

import pytest
from cryptography.fernet import Fernet

from app.config import settings
from app.core import crypto
from app.core.errors import ServiceUnavailableError


@pytest.fixture
def key(monkeypatch):
    value = Fernet.generate_key().decode()
    monkeypatch.setattr(settings, "token_encryption_key", value)
    return value


def test_round_trip(key):
    secret = "1//0g-refresh-token"
    ciphertext = crypto.encrypt(secret)
    assert secret not in ciphertext
    assert crypto.decrypt(ciphertext) == secret


def test_a_changed_key_is_an_error_not_garbage(key, monkeypatch):
    ciphertext = crypto.encrypt("secret")
    monkeypatch.setattr(settings, "token_encryption_key", Fernet.generate_key().decode())
    with pytest.raises(ServiceUnavailableError):
        crypto.decrypt(ciphertext)


def test_no_key_means_nothing_is_stored(monkeypatch):
    monkeypatch.setattr(settings, "token_encryption_key", None)
    assert crypto.encryption_configured() is False
    with pytest.raises(ServiceUnavailableError):
        crypto.encrypt("secret")
