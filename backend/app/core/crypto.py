"""Encrypting secrets that have to be stored, such as Gmail refresh tokens.

Fernet: authenticated symmetric encryption, so a tampered ciphertext fails to
decrypt rather than decrypting to something else. The key lives in the
environment, never in the database it protects.
"""

from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings
from app.core.errors import ServiceUnavailableError


def encryption_configured() -> bool:
    return bool(settings.token_encryption_key)


@lru_cache(maxsize=4)
def _fernet(key: str) -> Fernet:
    return Fernet(key.encode())


def _current() -> Fernet:
    if not settings.token_encryption_key:
        raise ServiceUnavailableError(
            "Token encryption is not configured on this server (TOKEN_ENCRYPTION_KEY is not set)"
        )
    return _fernet(settings.token_encryption_key)


def encrypt(plaintext: str) -> str:
    return _current().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """Raises ServiceUnavailableError if the key changed since it was written."""
    try:
        return _current().decrypt(ciphertext.encode()).decode()
    except InvalidToken as error:
        raise ServiceUnavailableError(
            "A stored credential could not be decrypted; the encryption key has changed"
        ) from error
