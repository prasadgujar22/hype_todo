#!/bin/sh
# Runs once, on a fresh PostgreSQL volume, under the official image's entrypoint.
# The image may source this file, so do not change the parent shell's options.
: "${APP_DB_PASSWORD:?Set APP_DB_PASSWORD before starting}"

# Read the password inside psql so it never appears in command arguments.
# Quoted psql variables are safely escaped as SQL literals.
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_password APP_DB_PASSWORD
SELECT format('CREATE ROLE hype_app LOGIN PASSWORD %L', :'app_password') \gexec
GRANT CONNECT ON DATABASE hype_todo TO hype_app;
GRANT USAGE, CREATE ON SCHEMA public TO hype_app;
SQL
