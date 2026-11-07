#!/bin/sh
# Runs once, on a fresh PostgreSQL volume, under the official image's entrypoint.
# The image may source this file, so do not change the parent shell's options.
: "${APP_DB_PASSWORD:?Set APP_DB_PASSWORD before starting}"

# psql's quoted variable syntax escapes the password as an SQL literal; don't
# interpolate secrets into SQL or print them. The app account is not a superuser.
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_password="$APP_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE hype_app LOGIN PASSWORD %L', :'app_password') \gexec
GRANT CONNECT ON DATABASE hype_todo TO hype_app;
GRANT USAGE, CREATE ON SCHEMA public TO hype_app;
SQL
