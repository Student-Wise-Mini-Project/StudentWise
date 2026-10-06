"""The built frontend, served from the API's own origin (mission 10.3).

One origin, not two: the frontend calls `/api` on whatever host it was loaded
from, and the service worker decides what to cache by that path. Serving both
from one place means no CORS grant, no second deploy, and one address to
register with Google for the Gmail redirect.

Not a route. It is the router's fallback -- what Starlette calls when *no*
route matched -- so it can never shadow an endpoint, wherever in `main.py`
someone adds their router. A catch-all route would have to stay last by
convention, and the failure (every GET of a new feature answering 404, in
production only) would be invisible to every test that does not build the
frontend.
"""

import base64
import hashlib
import re
from pathlib import Path

from starlette.requests import Request
from starlette.responses import FileResponse, HTMLResponse
from starlette.types import ASGIApp, Receive, Scope, Send

#: Vite fingerprints everything under assets/, and workbox's runtime carries its
#: own hash, so a changed file always has a new name: cache it for a year.
#: Anything else -- index.html, sw.js, the manifest, icons -- keeps its name
#: across deploys and must be revalidated, or a phone runs last week's app.
_IMMUTABLE = re.compile(r"^(assets/.+|workbox-[0-9a-f]+\.js)$")

_INLINE_SCRIPT = re.compile(r"<script>(.*?)</script>", re.DOTALL)


def content_security_policy(index_html: str) -> str:
    """The CSP for the app shell.

    Inline scripts are allowed by hash, computed from the built `index.html`
    itself, so editing the theme snippet there cannot silently break the policy
    (or tempt anyone into `'unsafe-inline'` for scripts). Styles do need
    `'unsafe-inline'`: React writes `style=` attributes, and those cannot be
    hashed. Google Fonts is the only third party the app loads.
    """
    hashes = [
        "'sha256-" + base64.b64encode(hashlib.sha256(body.encode()).digest()).decode() + "'"
        for body in _INLINE_SCRIPT.findall(index_html)
    ]
    directives = {
        "default-src": ["'self'"],
        "script-src": ["'self'", *hashes],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com"],
        # Receipts are fetched with the bearer token and shown as blob: URLs.
        "img-src": ["'self'", "data:", "blob:"],
        "connect-src": ["'self'"],
        "worker-src": ["'self'"],
        "manifest-src": ["'self'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'none'"],
    }
    return "; ".join(f"{name} {' '.join(values)}" for name, values in directives.items())


def fallback(dist: Path, not_found: ASGIApp) -> ASGIApp:
    """Serve `dist` for any request no route matched; otherwise `not_found`.

    `index.html` is read once, at startup: the build does not change under a
    running server, and a missing one should stop the deploy, not 500 every
    page.
    """
    root = dist.resolve()
    shell = (root / "index.html").read_text(encoding="utf-8")
    shell_headers = {
        "Cache-Control": "no-cache",
        "Content-Security-Policy": content_security_policy(shell),
    }

    async def app(scope: Scope, receive: Receive, send: Send) -> None:
        request = Request(scope)
        path = request.url.path.lstrip("/")

        # Only page loads. An unknown API path keeps the API's own JSON 404 --
        # the client would try to parse the HTML shell as JSON -- and HEAD is
        # included because uptime monitors ask with it, and a 405 reads as
        # "the site is down".
        if (
            scope["type"] != "http"
            or request.method not in {"GET", "HEAD"}
            or path == "api"
            or path.startswith("api/")
        ):
            await not_found(scope, receive, send)
            return

        file = (root / path).resolve()
        if path and file.is_relative_to(root) and file.is_file():
            cache = "public, max-age=31536000, immutable" if _IMMUTABLE.match(path) else "no-cache"
            response = FileResponse(file, headers={"Cache-Control": cache})
        elif "." in Path(path).name:
            # A missing script or icon. Answering with the HTML shell would be
            # executed as JavaScript and fail somewhere far from here.
            await not_found(scope, receive, send)
            return
        else:
            # A client-side route such as /groups/<id>: the shell, and React
            # Router takes it from there.
            response = HTMLResponse(shell, headers=shell_headers)
        await response(scope, receive, send)

    return app
