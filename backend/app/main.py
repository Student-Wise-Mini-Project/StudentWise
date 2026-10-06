"""FastAPI application entrypoint."""

from collections.abc import Awaitable, Callable
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import (
    activity,
    ai,
    analytics,
    auth,
    balances,
    budgets,
    chat,
    comments,
    expenses,
    frontend,
    gmail,
    groups,
    ingested_bills,
    notifications,
    recurring_bills,
    settlements,
    split_rules,
    users,
)
from app.config import settings
from app.core.errors import AppError

app = FastAPI(
    title="StudentWise API",
    description="Expense splitting for shared apartments, couples and trips.",
    version="0.1.0",
)

if settings.cors_origins:
    # Development only by default: production serves the frontend from this
    # origin, so no browser needs a CORS grant there.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.middleware("http")
async def security_headers(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Headers every response carries, whatever produced it.

    `setdefault`, so an endpoint that needs something stricter keeps it. HSTS
    only in production: it tells the browser to refuse plain HTTP for a year,
    which on localhost would outlive the dev server.
    """
    response = await call_next(request)
    headers = response.headers
    headers.setdefault("X-Content-Type-Options", "nosniff")
    headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    # Nobody may put the app in a frame: a transparent StudentWise over a
    # "click here" button is how money gets moved without consent.
    headers.setdefault("X-Frame-Options", "DENY")
    if settings.environment == "production":
        headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


@app.exception_handler(AppError)
def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
    """Turn a service-layer error into a JSON response.

    This is why services never import HTTPException.
    """
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    """Liveness probe. Does not touch the database."""
    return {"status": "ok"}


app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(groups.router, prefix="/api")
app.include_router(expenses.group_router, prefix="/api")
app.include_router(expenses.router, prefix="/api")
app.include_router(settlements.group_router, prefix="/api")
app.include_router(settlements.router, prefix="/api")
app.include_router(comments.expense_router, prefix="/api")
app.include_router(comments.router, prefix="/api")
app.include_router(split_rules.router, prefix="/api")
app.include_router(budgets.router, prefix="/api")
app.include_router(recurring_bills.router, prefix="/api")
app.include_router(balances.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(activity.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(notifications.group_router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(gmail.router, prefix="/api")
app.include_router(ingested_bills.router, prefix="/api")
app.include_router(chat.group_router, prefix="/api")
app.include_router(chat.router, prefix="/api")

# The built frontend, for whatever no route above matched. The router's
# fallback rather than a catch-all route, so it can never shadow an endpoint --
# including one added below this line.
if settings.frontend_dist_dir:
    app.router.default = frontend.fallback(
        Path(settings.frontend_dist_dir), not_found=app.router.not_found
    )
