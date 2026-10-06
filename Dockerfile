# StudentWise: the API and the built frontend, in one image (mission 10.3).
#
# One origin on purpose -- the frontend calls /api on its own host and the
# service worker caches by that path. See backend/app/api/frontend.py.
#
#   docker build -t studentwise .
#   docker run -p 8000:8000 --env-file prod.env studentwise
#
# Deploying it: docs/deployment.md.

# --- 1. the frontend ---------------------------------------------------------
FROM node:24-slim AS frontend
WORKDIR /frontend

# Dependencies first, so a code change does not re-download node_modules.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
RUN npm run build


# --- 2. the API, serving that build -----------------------------------------
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/ ./
COPY --from=frontend /frontend/dist ./static

# Never root: a bug that lets a request write a file should find nothing of
# the app's to write to.
RUN useradd --create-home --uid 10001 studentwise
USER studentwise

# Production defaults. Secrets are never baked in -- they come from the host's
# environment, and the app refuses to start without real ones.
ENV ENVIRONMENT=production \
    FRONTEND_DIST_DIR=/app/static \
    PORT=8000

EXPOSE 8000

# Migrate, then serve. Migrations run on every start, which is right for one
# instance on a free plan (the "pre-deploy command" is a paid feature) and a
# no-op when there is nothing new.
#
# --proxy-headers: the host terminates HTTPS and forwards plain HTTP; without
# trusting its X-Forwarded-Proto the app would believe it is on http://.
# --forwarded-allow-ips '*' is safe on Render ONLY because nothing but Render's
# proxy can reach the container. On a host where this port is public, anyone
# could claim to be https -- name the proxy's address there instead.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips '*'"]
