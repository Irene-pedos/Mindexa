# Mindexa Platform - Gemini Context

Mindexa is a secure academic assessment operating system designed for institutional use, featuring explainable AI grading and real-time integrity monitoring.

## Project Structure

- `backend/`: FastAPI application, database migrations, and AI logic.
- `frontend/`: Next.js 16 (React 19) web application.
- `docker-compose.yml`: Root configuration (Note: check `backend/docker-compose.yml` for primary service definitions).

## Tech Stack

### Backend
- **Framework:** FastAPI + Uvicorn
- **Database:** PostgreSQL 16 + pgvector (for RAG/Embeddings)
- **ORM:** SQLModel (SQLAlchemy 2.0 + Pydantic 2.0)
- **Background Tasks:** Celery + Redis 7
- **AI/LLM:** LangChain, LangGraph, OpenAI
- **Migrations:** Alembic

### Frontend
- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS 4, Framer Motion, Shadcn UI
- **State/Data:** TanStack Table, Lucide Icons

## Key Development Commands

### Backend (from `/backend`)
- **Setup:** `pip install -e ".[dev]"`
- **Start API:** `uvicorn app.main:app --reload`
- **Start Worker:** `celery -A app.workers.celery_app worker --loglevel=info --pool=solo` (Windows)
- **Migrations:** `alembic upgrade head`
- **Tests:** `pytest`

### Frontend (from `/frontend`)
- **Setup:** `npm install`
- **Dev:** `npm run dev`
- **Build:** `npm run build`
- **Lint:** `npm run lint`

## Development Conventions

1.  **Soft Deletes:** Use `is_deleted` column for all models; never perform hard deletes.
2.  **AI Governance:** All AI-generated output requires human review before it is finalized.
3.  **Structured Logging:** Use `structlog` for all events (e.g., `logger.info("event_name", key=value)`). No f-strings in logs.
4.  **Security:** Secrets must never be hardcoded. Use `app/core/config.py` (Pydantic Settings).
5.  **Repository Pattern:** Data access logic belongs in `app/db/repositories/`. Services should not call the database directly.
6.  **Type Safety:** Strict typing is enforced in the backend (mypy) and frontend (TypeScript).

## Critical Files
- `backend/app/main.py`: API Entry point and middleware configuration.
- `backend/app/core/config.py`: Centralized settings and environment variables.
- `frontend/app/layout.tsx`: Root layout and global providers.
- `backend/docker-compose.yml`: Primary infrastructure definition (Postgres, Redis).
