#!/usr/bin/env bash
# Download the raw data (public Kaggle datasets, refreshed about daily; no account needed) into
# data/raw/. Used by .github/workflows/data-refresh.yml, and by hand before re-running the pipeline.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# "<kaggle dataset> <folder in data/raw> <the file the pipeline reads>"
while read -r dataset folder file; do
  echo "downloading $dataset"
  curl -fsSL --retry 3 --max-time 300 "https://www.kaggle.com/api/v1/datasets/download/$dataset" -o "$tmp/$folder.zip"
  mkdir -p "$root/data/raw/$folder"
  unzip -oq "$tmp/$folder.zip" -d "$root/data/raw/$folder"
  test -s "$root/data/raw/$folder/$file" # an empty or renamed file stops here, not in the pipeline
done <<'EOF'
scarekrow/ufc-data ufc-data UFC_full_data_silver_v2.csv
valihameed/ufc-stats ufc-stats ufc-master.csv
jerzyszocik/ufc-betting-odds-daily-dataset ufc-betting-odds UFC_betting_odds.csv
jerzyszocik/ufc-rankings-history ufc-rankings-history UFC_rankings_history.csv
EOF
