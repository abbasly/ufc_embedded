#!/usr/bin/env bash
# Run the Pick'em sync from this computer: the same steps as .github/workflows/pickem-sync.yml
# (new cards, changes and results from Wikipedia into the database), without going to GitHub.
#
#   scripts/pickem-sync.sh            sync once
#   scripts/pickem-sync.sh --every 5  sync every 5 minutes until Ctrl-C (e.g. during a card)
#
# Needs psql and uv, and SUPABASE_DB_URL (the database's Session pooler connection string) in
# .env at the project root. .env is git-ignored: the URL holds the database password, so it
# never goes in code, commits or chat.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

every=0
if [ "${1:-}" = "--every" ]; then
  every="${2:?--every needs a number of minutes}"
fi

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "SUPABASE_DB_URL is not set: add it to $root/.env (see the comment at the top of this script)." >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

sync_once() {
  echo "$(date '+%H:%M:%S') syncing..."
  # Fought but not yet scored: kept in sync even once they've left the upcoming list.
  psql "$SUPABASE_DB_URL" -At -v ON_ERROR_STOP=1 -c "select coalesce(json_agg(json_build_object('date', starts_on, 'name', name)), '[]') from public.events where scored_at is null and starts_on between current_date - 14 and current_date" > "$work/recent.json"
  uv run --no-dev python -m ufc_embedded.pickem_sync --recent "$work/recent.json" > "$work/sync.sql"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -f "$work/sync.sql"
  echo "$(date '+%H:%M:%S') done."
}

if [ "$every" -gt 0 ]; then
  while true; do
    sync_once || echo "$(date '+%H:%M:%S') this run failed; trying again next time." >&2
    sleep "$((every * 60))"
  done
else
  sync_once
fi
