"""FastAPI application entrypoint."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import auth, expenses, groups, settlements, users
from app.config import settings
from app.core.errors import AppError

app = FastAPI(
    title="StudentWise API",
    description="Expense splitting for shared apartments, couples and trips.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
