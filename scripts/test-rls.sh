#!/usr/bin/env bash
# Applies the Supabase migrations to a throwaway Postgres and runs the
# assertions in supabase/tests/.
#
# Uses Docker when it is available, and otherwise falls back to a local
# postgres binary in a temporary data directory - CI sandboxes and the
# hosted agent environment have the binary but no usable Docker daemon, and
# the tests are worth running in both.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CONTAINER=gamburg_rls_test
PORT="${PORT:-5433}"

# 0006 is Supabase-only: it needs the supabase_realtime publication and the
# pg_cron extension, neither of which plain Postgres has. Every other
# migration runs, including the ones that only *call* cron.schedule() - the
# local shim stubs that out so those files reach their RLS statements.
SKIP_MIGRATIONS="0006"

run_all() {
  local psql_cmd=("$@")

  "${psql_cmd[@]}" -f supabase/tests/00_local_shim.sql
  "${psql_cmd[@]}" -f supabase/migrations/0001_schema.sql
  "${psql_cmd[@]}" -f supabase/tests/00b_default_grants.sql

  for f in supabase/migrations/*.sql; do
    local name prefix
    name="$(basename "$f")"
    prefix="${name:0:4}"
    [ "$prefix" = "0001" ] && continue
    case " $SKIP_MIGRATIONS " in
      *" $prefix "*) echo "  skipping $name (Supabase-only)"; continue ;;
    esac
    "${psql_cmd[@]}" -f "$f"
  done

  "${psql_cmd[@]}" -f supabase/tests/01_seed.sql
  "${psql_cmd[@]}" -f supabase/tests/02_rls_assertions.sql
  "${psql_cmd[@]}" -f supabase/tests/03_seed_write.sql
  "${psql_cmd[@]}" -f supabase/tests/04_write_access.sql
}

if docker ps >/dev/null 2>&1; then
  echo "running against a Docker postgres:16-alpine..."
  cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
  trap cleanup EXIT
  cleanup

  docker run -d --name "$CONTAINER" \
    -e POSTGRES_PASSWORD=postgres \
    -p "$PORT:5432" \
    postgres:16-alpine >/dev/null

  echo "waiting for postgres on port $PORT..."
  for _ in $(seq 1 30); do
    docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
    sleep 1
  done

  export PGPASSWORD=postgres
  run_all psql -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q
else
  echo "no usable Docker daemon - falling back to a local postgres binary..."

  PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
  if [ -z "$PGBIN" ] || [ ! -x "$PGBIN/initdb" ]; then
    echo "error: neither Docker nor a local postgres server binary is available." >&2
    echo "       install postgresql, or start Docker, then re-run." >&2
    exit 1
  fi

  PGTMP="$(mktemp -d)"
  DATADIR="$PGTMP/data"
  SOCKDIR="$PGTMP/sock"
  mkdir -p "$DATADIR" "$SOCKDIR"

  # postgres refuses to run as root, so when we are root the cluster is run
  # by a dedicated unprivileged account instead
  RUNAS=""
  if [ "$(id -u)" = "0" ]; then
    id postgres >/dev/null 2>&1 || useradd -m postgres
    chown -R postgres "$PGTMP"
    RUNAS="postgres"
  fi

  as_pg() {
    if [ -n "$RUNAS" ]; then su "$RUNAS" -c "$1"; else eval "$1"; fi
  }

  cleanup() {
    as_pg "$PGBIN/pg_ctl -D '$DATADIR' -m immediate stop" >/dev/null 2>&1 || true
    rm -rf "$PGTMP"
  }
  trap cleanup EXIT

  as_pg "$PGBIN/initdb -D '$DATADIR' -U postgres --auth=trust" >/dev/null
  as_pg "$PGBIN/pg_ctl -D '$DATADIR' -o '-p $PORT -k $SOCKDIR' -l '$PGTMP/pg.log' start" >/dev/null

  for _ in $(seq 1 30); do
    pg_isready -h "$SOCKDIR" -p "$PORT" -U postgres >/dev/null 2>&1 && break
    sleep 1
  done

  run_all psql -h "$SOCKDIR" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q
fi

echo "All RLS checks passed."
