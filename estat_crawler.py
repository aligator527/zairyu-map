"""Crawler for e-Stat 在留外国人統計 (toukei=00250012, tstat=000001018034).

Walks every survey period listed on the e-Stat "files" page and downloads
the テーブルデータ files:

  t1  在留外国人統計テーブルデータ（国籍・地域別 在留資格別 都道府県別 年齢・性別）
      (since 2016-12; before 2023-12 published under names like
      在留外国人統計テーブルデータ（令和３年末現在）) -> data/raw/<period>_t1.xlsx
  t2  在留外国人統計テーブルデータ（国籍・地域別 在留資格別 市区町村別）
      (since 2023-12)                                -> data/raw/<period>_t2.xlsx

Usage:
    python estat_crawler.py                 # crawl + download t1 and t2 into data/raw
    python estat_crawler.py --dataset t2    # only the municipal table
    python estat_crawler.py --list          # only print what was found
    python estat_crawler.py --all-tables    # also save a catalog of every table
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import logging
import re
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE = "https://www.e-stat.go.jp"
LIST_PARAMS = {
    "page": "1",
    "layout": "datalist",
    "toukei": "00250012",
    "tstat": "000001018034",
    "cycle": "1",
    "tclass1": "000001060399",
    "tclass2val": "0",
    "metadata": "1",
    "data": "1",
}
USER_AGENT = "Mozilla/5.0 (compatible; zairyu-stats-crawler/1.0)"
REQUEST_DELAY = 1.0  # seconds between requests, be polite to e-Stat

RAW_DIR = Path("data/raw")

log = logging.getLogger("estat_crawler")


@dataclass
class Period:
    year: int
    month: int  # 6 or 12
    year_param: str  # e.g. "20230"
    month_param: str  # e.g. "24101212"

    @property
    def label(self) -> str:
        return f"{self.year}-{self.month:02d}"


@dataclass
class Table:
    period: str
    table_no: str | None
    stat_inf_id: str
    title: str
    file_kinds: list[tuple[str, str]] = field(default_factory=list)  # (fileKind, type)
    updated: str | None = None  # 公開（更新）日, e.g. "2025-05-09"

    def download_url(self, kind: str = "0") -> str:
        return f"{BASE}/stat-search/file-download?statInfId={self.stat_inf_id}&fileKind={kind}"


class Client:
    def __init__(self, delay: float = REQUEST_DELAY, retries: int = 4):
        self.s = requests.Session()
        self.s.headers["User-Agent"] = USER_AGENT
        self.delay = delay
        self.retries = retries
        self._last = 0.0

    def get(self, url: str, **kw) -> requests.Response:
        for attempt in range(1, self.retries + 1):
            wait = self.delay - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            try:
                r = self.s.get(url, timeout=120, **kw)
                self._last = time.monotonic()
                r.raise_for_status()
                return r
            except requests.RequestException as e:
                self._last = time.monotonic()
                if attempt == self.retries:
                    raise
                log.warning("GET %s failed (%s), retry %d", url, e, attempt)
                time.sleep(2**attempt)
        raise AssertionError("unreachable")


def list_url(**extra: str) -> str:
    params = {**LIST_PARAMS, **extra}
    return f"{BASE}/stat-search/files?" + "&".join(f"{k}={v}" for k, v in params.items())


def parse_periods(page_html: str) -> list[Period]:
    """Extract (year, month) links like ...&year=20230&month=24101212..."""
    soup = BeautifulSoup(page_html, "lxml")
    found: dict[tuple[str, str], Period] = {}
    for a in soup.select("a.stat-item_child"):
        href = html.unescape(a.get("href", ""))
        y = re.search(r"[?&]year=(\d{5})", href)
        m = re.search(r"[?&]month=(\d+)", href)
        mm = re.search(r"(\d+)月", a.get_text())
        if not (y and m and mm):
            continue
        key = (y.group(1), m.group(1))
        found[key] = Period(int(y.group(1)[:4]), int(mm.group(1)), *key)
    return sorted(found.values(), key=lambda p: (p.year, p.month))


def parse_tables(page_html: str, period: str) -> list[Table]:
    soup = BeautifulSoup(page_html, "lxml")
    tables = []
    for art in soup.select("article.stat-dataset_list-item"):
        link = art.select_one("a.js-data[data-value]")
        if link is None:
            continue
        no = None
        for li in art.select("li.stat-dataset_list-detail-item"):
            sp = li.find("span", class_="stat-sp")
            if sp and "表番号" in sp.get_text():
                nxt = sp.find_next_sibling("span")
                no = nxt.get_text(strip=True) if nxt else None
                break
        kinds = []
        for dl in art.select("a.js-dl[href*='file-download']"):
            k = re.search(r"fileKind=(\d+)", dl["href"])
            if k:
                kinds.append((k.group(1), dl.get("data-file_type", "")))
        title = re.sub(r"\s+", " ", link.get_text(" ", strip=True)).replace(" ", "　")
        upd = re.search(r"公開（更新）日\s*</span>\s*(\d{4}-\d{2}-\d{2})", str(art))
        tables.append(Table(period, no, link["data-value"], title, kinds, upd.group(1) if upd else None))
    return tables


def page_count(page_html: str) -> int:
    pages = [int(x) for x in re.findall(r"[?&](?:amp;)?page=(\d+)", page_html)]
    return max(pages) if pages else 1


TARGET_RE = re.compile(r"テーブルデータ")
DATASETS = ("t1", "t2")


def pick_target(tables: list[Table], dataset: str) -> Table | None:
    """t1: prefecture/age/sex table (incl. the older one-table-per-period files);
    t2: municipal table."""
    cands = [
        t for t in tables
        if TARGET_RE.search(t.title) and "ご利用方法" not in t.title
        and any(k == "0" for k, _ in t.file_kinds)
        and (("市区町村" in t.title) == (dataset == "t2"))
    ]
    if not cands:
        return None
    # Prefer the explicitly named prefecture/age/sex variant.
    cands.sort(key=lambda t: ("都道府県" not in t.title, t.title))
    return cands[0]


def crawl(client: Client) -> list[tuple[Period, list[Table]]]:
    top = client.get(list_url()).text
    periods = parse_periods(top)
    log.info("found %d periods: %s", len(periods), ", ".join(p.label for p in periods))
    out = []
    for p in periods:
        tables: list[Table] = []
        page = 1
        while True:
            h = client.get(list_url(page=str(page), year=p.year_param, month=p.month_param, result_back="1")).text
            tables += parse_tables(h, p.label)
            if page >= page_count(h):
                break
            page += 1
        log.info("%s: %d tables", p.label, len(tables))
        out.append((p, tables))
    return out


def load_manifest(path: Path) -> dict[str, dict]:
    """file name -> manifest entry of the previous run (to detect republished tables)."""
    try:
        return {Path(e["file"]).name: e for e in json.loads(path.read_text(encoding="utf-8")) if "file" in e}
    except (OSError, ValueError):
        return {}


def download(client: Client, table: Table, dest: Path, force: bool = False, previous: dict | None = None) -> Path:
    same = previous is not None and previous.get("stat_inf_id") == table.stat_inf_id \
        and previous.get("updated") == table.updated
    if dest.exists() and dest.stat().st_size > 0 and not force and (previous is None or same):
        log.info("skip (cached) %s", dest)
        return dest
    log.info("download %s -> %s", table.download_url(), dest)
    r = client.get(table.download_url("0"))
    if r.content[:2] != b"PK":
        raise RuntimeError(f"{table.stat_inf_id}: expected xlsx, got {r.headers.get('content-type')}")
    tmp = dest.with_suffix(".part")
    tmp.write_bytes(r.content)
    tmp.replace(dest)
    return dest


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=RAW_DIR)
    ap.add_argument("--list", action="store_true", help="only list, do not download")
    ap.add_argument("--all-tables", action="store_true", help="write data/catalog.csv with every table")
    ap.add_argument("--force", action="store_true", help="re-download even if cached")
    ap.add_argument("--dataset", choices=[*DATASETS, "all"], default="all")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    client = Client()
    result = crawl(client)

    if args.all_tables:
        cat = args.out.parent / "catalog.csv"
        cat.parent.mkdir(parents=True, exist_ok=True)
        with cat.open("w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(["period", "table_no", "stat_inf_id", "title", "file_types", "url"])
            for _, tables in result:
                for t in tables:
                    w.writerow([t.period, t.table_no, t.stat_inf_id, t.title,
                                "|".join(ft for _, ft in t.file_kinds), t.download_url()])
        log.info("catalog written to %s", cat)

    args.out.mkdir(parents=True, exist_ok=True)
    manifest = []
    previous = load_manifest(args.out / "manifest.json")
    datasets = DATASETS if args.dataset == "all" else (args.dataset,)
    for p, tables in result:
        for ds in datasets:
            t = pick_target(tables, ds)
            if t is None:
                log.info("%s: no %s テーブルデータ", p.label, ds)
                continue
            print(f"{p.label}  {ds}  {t.stat_inf_id}  {t.title}")
            entry = {"dataset": ds, **asdict(t)}
            if not args.list:
                dest = args.out / f"{p.label}_{ds}.xlsx"
                entry["file"] = str(download(client, t, dest, args.force, previous.get(dest.name)))
            manifest.append(entry)
    if not args.list:
        (args.out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
