"""Exit 0 and print what changed if e-Stat has new or republished tables compared
with what the site was built from (site/public/data/meta.json → "sources").

    python check_updates.py     # prints "changed=true|false" (also to $GITHUB_OUTPUT)
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import population
from estat_crawler import DATASETS, Client, crawl, pick_target

META = Path("site/public/data/meta.json")


def current() -> tuple[set[tuple], set[tuple]]:
    client = Client()
    estat = set()
    for period, tables in crawl(client):
        for ds in DATASETS:
            t = pick_target(tables, ds)
            if t:
                estat.add((ds, period.label, t.stat_inf_id, t.updated))
    pop = {(y, t.stat_inf_id, t.updated) for y, t in population.find_tables(client).items()}
    return estat, pop


def built() -> tuple[set[tuple], set[tuple]]:
    try:
        src = json.loads(META.read_text(encoding="utf-8")).get("sources", {})
    except (OSError, ValueError):
        return set(), set()
    if not isinstance(src, dict):  # built by an older version: treat everything as new
        return set(), set()
    estat = {(e["dataset"], e["period"], e["stat_inf_id"], e.get("updated")) for e in src.get("zairyu", [])}
    pop = {(e["year"], e["stat_inf_id"], e.get("updated")) for e in src.get("population", [])}
    return estat, pop


def main() -> None:
    now_e, now_p = current()
    old_e, old_p = built()
    new = sorted(now_e - old_e) + sorted(now_p - old_p)
    for n in new:
        print("new or updated:", *n)
    changed = bool(new)
    print(f"changed={'true' if changed else 'false'}")
    if out := os.environ.get("GITHUB_OUTPUT"):
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"changed={'true' if changed else 'false'}\n")


if __name__ == "__main__":
    main()
