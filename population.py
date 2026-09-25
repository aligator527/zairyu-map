"""Total resident population (Japanese + foreign) by prefecture and municipality,
from 総務省「住民基本台帳に基づく人口、人口動態及び世帯数」 (e-Stat toukei 00200241),
table 【総計】市区町村別人口、人口動態及び世帯数, as of 1 January of each year.

    python population.py            # -> data/population.parquet (year, code, population)

code is the 5-digit 全国地方公共団体コード without check digit; prefectures are
"PP000" and the national total is "00000". Files are cached in data/raw/pop/.
"""

from __future__ import annotations

import html
import json
import logging
import re
from pathlib import Path

import pandas as pd

from estat_crawler import BASE, Client, Table, parse_tables

RAW = Path("data/raw/pop")
OUT = Path("data/population.parquet")
FIRST_YEAR = 2014  # foreign residents are included in the 住民基本台帳 since 2013-07
TITLE = "【総計】市区町村別人口、人口動態及び世帯数"

log = logging.getLogger("population")

LIST = (f"{BASE}/stat-search/files?page=1&layout=datalist&toukei=00200241&tstat=000001039591"
        "&cycle=7&tclass1=000001039601&tclass2val=0&metadata=1&data=1")


def find_tables(client: Client) -> dict[int, Table]:
    top = html.unescape(client.get(LIST).text)
    years = sorted({int(y[:4]) for y in re.findall(r"[?&]year=(\d{5})", top) if int(y[:4]) >= FIRST_YEAR})
    found: dict[int, Table] = {}
    for y in years:
        h = client.get(f"{LIST}&year={y}0&month=0&result_back=1").text
        for t in parse_tables(h, str(y)):
            if t.title.replace(" ", "") == TITLE and any(k == "0" for k, _ in t.file_kinds):
                found[y] = t
    log.info("population tables for %s", sorted(found))
    return found


def parse(path: Path, year: int) -> pd.DataFrame:
    df = pd.read_excel(path, header=None, dtype=str)
    # Data rows: col 0 = 6-digit code (or "-" for the national total), col 5 = total population.
    code = df[0].fillna("").str.strip()
    rows = df[code.str.fullmatch(r"\d{6}") | ((code == "-") & (df[1].str.strip() == "合計"))]
    total = pd.to_numeric(rows[5], errors="coerce")  # "***" = not published (北方領土)
    rows, total = rows[total.notna()], total[total.notna()]
    male, female = pd.to_numeric(rows[3]), pd.to_numeric(rows[4])
    # The published 計 occasionally differs from 男+女 by a few people; a wrong
    # column would be off everywhere, so only fail on a systematic mismatch.
    off = (male + female - total).abs() > total * 0.001
    if off.mean() > 0.05:
        raise ValueError(f"{path}: column layout changed (男+女 != 計 in {off.sum()} rows)")
    return pd.DataFrame({
        "year": year,
        "code": rows[0].str.strip().str[:5].replace({"-": "00000"}),
        "population": total.astype("int64"),
    })


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    client = Client()
    RAW.mkdir(parents=True, exist_ok=True)
    manifest_path = RAW / "manifest.json"
    try:
        previous = {e["year"]: e for e in json.loads(manifest_path.read_text(encoding="utf-8"))}
    except (OSError, ValueError):
        previous = {}
    parts, manifest = [], []
    for year, table in sorted(find_tables(client).items()):
        prev = previous.get(year)
        stale = prev is not None and (prev["stat_inf_id"], prev["updated"]) != (table.stat_inf_id, table.updated)
        path = _download_any(client, table, RAW / f"{year}.xlsx", force=stale)
        parts.append(parse(path, year))
        manifest.append({"year": year, "stat_inf_id": table.stat_inf_id, "updated": table.updated, "file": str(path)})
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    data = pd.concat(parts, ignore_index=True)
    # National total = sum of prefectures (older files leave the 合計 row without a code).
    data = data[data["code"] != "00000"]
    prefs = data[data["code"].str.fullmatch(r"\d\d000")]
    nat = prefs.groupby("year", as_index=False)["population"].sum().assign(code="00000")
    data = pd.concat([data, nat], ignore_index=True).sort_values(["year", "code"])
    data.to_parquet(OUT, index=False)
    nat = data[data["code"] == "00000"].set_index("year")["population"]
    log.info("wrote %s (%d rows); national totals:\n%s", OUT, len(data), nat.to_string())


def _download_any(client: Client, table: Table, dest: Path, force: bool = False) -> Path:
    """Older years are .xls (OLE2), newer .xlsx; keep the right suffix for pandas."""
    for p in (dest, dest.with_suffix(".xls")):
        if p.exists() and p.stat().st_size > 0:
            if not force:
                return p
            p.unlink()
    r = client.get(table.download_url("0"))
    path = dest if r.content[:2] == b"PK" else dest.with_suffix(".xls")
    path.write_bytes(r.content)
    log.info("downloaded %s", path)
    return path


if __name__ == "__main__":
    main()
