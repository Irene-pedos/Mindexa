-- ─────────────────────────────────────────────────────────────────────────────
-- Mindexa Platform – PostgreSQL Initialisation Script
-- Runs automatically when the Docker postgres container is first created.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Read-only role for reporting/analytics queries
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mindexa_readonly') THEN
        CREATE ROLE mindexa_readonly NOLOGIN;
    END IF;
END
$$;

GRANT CONNECT ON DATABASE mindexa_db TO mindexa_readonly;
GRANT USAGE ON SCHEMA public TO mindexa_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO mindexa_readonly;

-- Force UTC timezone at the database level
ALTER DATABASE mindexa_db SET timezone TO 'UTC';

-- Optimise for OLTP (short, frequent queries on SSD storage)
ALTER DATABASE mindexa_db SET default_statistics_target TO 100;
ALTER DATABASE mindexa_db SET random_page_cost TO 1.1;
