# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mindexa is a full-stack educational platform with AI-powered assessment, grading, and study tools. It is a monorepo with a FastAPI backend and a Next.js 16 frontend.

---

## Commands

### Backend (`backend/`)

```bash
# Activate virtualenv (Windows)
.venv\Scripts\Activate.ps1

# Dev server
uvicorn app.main:app --reload --port 8000

# Celery worker (Windows uses --pool=solo)
celery -A app.workers.celery_app worker --pool=solo -l info --queues=default,grading,email,cleanup,high_priority,rag

# Celery Beat scheduler
celery -A app.workers.celery_app beat -l info

# Migrations
alembic upgrade head
alembic revision --autogenerate -m "description"
alembic downgrade -1

# Tests
pytest
pytest -v -k "test_name"        # single test
pytest --cov=app                # with coverage

# Lint / format / type check
ruff check app
ruff format app
mypy app
```

### Frontend (`frontend/`)

```bash
npm run dev      # localhost:3000
npm run build
npm run lint
```

### Infrastructure

```bash
# From repo root — starts PostgreSQL 16 + pgvector and Redis 7
docker-compose up -d
```

---

## Architecture

### Backend (`backend/app/`)

| Directory | Purpose |
|---|---|
| `api/v1/routes/` | FastAPI routers — thin, delegates to services |
| `db/repositories/` | All DB queries (repository pattern) |
| `db/models/` | SQLModel ORM models |
| `db/schemas/` | Pydantic request/response schemas |
| `services/` | Business logic (AuthService, AssessmentService, …) |
| `workers/` | Celery task definitions |
| `agents/` | LangChain/LangGraph AI agent implementations |
| `core/` | Config, structured logging, exceptions, Celery factory |
| `dependencies/` | FastAPI DI (auth guards: `CurrentUser`, `ActiveUser`, `VerifiedUser`) |
| `middleware/` | CORS → Security Headers → Request Logging → Rate Limiting |

**Key patterns:**
- **ORM:** SQLModel (SQLAlchemy 2 async + Pydantic 2). Use `AsyncSessionLocal`; Celery workers use `NullPool`.
- **Soft deletes:** Every model has `is_deleted: bool` + deletion timestamp — never hard-delete rows.
- **Logging:** structlog with key-value pairs. Always `logger.info("event", key=value)` — never f-strings in log calls.
- **Rate limits:** login 5/min, AI endpoints 20/min, student AI support 30/hr, default 120/min.
- **Celery queues:** `default`, `grading`, `email`, `cleanup`, `high_priority`, `rag`. Task soft limit 5 min, hard 6 min.

### Authentication

- JWT access + refresh token rotation. Access tokens expire in 7 days, refresh in 30 days.
- Refresh token stored in `mindexa_refresh_token` cookie (httpOnly).
- Account lockout after 5 failed login attempts (15-minute window).
- Use the DI guards in route signatures — never roll custom auth checks inside route handlers.

### Frontend (`frontend/`)

- **Router:** Next.js App Router. Pages are organized under `app/(admin)/`, `app/(lecturer)/`, `app/(student)/`.
- **UI:** Shadcn + Radix UI + HeroUI components, Tailwind CSS 4.
- **Data:** API calls via helpers in `lib/`. Tables use TanStack Table; charts use Recharts.
- **Forms/Validation:** Zod schemas.
- **Animations:** Framer Motion — follow patterns in `UI_GUIDELINES.md`.
- **Math/Code:** KaTeX for rendering, MathLive for input, Mermaid for diagrams.

### AI / Agents

- LangChain + LangGraph for multi-step AI agents (assessment generation, grading, study planner).
- pgvector extension on PostgreSQL for RAG embeddings.
- AI-generated content requires human review before production promotion (`AGENTS.md` describes governance).

---

## Development Conventions

- **Repository pattern is mandatory** — all DB queries live in `app/db/repositories/`, not in routes or services.
- **No direct DB access in routes** — always use the injected session from dependencies.
- **Strict types** — MyPy strict mode on backend; TypeScript (no `any`) on frontend.
- **Structured logging** — import from `app.core.logging`, use bound loggers, key-value style.
- **API versioning** — all endpoints are under `/api/v1`.
- **Alembic migrations** — every schema change needs a migration; never modify an already-applied migration file.
