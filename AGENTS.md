# Repository Guidelines

## Project Structure & Module Organization
This repository has two main apps:

- `frontend/`: Next.js 16 App Router UI. Pages live in `frontend/app/`, shared UI in `frontend/components/`, client helpers in `frontend/lib/`, hooks in `frontend/hooks/`, and static assets in `frontend/public/`.
- `backend/`: FastAPI service. Entry point is `backend/app/main.py`; API routes live in `backend/app/api/v1/routes/`, business logic in `backend/app/services/`, persistence in `backend/app/db/`, and migrations in `backend/alembic/`.

Tests are currently backend-only under `backend/tests/unit/` and `backend/tests/integration/`.

## Build, Test, and Development Commands
Run commands from the relevant app directory, not the repo root.

- `cd frontend; npm run dev`: start the Next.js dev server on `localhost:3000`.
- `cd frontend; npm run build`: build the production frontend.
- `cd frontend; npm run lint`: run ESLint with the Next.js config.
- `cd backend; pip install -e ".[dev]"`: install the API and developer tooling.
- `cd backend; uvicorn app.main:app --reload --port 8000`: run the FastAPI server locally.
- `cd backend; pytest`: run all backend tests.
- `cd backend; pytest --cov=app`: run tests with coverage.
- `cd backend; alembic upgrade head`: apply database migrations.

## Coding Style & Naming Conventions
Frontend code uses TypeScript, 2-space indentation, PascalCase component files such as `HeroSection.tsx`, and camelCase utilities/hooks such as `use-auth.ts`. Prefer `@/` imports where already configured.

Backend code targets Python 3.11 with Ruff and strict MyPy settings from `backend/pyproject.toml`. Use 4-space indentation, snake_case module names, explicit type hints, and keep route, service, and repository layers separate.

## Testing Guidelines
Backend tests use `pytest`, `pytest-asyncio`, and `pytest-cov`. Name files `test_*.py` and mirror the feature area under test, for example `tests/integration/test_auth.py`. Add unit tests for service or utility changes and integration coverage for API behavior. The frontend currently has no committed automated test suite, so at minimum run `npm run lint` before submitting.

## Commit & Pull Request Guidelines
Recent history uses short, plain-language commit messages rather than a strict conventional format. Keep commits focused and descriptive, for example `backend: fix auth token validation` or `frontend: refine student dashboard`.

PRs should include a clear summary, affected areas (`frontend`, `backend`, or both), linked issues when available, and screenshots for UI changes. Call out migration, environment, or seed-data requirements explicitly.

## Configuration Notes
Keep secrets in local `.env` files and out of version control. Be aware that the repo-root `docker-compose.yml` differs from `backend/docker-compose.yml`, so use the compose file that matches the service you are working on.
