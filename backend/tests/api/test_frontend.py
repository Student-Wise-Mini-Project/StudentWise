"""Serving the built frontend, and the headers on every response (10.3, 10.6).

The frontend is served from a `dist/` directory, so these tests build a small
one rather than depending on `npm run build`.
"""

import base64
import hashlib

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import frontend
from app.config import settings
from app.core.errors import AppError
from app.main import handle_app_error

THEME_SCRIPT = "document.documentElement.dataset.theme = 'dark'"
SHELL = (
    "<!doctype html><html><head><script>"
    + THEME_SCRIPT
    + '</script><script type="module" src="/assets/index-abc123.js"></script></head>'
    "<body><div id=root></div></body></html>"
)


@pytest.fixture
def dist(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "icons").mkdir()
    (tmp_path / "index.html").write_text(SHELL, encoding="utf-8")
    (tmp_path / "assets" / "index-abc123.js").write_text("console.log('app')")
    (tmp_path / "sw.js").write_text("self.addEventListener('fetch', () => {})")
    (tmp_path / "workbox-03736e28.js").write_text("// workbox")
    (tmp_path / "manifest.webmanifest").write_text('{"name": "StudentWise"}')
    (tmp_path / "icons" / "pwa-192.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    (tmp_path.parent / "secret.txt").write_text("outside dist")
    return tmp_path


@pytest.fixture
def site_app(dist):
    """An app wired the way main.py wires it: one API route, and the frontend
    as the router's fallback."""
    app = FastAPI()
    app.add_exception_handler(AppError, handle_app_error)

    @app.get("/api/ping")
    def ping() -> dict[str, str]:
        return {"pong": "yes"}

    app.router.default = frontend.fallback(dist, not_found=app.router.not_found)
    return app


@pytest.fixture
def site(site_app):
    return TestClient(site_app)


# --- what is served ------------------------------------------------------


def test_the_root_is_the_app_shell(site):
    response = site.get("/")
    assert response.status_code == 200
    assert response.text == SHELL
    assert response.headers["content-type"].startswith("text/html")


def test_a_client_side_route_is_the_app_shell(site):
    """A refresh on /groups/<id> must not 404: React Router owns that path."""
    response = site.get("/groups/0b6f2c1e-1234-4bcd-9abc-1234567890ab/expenses")
    assert response.status_code == 200
    assert response.text == SHELL


def test_built_files_are_served_as_themselves(site):
    response = site.get("/assets/index-abc123.js")
    assert response.status_code == 200
    assert response.text == "console.log('app')"
    assert "javascript" in response.headers["content-type"]


def test_api_routes_still_win(site):
    assert site.get("/api/ping").json() == {"pong": "yes"}


def test_a_router_added_after_the_frontend_still_wins(site_app):
    """The merge that goes wrong: someone's new router lands below the
    frontend line in main.py. A catch-all route would answer its GETs with
    404 -- in production only, since tests do not build the frontend."""

    @site_app.get("/api/groups/{group_id}/chat")
    def chat(group_id: str) -> dict[str, str]:
        return {"conversation": group_id}

    response = TestClient(site_app).get("/api/groups/g1/chat")
    assert response.json() == {"conversation": "g1"}


def test_the_real_app_has_no_catch_all_route():
    """main.py attaches the frontend as the fallback, never as a route."""
    from app.main import app

    assert not [r for r in app.routes if "{path:path}" in getattr(r, "path", "")]


def test_a_wrong_method_is_still_405(site):
    assert site.post("/api/ping").status_code == 405


def test_a_write_to_a_page_path_is_not_the_page(site):
    assert site.post("/groups").status_code == 404


def test_an_unknown_api_path_is_a_json_404_not_the_page(site):
    """The client would try to parse the HTML shell as JSON."""
    response = site.get("/api/no-such-thing")
    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


def test_a_missing_file_is_a_404_not_the_page(site):
    """An old tab asking for last deploy's bundle must not be handed HTML to
    execute as JavaScript."""
    assert site.get("/assets/index-old999.js").status_code == 404


@pytest.mark.parametrize(
    "path", ["/../secret.txt", "/%2e%2e/secret.txt", "/assets/../../secret.txt"]
)
def test_nothing_outside_the_build_is_reachable(site, path):
    response = site.get(path)
    assert "outside dist" not in response.text


# --- caching: a phone must not run last week's app ------------------------


@pytest.mark.parametrize("path", ["/assets/index-abc123.js", "/workbox-03736e28.js"])
def test_fingerprinted_files_are_cached_for_good(site, path):
    assert site.get(path).headers["cache-control"] == "public, max-age=31536000, immutable"


@pytest.mark.parametrize(
    "path", ["/", "/groups", "/sw.js", "/manifest.webmanifest", "/icons/pwa-192.png"]
)
def test_files_that_keep_their_name_are_revalidated(site, path):
    """sw.js above all: a cached service worker pins every user to the old
    build until the cache expires."""
    assert site.get(path).headers["cache-control"] == "no-cache"


# --- the content security policy ------------------------------------------


def policy(site) -> dict[str, list[str]]:
    header = site.get("/").headers["content-security-policy"]
    return {
        name: values for name, *values in (directive.split() for directive in header.split("; "))
    }


def test_the_inline_theme_script_is_allowed_by_its_hash(site):
    digest = base64.b64encode(hashlib.sha256(THEME_SCRIPT.encode()).digest()).decode()
    assert f"'sha256-{digest}'" in policy(site)["script-src"]


def test_no_script_runs_unless_it_is_ours(site):
    scripts = policy(site)["script-src"]
    assert "'unsafe-inline'" not in scripts
    assert "'unsafe-eval'" not in scripts
    assert all(s == "'self'" or s.startswith("'sha256-") for s in scripts)


def test_the_app_may_not_be_framed(site):
    assert policy(site)["frame-ancestors"] == ["'none'"]


def test_google_fonts_is_the_only_third_party(site):
    sources = [source for values in policy(site).values() for source in values]
    third_parties = {source for source in sources if source.startswith("https://")}
    assert third_parties == {"https://fonts.googleapis.com", "https://fonts.gstatic.com"}


def test_the_policy_follows_the_built_shell():
    """Edit the theme snippet, rebuild, and the hash moves with it -- nobody
    has to remember to update a header."""
    one = frontend.content_security_policy("<script>a()</script>")
    two = frontend.content_security_policy("<script>b()</script>")
    assert one != two


# --- headers on every response of the real app ----------------------------


def test_every_api_response_carries_the_security_headers(client):
    headers = client.get("/health").headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert headers["referrer-policy"] == "strict-origin-when-cross-origin"


def test_hsts_only_in_production(client, monkeypatch):
    """On localhost a year of "HTTPS only" would outlive the dev server."""
    assert "strict-transport-security" not in client.get("/health").headers

    monkeypatch.setattr(settings, "environment", "production")
    assert client.get("/health").headers["strict-transport-security"] == (
        "max-age=31536000; includeSubDomains"
    )


def test_an_error_response_carries_them_too(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.headers["x-frame-options"] == "DENY"


@pytest.mark.parametrize("path", ["/", "/groups", "/assets/index-abc123.js"])
def test_head_is_answered_like_get(site, path):
    """Uptime monitors ask with HEAD; a 405 reads as "the site is down"."""
    get, head = site.get(path), site.head(path)
    assert head.status_code == 200
    assert head.headers["cache-control"] == get.headers["cache-control"]
    assert head.content == b""
