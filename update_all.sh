#!/usr/bin/env bash
# Crawl e-Stat for new periods and rebuild both datasets and the web site data.
#   ./update_all.sh           # then commit site/public/data and push to redeploy
set -euo pipefail
cd "$(dirname "$0")"
PY=${PY:-.venv/bin/python}
$PY estat_crawler.py --all-tables
$PY build_dataset.py
$PY build_municipal.py
$PY population.py
$PY build_site_data.py
echo "Done. site/public/data is up to date."
