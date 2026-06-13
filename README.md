# Mindexa Platform

Mindexa is a secure academic assessment operating system designed for institutional use, featuring explainable AI grading and real-time integrity monitoring.

---

## Table of Contents
1. [Project Structure](#project-structure)
2. [Tech Stack](#tech-stack)
3. [Getting Started & Installation](#getting-started--installation)
4. [Running the Application](#running-the-application)
5. [Database & Migrations](#database--migrations)
6. [Testing & Linting](#testing--linting)
7. [Development Conventions](#development-conventions)
8. [Configuration Notes](#configuration-notes)

---

## Project Structure

This repository is split into two primary applications:

```
mindexa/
├── backend/            # FastAPI backend, Celery workers, Alembic migrations
│   ├── app/            # Main application source code
│   │   ├── api/        # API route handlers
│   │   ├── db/         # SQLModel database models and repositories
│   │   ├── services/   # Business logic layer
│   │   └── workers/    # Celery tasks and background queues
│   ├── alembic/        # Alembic database migration scripts
│   └── tests/          # Pytest unit and integration suites
│
├── frontend/           # Next.js 16 frontend
│   ├── app/            # App Router pages and layouts
│   ├── components/     # UI components (Shadcn + Tailwind)
│   ├── hooks/          # React hooks
│   ├── lib/            # Helper utilities and API clients
│   └── public/         # Static assets
│
└── docker-compose.yml  # Root configuration (infrastructure only)
```

---

## Tech Stack

### Backend
- **Framework:** FastAPI + Uvicorn
- **Database:** PostgreSQL 16 + pgvector (for RAG/Embeddings)
- **ORM:** SQLModel (SQLAlchemy 2.0 + Pydantic 2.0)
- **Background Tasks:** Celery + Redis 7
- **AI/LLM:** LangChain, LangGraph, OpenAI
- **Migrations:** Alembic

### Frontend
- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript
- **Styling:** Tailwind CSS 4 + Framer Motion + Shadcn UI
- **State/Data:** TanStack Table + Lucide Icons

---

## Getting Started & Installation

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv .venv
   # Windows:
   .venv\Scripts\activate
   # macOS/Linux:
   source .venv/bin/activate
   ```
3. Install the application and developer tools:
   ```bash
   pip install -e ".[dev]"
   ```
4. Copy the environment template and configure secrets:
   ```bash
   cp .env.example .env
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install npm dependencies:
   ```bash
   npm install
   ```

---

## Running the Application

Always run service commands from their respective directories (`/frontend` or `/backend`), not the repo root.

### 1. Database & Infrastructure
Start the required PostgreSQL and Redis services:
```bash
# From the repo root or /backend depending on the configuration
docker-compose up -d
```

### 2. Run Backend API
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```
The FastAPI documentation will be available at `http://localhost:8000/docs`.

### 3. Run Celery Workers
For background AI and grading jobs:
- **Windows (Single thread pool):**
  ```bash
  cd backend
  celery -A app.workers.celery_app worker --loglevel=info --pool=solo
  ```
- **macOS/Linux:**
  ```bash
  cd backend
  celery -A app.workers.celery_app worker --loglevel=info
  ```

### 4. Run Frontend Development Server
```bash
cd frontend
npm run dev
```
The frontend UI will be accessible at `http://localhost:3000`.

---

## Database & Migrations

Alembic handles database migrations:

- **Create a migration:**
  ```bash
  cd backend
  alembic revision --autogenerate -m "describe_changes"
  ```
- **Apply migrations to head:**
  ```bash
  cd backend
  alembic upgrade head
  ```
- **Revert migrations:**
  ```bash
  cd backend
  alembic downgrade -1
  ```

---

## Testing & Linting

### Backend
Backend tests target Python 3.11 with Ruff and strict MyPy settings.
- **Run all unit & integration tests:**
  ```bash
  cd backend
  pytest
  ```
- **Run tests with coverage:**
  ```bash
  cd backend
  pytest --cov=app
  ```

### Frontend
Frontend code uses TypeScript and 2-space indentation.
- **Run ESLint check:**
  ```bash
  cd frontend
  npm run lint
  ```
- **Run production build:**
  ```bash
  cd frontend
  npm run build
  ```

---

## Development Conventions

1. **Soft Deletes:** Ensure all models use `is_deleted: bool` and a deletion timestamp. Never perform hard deletes in the database.
2. **AI Governance:** All AI-generated output requires human review before it is finalized or promoted to production schemas.
3. **Structured Logging:** Use `structlog` for all application events. Avoid python f-strings in logs; instead, pass variables as key-value keyword arguments:
   ```python
   logger.info("user_login_success", user_id=user.id)
   ```
4. **Repository Pattern:** Do not call database queries directly inside service layers. Encapsulate all database interaction inside `app/db/repositories/`.
5. **Type Safety:** Maintain strict TypeScript types in the frontend and explicit type hints with MyPy in the backend.

---

## Configuration Notes

- **Environment Variables:** Keep all secrets and configurations in local `.env` files (ignored by git). Define schema configurations in `backend/app/core/config.py` using Pydantic Settings.
- **Docker Compose:** Be aware that the repo-root `docker-compose.yml` differs from `backend/docker-compose.yml` (the root compose focuses on standard third-party services, e.g., postgres, redis). Ensure you run commands from the environment that fits the service under development.
