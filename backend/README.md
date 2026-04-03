# Mindexa Platform – Backend

Secure Academic Assessment Operating System — FastAPI backend.

**Project root:** `D:\Projects\mindexa\backend`

## Stack

| Layer | Technology |
|-------|------------|
| Web Framework | FastAPI + Uvicorn |
| Database | PostgreSQL 16 + pgvector |
| ORM / Schemas | SQLModel (SQLAlchemy 2 + Pydantic 2) |
| Migrations | Alembic |
| Cache / Broker | Redis 7 |
| Background Tasks | Celery + Celery Beat |
| AI / LLM | LangChain + LangGraph + OpenAI |
| Auth | JWT (access + refresh) + bcrypt |
| Logging | structlog (JSON in prod, coloured in dev) |

---

## Local Development Setup (Windows — PowerShell)

All commands run from `D:\Projects\mindexa\backend`.

### 1. Prerequisites

- Python 3.11+ — https://www.python.org/downloads/
- Docker Desktop for Windows — https://www.docker.com/products/docker-desktop/
- Git for Windows — https://git-scm.com/

> **psycopg2 on Windows:** The project uses `psycopg2-binary` which is
> fully self-contained. Do NOT install the source `psycopg2` package —
> it requires Visual C++ build tools and `libpq` headers to compile.

### 2. Navigate to the project root
```powershell
cd D:\Projects\mindexa\backend
```

### 3. Copy and configure the environment file
```powershell
Copy-Item .env.example .env
```

Then open `.env` and set at minimum:
- `SECRET_KEY` — generate with:
```powershell
  python -c "import secrets; print(secrets.token_hex(32))"
```
- `POSTGRES_PASSWORD`
- `OPENAI_API_KEY`

### 4. Start infrastructure
```powershell
docker compose up -d postgres redis
docker compose ps
```

### 5. Create and activate virtual environment
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

> If you get an execution policy error:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```
> CMD alternative: `.venv\Scripts\activate.bat`

### 6. Install dependencies
```powershell
pip install -e ".[dev]"
```

### 7. Run database migrations
```powershell
alembic upgrade head
alembic current
```

### 8. Start the API server
```powershell
uvicorn app.main:app --reload --port 8000
```

- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health/live

### 9. Start Celery worker (second terminal)
```powershell
cd D:\Projects\mindexa\backend
.\.venv\Scripts\Activate.ps1
celery -A app.workers.celery_app worker --loglevel=info --pool=solo --queues=default,grading,documents,integrity,high_priority
```

> `--pool=solo` is required on Windows. In production Linux containers use `--pool=prefork`.

### 10. Start Celery Beat (third terminal)
```powershell
cd D:\Projects\mindexa\backend
.\.venv\Scripts\Activate.ps1
celery -A app.workers.celery_app beat --loglevel=info
```

---

## Running Tests
```powershell
pytest
pytest tests/unit/ -v
pytest tests/integration/ -v
pytest --cov=app --cov-report=html
Start-Process htmlcov/index.html
```

---

## Database Migrations
```powershell
alembic revision --autogenerate -m "add_user_table"
alembic upgrade head
alembic downgrade -1
alembic history --verbose
```

---

## Project Structure
```
backend\
├── app\
│   ├── main.py              # FastAPI app factory + lifespan
│   ├── api\
│   │   ├── middleware.py    # Request context, security headers
│   │   ├── dependencies\    # FastAPI Depends() factories
│   │   └── routes\          # Route handlers per domain
│   ├── core\
│   │   ├── config.py        # Pydantic Settings
│   │   ├── constants.py     # All enums and constants
│   │   ├── exceptions.py    # Custom exception hierarchy
│   │   ├── handlers.py      # Global exception handlers
│   │   ├── logging.py       # structlog configuration
│   │   ├── redis.py         # Redis client + helpers
│   │   └── security.py      # JWT + password utilities
│   ├── db\
│   │   ├── base.py          # BaseModel (UUID, timestamps, soft-delete)
│   │   ├── session.py       # Engine, session factory, get_db
│   │   ├── models\          # SQLModel table definitions
│   │   ├── schemas\         # Pydantic request/response schemas
│   │   └── repositories\    # Data access layer
│   ├── services\            # Business logic
│   ├── agents\              # LangChain/LangGraph AI agents
│   ├── workers\             # Celery tasks
│   ├── websocket\           # WebSocket handlers
│   └── utils\               # Shared utilities
├── alembic\                 # Database migrations
├── tests\
├── scripts\db\              # PostgreSQL init SQL
├── .env.example
├── docker-compose.yml
├── Dockerfile
└── pyproject.toml
```

---

## Key Rules

1. **No hard deletes** — all records use `is_deleted` soft-delete.
2. **AI never acts alone** — all AI output requires human review before use.
3. **Student AI is blocked during protected assessments** — enforced at the service layer.
4. **Repositories never commit** — only `get_db` and Celery tasks call `commit()`.
5. **Structured logging everywhere** — `logger.info("event", key=value)`, never f-strings.
6. **Secrets never in code** — everything comes from environment variables via `settings`.
