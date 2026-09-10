"""Auth endpoint tests."""


def test_register_returns_token_and_user(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "Alice", "email": "alice@example.com", "password": "password123"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["email"] == "alice@example.com"
    assert "password_hash" not in body["user"]
    assert "password" not in body["user"]


def test_register_rejects_duplicate_email(client, alice):
    response = client.post(
        "/api/auth/register",
        json={"name": "Impostor", "email": "alice@example.com", "password": "password123"},
    )
    assert response.status_code == 409


def test_register_normalizes_email_case(client):
    client.post(
        "/api/auth/register",
        json={"name": "Alice", "email": "Alice@Example.COM", "password": "password123"},
    )
    duplicate = client.post(
        "/api/auth/register",
        json={"name": "Alice", "email": "alice@example.com", "password": "password123"},
    )
    assert duplicate.status_code == 409


def test_register_rejects_short_password(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "Alice", "email": "alice@example.com", "password": "short"},
    )
    assert response.status_code == 422


def test_login_succeeds(client, alice):
    response = client.post(
        "/api/auth/login",
        data={"username": "alice@example.com", "password": "password123"},
    )
    assert response.status_code == 200
    assert response.json()["access_token"]


def test_login_rejects_wrong_password(client, alice):
    response = client.post(
        "/api/auth/login",
        data={"username": "alice@example.com", "password": "wrong-password"},
    )
    assert response.status_code == 401


def test_login_rejects_unknown_email(client):
    response = client.post(
        "/api/auth/login",
        data={"username": "nobody@example.com", "password": "password123"},
    )
    assert response.status_code == 401


def test_me_returns_current_user(client, alice):
    _user, headers = alice
    response = client.get("/api/auth/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["email"] == "alice@example.com"


def test_me_requires_a_token(client):
    assert client.get("/api/auth/me").status_code == 401


def test_me_rejects_a_garbage_token(client):
    response = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert response.status_code == 401
