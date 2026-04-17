# Repository Guidelines

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

## Coding Style & Naming Conventions

Target Python 3.11 with 4-space indentation and type hints throughout. Follow the existing layering: routes stay thin, services own business rules, repositories do not commit transactions. Use `snake_case` for modules, functions, and variables; `PascalCase` for classes and Pydantic/SQLModel types.

Ruff is configured with a 100-character line length, and mypy runs in strict mode. Before opening a PR, run `ruff check .` and `mypy app`.

## Testing Guidelines

Pytest with `pytest-asyncio` is the test stack. Name files `test_*.py` and mirror the feature area under test where practical. Integration tests expect PostgreSQL and Redis availability; unit tests rely on the shared fixtures in `tests/conftest.py`, which mock Redis and override DB access.

Add or update tests for route changes, security-sensitive logic, and repository or service behavior.

## Commit & Pull Request Guidelines

Recent history uses short, imperative commit messages such as `update after migration` and `update dependencies and fix security vulnerabilities`. Keep commits small, focused, and written in the imperative mood.

Pull requests should include a concise summary, note any migration or environment changes, list test coverage performed, and link the relevant issue or task. Include request/response examples when an API contract changes.

## Security & Configuration Tips

Configuration is environment-driven via `.env`. Never commit secrets. Required local values include `SECRET_KEY`, `DATABASE_URL`, and any provider keys in use. Prefer `.env.example` as the source of truth for new settings.
