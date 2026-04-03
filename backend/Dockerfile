# ─────────────────────────────────────────────────────────────────────────────
# Mindexa Platform – Multi-stage Dockerfile
#
# Stages:
#   base        — Python + system dependencies
#   development — Used by docker-compose for containerised local dev
#   production  — Minimal, non-root, no dev tools
#
# All Linux paths inside the container (/app, /opt/venv, etc.) are correct
# and intentional — they refer to the container filesystem, not your Windows host.
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.11-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    libmupdf-dev \
    libxml2-dev \
    libxslt1-dev \
    libjpeg-dev \
    libpng-dev \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY pyproject.toml ./

RUN pip install --upgrade pip setuptools wheel \
    && pip install -e ".[dev]"


# ── Development ───────────────────────────────────────────────────────────────
FROM base AS development

ENV ENVIRONMENT=development \
    DEBUG=true

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--reload", "--log-config", "/dev/null"]


# ── Production ────────────────────────────────────────────────────────────────
FROM base AS production

ENV ENVIRONMENT=production \
    DEBUG=false

RUN groupadd --gid 1001 mindexa \
    && useradd --uid 1001 --gid mindexa --shell /bin/bash --create-home mindexa

COPY --chown=mindexa:mindexa app/ ./app/
COPY --chown=mindexa:mindexa alembic/ ./alembic/
COPY --chown=mindexa:mindexa alembic.ini ./

RUN mkdir -p /app/uploads && chown mindexa:mindexa /app/uploads

USER mindexa

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/health/live || exit 1

CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4", \
     "--log-config", "/dev/null", \
     "--no-access-log", \
     "--proxy-headers", \
     "--forwarded-allow-ips", "*"]
