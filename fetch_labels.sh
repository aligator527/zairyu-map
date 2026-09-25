#!/usr/bin/env bash
# Refresh English names of municipalities from Wikidata (P429 = 全国地方公共団体コード).
# Only needed when municipalities are created or renamed; the result is committed.
set -euo pipefail
cd "$(dirname "$0")"
curl -sf -G "https://query.wikidata.org/sparql" -H "Accept: text/csv" \
  -H "User-Agent: zairyu-stats/1.0" \
  --data-urlencode 'query=SELECT ?code ?en ?ja WHERE { ?item wdt:P429 ?code . OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en)="en") } OPTIONAL { ?item rdfs:label ?ja FILTER(lang(?ja)="ja") } }' \
  -o data/labels/wikidata_lg_codes.csv
wc -l data/labels/wikidata_lg_codes.csv
