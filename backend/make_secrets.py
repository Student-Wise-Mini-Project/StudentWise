"""Print fresh production secrets (mission 10.5).

    python make_secrets.py

Paste the output into the host's environment settings -- never into a file in
the repo. Run it once per environment: a staging server and production must not
share a JWT secret, or a token from one signs you in to the other.
"""

import secrets

from cryptography.fernet import Fernet


def main() -> None:
    # 48 random bytes, url-safe: well past the 32 bytes HS256 wants.
    print(f"JWT_SECRET={secrets.token_urlsafe(48)}")
    # Fernet needs its own format (32 url-safe base64 bytes), which is why a
    # host's "generate a value" button cannot make this one.
    print(f"TOKEN_ENCRYPTION_KEY={Fernet.generate_key().decode()}")


if __name__ == "__main__":
    main()
