# =============================================================================
# Mindexa Platform — Multi-stage Dockerfile
# =============================================================================
#
# STAGES:
#   base      — Python + system deps (shared)
#   deps      — Install Python packages into a venv
#   runtime   — Minimal production image (no build tools)
#
# BUILD:
#   docker build -t mindexa-backend:latest .
#   docker build --target runtime -t mindexa-backend:prod .
#
# RUN:
#   docker run --env-file .env -p 8000:8000 mindexa-backend:latest
#
# SECURITY:
#   - Runs as non-root user (app:app, UID 1001)
#   - No build tools in the final image
#   - No .env file is baked into the image (always pass at runtime)
#   - Python bytecode is compiled at build time for faster startup
# =============================================================================

# ── Stage 1: base ─────────────────────────────────────────────────────────────
FROM python:3.12-slim AS base

# Prevent Python from writing .pyc files during build (we compile explicitly)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    # pip behaviour
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=100 \
    # venv location
    VENV_PATH=/opt/venv

# Install OS-level dependencies required by:
#   - asyncpg  → libpq
#   - bcrypt   → libffi
#   - Pillow   → libjpeg, zlib (if needed for image processing)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
        libffi8 \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Create app user (non-root)
RUN groupadd --gid 1001 app && \
    useradd --uid 1001 --gid app --shell /bin/bash --create-home app


# ── Stage 2: deps ─────────────────────────────────────────────────────────────
FROM base AS deps

# Build-time tools needed to compile C extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev \
        libffi-dev \
        gcc \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create virtualenv
RUN python -m venv $VENV_PATH
ENV PATH="$VENV_PATH/bin:$PATH"

# Install dependencies in layers for better cache utilisation
# Layer 1: core framework (changes rarely)
COPY requirements.txt /tmp/requirements.txt
RUN pip install --upgrade pip && \
    pip install -r /tmp/requirements.txt

# Pre-compile all .py files for faster container startup
RUN python -m compileall -q $VENV_PATH/lib


# ── Stage 3: runtime ──────────────────────────────────────────────────────────
FROM base AS runtime

LABEL org.opencontainers.image.title="Mindexa Platform Backend" \
      org.opencontainers.image.description="Academic assessment platform API" \
      org.opencontainers.image.version="1.0.0"

ENV VENV_PATH=/opt/venv
ENV PATH="$VENV_PATH/bin:$PATH"

# Copy the virtualenv from deps stage (no compiler toolchain in final image)
COPY --from=deps $VENV_PATH $VENV_PATH

# Create application directory
WORKDIR /app

# Copy application source
COPY --chown=app:app app/ ./app/
COPY --chown=app:app alembic/ ./alembic/
COPY --chown=app:app alembic.ini ./

# Pre-compile application code
RUN python -m compileall -q app/ alembic/

# Drop to non-root
USER app

# Expose port
EXPOSE 8000

# Health check (Docker engine polls this)
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8000/health/live || exit 1

# ── Entrypoint ────────────────────────────────────────────────────────────────
#
# Production: gunicorn with uvicorn workers
# The WORKERS env var can override the default (4)
#
CMD ["sh", "-c", \
     "gunicorn app.main:app \
      --worker-class uvicorn.workers.UvicornWorker \
      --workers ${WORKERS:-4} \
      --bind 0.0.0.0:${PORT:-8000} \
      --timeout 120 \
      --graceful-timeout 30 \
      --keep-alive 5 \
      --access-logfile - \
      --error-logfile - \
      --log-level ${LOG_LEVEL:-info}"]
