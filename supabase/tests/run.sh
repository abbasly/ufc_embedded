#!/usr/bin/env bash
# Test the database migrations and their row level security on a throwaway local Postgres:
# start a temporary server, load the Supabase stand-in, apply every migration in order, run
# the tests, and remove the server again. Needs Postgres's command line tools (initdb, pg_ctl,
# psql), e.g. `brew install postgresql`.
#
# Supabase runs Postgres 15+. On an older local Postgres, the views' security_invoker option
# (new in 15) is left out when loading; everything else is applied as written.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
dir="$(mktemp -d)"
port=54329
trap 'pg_ctl -D "$dir/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$dir"' EXIT

initdb -D "$dir/data" -U postgres --auth=trust --locale=C >/dev/null
pg_ctl -D "$dir/data" -o "-p $port -k $dir" -l "$dir/log" start -w >/dev/null
psql_() { psql -h "$dir" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

major="$(psql_ -tAc 'show server_version_num' | cut -c1-2)"
psql_ -f "$here/supabase_shim.sql"
for migration in "$here"/../migrations/*.sql; do
  if [ "$major" -lt 15 ]; then
    sed 's/ with (security_invoker = true)//' "$migration" | psql_
  else
    psql_ -f "$migration"
  fi
done
psql_ -f "$here/rls_test.sql"
