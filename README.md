# hype_todo

**HYPE** is a focused space for the things that matter. It combines a responsive, keyboard-friendly task dashboard with account signup, a short first-run welcome, and a persistent PostgreSQL database. Each account sees only its own tasks.

## What you can do

- Create, edit, complete, reopen, and delete tasks; add notes, priorities, projects, and due dates.
- Search your tasks and switch between all, today, upcoming, completed, and project views.
- Sign up, sign in, and sign out; a first-run onboarding screen introduces the workspace.
- Keep account and task data in a named PostgreSQL volume across container restarts and app rebuilds.

## Start with Docker Compose

You need Docker and Docker Compose. From this directory on your own machine:

1. Copy `.env.example` to `.env`. Set `POSTGRES_PASSWORD` and `APP_DB_PASSWORD` to two different, long random values. For example, run `openssl rand -hex 32` twice on systems with OpenSSL. Do not commit `.env`.
2. Run `docker compose up --build -d`.
3. Open **http://localhost:3000** and create your account.

The app listens on the host's loopback interface by default. PostgreSQL is on the private Compose network and is not published to the host; the application uses a separate, non-superuser database role. `docker compose down` stops the stack without deleting the named database volume. Removing that volume deletes all accounts and tasks: back it up first. You can back up the database with `docker compose exec -T db pg_dump -U hype_admin hype_todo > hype-backup.sql`; the backup contains private data and password hashes, so protect it appropriately.

Postgres creates its admin role during initial database setup. After PostgreSQL is healthy, a separate `db-init` service runs the application-role setup explicitly with `/bin/sh`, so it works even when host bind mounts cannot be executed directly. The app starts only after that setup succeeds. Setup can safely run again: it creates a missing application role and grants its database/schema permissions without deleting data or changing an existing role's password. This also repairs volumes left partially initialized by an earlier failed startup; run `docker compose up --build -d` again.

Changing either password in `.env` does not update an existing database role; rotate the corresponding role's password explicitly as well as updating `.env`. The app receives only its application credentials; admin credentials are used by PostgreSQL and the setup service.

## Run locally without Docker

Use Node.js 24 or later and a PostgreSQL database. Install dependencies with `npm install`, then set either `DATABASE_URL` or the usual `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE` environment variables. The database user needs permission to create the application's tables and indexes on first start. Run `npm start` and visit http://localhost:3000. By default the server binds only to `127.0.0.1`; `HOST` and `PORT` can be overridden.

## Tests

`npm test` runs the HTTP, authentication, authorization, input-validation, and password-hashing tests using an in-memory test store. A separate PostgreSQL integration test is skipped unless `TEST_DATABASE_URL` points to a disposable PostgreSQL database whose user can create schemas. Set it to run `npm test` against PostgreSQL too. That test creates a unique temporary schema and removes only that schema afterward. Docker and browser tests should also be run in an environment where Docker is available.

To test role setup and recovery with an isolated disposable PostgreSQL cluster (no existing database is touched), run:

```sh
docker run --rm --user postgres --tmpfs /tmp:rw,exec \
  --mount "type=bind,src=$PWD,dst=/workspace,readonly" \
  postgres:17-alpine sh /workspace/test/bootstrap.test.sh
```

This regression test covers an initialized database with a missing app role, quoted passwords, repeated setup, preserved task data/credentials, and rejected empty passwords. It invokes the mounted script through `sh`, as Compose does.

## Security and deployment notes

Passwords are salted and hashed with Node's scrypt implementation. Login uses a random, HTTP-only, SameSite cookie; the server stores only a hash of its token, and logout revokes the session. A revoked cookie may remain in the browser until its expiry or next login, but cannot authenticate. The app rejects cross-origin state-changing requests and has process-local source/account rate limits and a password-hashing concurrency limit. Database queries are parameterized and scoped to the signed-in user.

Cookies are scoped to the hostname, not the port. Use a dedicated hostname rather than sharing it with untrusted services. If conflicting `hype_session` cookies prevent sign-in, clear this app's site cookies and sign in again. Behind a reverse proxy, the built-in source limiter sees the proxy's address, so users share one source bucket; it is not a distributed public-facing limiter.

This is a self-hosted starting point, not a complete internet-facing identity platform: it does not yet provide email verification, password recovery, MFA, or distributed rate limiting. Keep the default localhost binding unless you add an appropriate security layer. Incoming `Host` names are restricted to `localhost`, `127.0.0.1`, and `[::1]` by default to reduce DNS-rebinding exposure. For HTTPS behind a correctly configured reverse proxy, set `COOKIE_SECURE=true`, preserve the original host header, and set `ALLOWED_HOSTS` to a comma-separated list of additional accepted hostnames (without ports). Use TLS, proper backups, and a shared rate limiter before exposing it more widely. Never set `COOKIE_SECURE=true` for plain HTTP, or the browser cannot send the session cookie.
