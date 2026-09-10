"""Application errors.

Services and repositories raise these; they never import FastAPI. `main.py`
registers a single handler that turns them into JSON responses.
"""


class AppError(Exception):
    """Base class for expected, user-facing failures."""

    status_code: int = 500

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class BadRequestError(AppError):
    status_code = 400


class UnauthorizedError(AppError):
    status_code = 401


class ForbiddenError(AppError):
    status_code = 403


class NotFoundError(AppError):
    status_code = 404


class ConflictError(AppError):
    status_code = 409


class ServiceUnavailableError(AppError):
    """A dependency this endpoint needs is not configured or is down."""

    status_code = 503
