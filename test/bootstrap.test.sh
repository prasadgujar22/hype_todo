#!/bin/sh
# Runs as an unprivileged OS user with PostgreSQL binaries on PATH.
# All database writes stay in a new temporary cluster, never the live database.
set -eu

script=${HYPE_BOOTSTRAP_SCRIPT:-$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)/docker/init-app-user.sh}
scratch=$(mktemp -d /tmp/hype-bootstrap-test.XXXXXX)
cleanup() {
  pg_ctl -D "$scratch/data" -m immediate -w stop >/dev/null 2>&1 || true
  rm -rf -- "$scratch"
}
trap cleanup EXIT HUP INT TERM

# Unix socket only: the disposable cluster cannot accept network connections.
initdb -D "$scratch/data" -U hype_admin -A trust >/dev/null
printf 'local all hype_app scram-sha-256\nlocal all all trust\n' > "$scratch/data/pg_hba.conf"
pg_ctl -D "$scratch/data" -l "$scratch/postgres.log" \
  -o "-k $scratch -c listen_addresses=''" -w start >/dev/null
export PGHOST="$scratch" PGPORT=5432 PGUSER=hype_admin
export POSTGRES_USER=hype_admin POSTGRES_DB=hype_todo PGDATABASE=hype_todo
unset PGPASSWORD DATABASE_URL
createdb hype_todo

sql() { psql -X -v ON_ERROR_STOP=1 -Atc "$1"; }
assert_eq() {
  if [ "$1" != "$2" ]; then
    echo "FAIL: $3" >&2
    exit 1
  fi
}

assert_eq "$(sql "SELECT count(*) FROM pg_roles WHERE rolname = 'hype_app'")" 0 'fixture must have no app role'
export APP_DB_PASSWORD="initial-test-'quoted-credential"
sh "$script" >/dev/null
assert_eq "$(sql "SELECT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole FROM pg_roles WHERE rolname = 'hype_app'")" t 'app must be a restricted login role'
assert_eq "$(sql "SELECT has_database_privilege('hype_app', 'hype_todo', 'CONNECT') AND has_schema_privilege('hype_app', 'public', 'USAGE') AND has_schema_privilege('hype_app', 'public', 'CREATE')")" t 'app needs database and schema privileges'

# Check actual password authentication, rather than relying on a role's presence.
PGUSER=hype_app PGPASSWORD="$APP_DB_PASSWORD" psql -X -v ON_ERROR_STOP=1 \
  -c "CREATE TABLE bootstrap_marker (value text); INSERT INTO bootstrap_marker VALUES ('keep me');" >/dev/null
before=$(sql "SELECT rolpassword FROM pg_authid WHERE rolname = 'hype_app'")

# A rerun must succeed and preserve existing credentials and data.
APP_DB_PASSWORD=different-test-credential sh "$script" >/dev/null
assert_eq "$(sql "SELECT rolpassword FROM pg_authid WHERE rolname = 'hype_app'")" "$before" 'setup must not rotate existing credentials'
assert_eq "$(PGUSER=hype_app PGPASSWORD="$APP_DB_PASSWORD" sql 'SELECT value FROM bootstrap_marker')" 'keep me' 'setup must preserve app-owned data'
if PGUSER=hype_app PGPASSWORD=different-test-credential psql -X -c 'SELECT 1' >/dev/null 2>&1; then
  echo 'FAIL: setup changed the existing password' >&2
  exit 1
fi
if APP_DB_PASSWORD='' sh "$script" >/dev/null 2>&1; then
  echo 'FAIL: empty application passwords must be rejected' >&2
  exit 1
fi
echo 'PASS: missing role repaired; quoted password works; reruns preserve credentials and data; empty password rejected'
