# Mindexa Backend Workspace Instructions

---

name: mindexa-backend
description: Comprehensive workspace instructions for the Mindexa backend — FastAPI-based assessment platform with PostgreSQL, Celery, and AI integration. Covers architecture, patterns, commands, and best practices.

---

## Project Overview

Mindexa is a comprehensive assessment platform built with FastAPI, PostgreSQL, Celery, and AI integration. The backend handles user authentication, assessment creation/management, question generation, grading, and integrity monitoring.

## Architecture & Layering

- **Stack:** FastAPI + PostgreSQL + Celery + LangChain + structlog
- **Async-first:** All handlers, services, repos use `async/await`; built on SQLAlchemy 2.0 async
- **Layering:** Routes → Dependencies → Services → Repositories → SQLModel
- **Transactions:** Services **never call `db.commit()`** — boundary is `get_db()` or Celery tasks
- **No raw SQL:** Everything uses SQLAlchemy `select()`/`insert()`/`update()`

## Project Structure & Module Organization

`app/` contains the backend application. Use `app/main.py` as the API entry point. Keep HTTP handlers in `app/api/v1/routes/`, business logic in `app/services/`, persistence code in `app/db/repositories/`, and SQLModel models and schemas in `app/db/models/` and `app/db/schemas/`. Shared platform concerns live in `app/core/` and small helpers in `app/utils/`.

`alembic/` stores database migration config and version files. `tests/` is split into `tests/unit/` and `tests/integration/`. Docker and local infra files are in the repo root, and `scripts/db/init.sql` seeds PostgreSQL extensions or init-time setup. `uploads/` is runtime storage and should not hold committed assets.

## Build, Test, and Development Commands

- `pip install -e ".[dev]"` installs the app and development tooling.
- `docker compose up -d postgres redis` starts local dependencies.
- `alembic upgrade head` applies the latest schema migrations.
- `uvicorn app.main:app --reload --port 8000` runs the API locally.
- `celery -A app.workers.celery_app worker --loglevel=info --pool=solo` runs a worker on Windows.
- `pytest` runs the full test suite.
- `pytest tests/unit -v` or `pytest tests/integration -v` runs a focused subset.
- `pytest --cov=app --cov-report=html` generates coverage output in `htmlcov/`.
- `ruff check . && mypy app` for code quality checks.

## Coding Style & Naming Conventions

Target Python 3.11 with 4-space indentation and type hints throughout. Follow the existing layering: routes stay thin, services own business rules, repositories do not commit transactions. Use `snake_case` for modules, functions, and variables; `PascalCase` for classes and Pydantic/SQLModel types.

Ruff is configured with a 100-character line length, and mypy runs in strict mode. Before opening a PR, run `ruff check .` and `mypy app`.

## Security & Auth Patterns

- **JWT:** HS256, 30-min access + 7-day refresh with token rotation
- **Passwords:** bcrypt (12 rounds) + timing-attack-resistant dummy verify
- **Composable guards:** `require_admin()` applies all lower checks automatically
- **Email normalization:** Always lowercase + stripped (prevents duplicate accounts)

## Exception Hierarchy

```python
MindexaError (base)
├── AuthenticationError (401)
├── AuthorizationError (403)
├── NotFoundError (404)
├── AlreadyExistsError (409)
├── ValidationError (422)
└── RateLimitError (429)
```

## Database Patterns

- **Three model bases:** `BaseModel` (standard), `AuditedBaseModel` (track creator), `AppendOnlyModel` (immutable ledgers)
- **Soft-delete:** Always filter `is_deleted == False` (except admin endpoints)
- **Pagination:** Enforced in repositories — no unbounded queries
- **Enums:** Defined in `core/constants.py` AND mirrored in `db/enums.py`

## Celery & Background Tasks

- **Windows:** MUST use `--pool=solo` (not prefork)
- **Queues:** `default`, `grading`, `documents`, `integrity`, `high_priority`
- **Task wrapper:** `_run()` creates event loop for async services from sync tasks
- **Beat schedule:** Assessment reminders (1h), cleanup tasks (5m intervals)

## Testing Guidelines

Pytest with `pytest-asyncio` is the test stack. Name files `test_*.py` and mirror the feature area under test where practical. Integration tests expect PostgreSQL and Redis availability; unit tests rely on the shared fixtures in `tests/conftest.py`, which mock Redis and override DB access.

Add or update tests for route changes, security-sensitive logic, and repository or service behavior.

## Commit & Pull Request Guidelines

Recent history uses short, imperative commit messages such as `update after migration` and `update dependencies and fix security vulnerabilities`. Keep commits small, focused, and written in the imperative mood.

Pull requests should include a concise summary, note any migration or environment changes, list test coverage performed, and link the relevant issue or task. Include request/response examples when an API contract changes.

## Security & Configuration Tips

Configuration is environment-driven via `.env`. Never commit secrets. Required local values include `SECRET_KEY`, `DATABASE_URL`, and any provider keys in use. Prefer `.env.example` as the source of truth for new settings.

## Common Pitfalls

1. **Soft-delete trap:** Forgetting `is_deleted == False` filter in queries
2. **Enum sync:** DB enums must exactly match `core/constants.py`
3. **Transaction commits:** Services can **not** call `db.commit()`
4. **Password timing:** Login path hashes even for nonexistent emails (dummy bcrypt)
5. **Celery on Windows:** Requires `--pool=solo`; production uses `--pool=prefork`
6. **Email case sensitivity:** All emails normalized before storage/comparison

## Key Files to Reference

| File                                             | What to Learn                                         |
| ------------------------------------------------ | ----------------------------------------------------- |
| [main.py](app/main.py)                           | Lifespan, middleware stack, global exception handlers |
| [auth_service.py](app/services/auth_service.py)  | Service layer pattern (no commits, all async)         |
| [auth.py repo](app/db/repositories/auth.py)      | Repository pattern (CRUD, filtering, no logic)        |
| [dependencies/auth.py](app/dependencies/auth.py) | Composable role guards + token extraction             |
| [base.py models](app/db/base.py)                 | Mixin inheritance + timestamp/soft-delete mixins      |
| [conftest.py](tests/conftest.py)                 | Async test fixtures, DB mocking patterns              |

## AI Integration Notes

- **Service:** [ai_generation_service.py](app/services/ai_generation_service.py)
- **Flow:** Create → Review → Promote (lecturer-gated, never auto-promote)
- **LLM:** Uses LangChain + OpenAI; core logic in `app/core/ai/question_generator.py`
- **Future:** Celery dispatch for long-running generation (currently synchronous)
