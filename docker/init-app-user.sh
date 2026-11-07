#!/bin/sh
# Run explicitly with sh from the Compose db-init service. Bind mounts may be
# non-executable on the host. This must also repair already-initialized volumes.
: "${APP_DB_PASSWORD:?Set APP_DB_PASSWORD before starting}"

# Read the password inside psql so it never appears in command arguments.
# Quoted psql variables are safely escaped as SQL literals.
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_password APP_DB_PASSWORD
-- Preserve existing credentials; password rotation is an explicit operation.
SELECT format('CREATE ROLE hype_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hype_app') \gexec
GRANT CONNECT ON DATABASE hype_todo TO hype_app;
GRANT USAGE, CREATE ON SCHEMA public TO hype_app;
SQL
