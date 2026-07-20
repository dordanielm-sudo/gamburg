#!/usr/bin/env bash
# Applies the Supabase migrations to a throwaway Postgres container and runs
# the RLS assertions in supabase/tests/. Requires only Docker - no Supabase
# project, credentials, or CLI needed.
set -euo pipefail

CONTAINER=gamburg_rls_test
PORT="${PORT:-5433}"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres \
  -p "$PORT:5432" \
  postgres:16-alpine >/dev/null

echo "waiting for postgres on port $PORT..."
for _ in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

export PGPASSWORD=postgres
PSQL=(psql -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -f supabase/tests/00_local_shim.sql
"${PSQL[@]}" -f supabase/migrations/0001_schema.sql
"${PSQL[@]}" -f supabase/tests/00b_default_grants.sql
"${PSQL[@]}" -f supabase/migrations/0002_rls.sql
"${PSQL[@]}" -f supabase/migrations/0003_auth_sync.sql
"${PSQL[@]}" -f supabase/migrations/0004_user_management.sql
"${PSQL[@]}" -f supabase/migrations/0005_stuck_case_check.sql
"${PSQL[@]}" -f supabase/tests/01_seed.sql
"${PSQL[@]}" -f supabase/tests/02_rls_assertions.sql

echo "All RLS checks passed."
