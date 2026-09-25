"""Scrape the immigration offices (本局・支局・出張所) and their service areas
(管轄又は分担区域, 在留関係諸申請) from the Immigration Services Agency site.

    python fetch_offices.py      # -> data/labels/isa_offices.json (committed)

Each bureau / district office page lists its own table first and then one
block per branch office (出張所). Service areas are given as prefectures and/or
municipalities and overlap: a resident may apply at the bureau or at the
branch office that covers their municipality.
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE = "https://www.moj.go.jp/isa/about/region/{}/index.html"
# page key -> bureau id (see site/src/lib/bureaus.ts)
PAGES = {
    "sapporo": 1, "sendai": 2, "tokyo": 3, "yokohama": 3, "narita": 3, "haneda": 3,
    "nagoya": 4, "chubu": 4, "osaka": 5, "kobe": 5, "kansai": 5,
    "hiroshima": 6, "takamatsu": 7, "fukuoka": 8, "naha": 8,
}
OUT = Path("data/labels/isa_offices.json")


def text(el) -> str:
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip()


def parse_page(key: str, html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    main = soup.select_one("div.textBlock") or soup
    offices = []
    # Walk headings and tables in document order: a heading names the office
    # whose table follows; the first table (before any heading) is the page's own office.
    title = text(soup.select_one("h1")) if soup.select_one("h1") else key
    current = title
    for el in soup.find_all(["h2", "h3", "table"]):
        if el.name in ("h2", "h3"):
            t = text(el)
            if re.search(r"(出張所|支局|分室|出入国在留管理局)$", t):
                current = t
            continue
        if "tableStyle01" not in (el.get("class") or []):
            continue
        rows = {text(tr.find("th")): tr.find("td") for tr in el.find_all("tr") if tr.find("th") and tr.find("td")}
        area_td = rows.get("管轄又は分担区域")
        addr_td = rows.get("所在地")
        if area_td is None and addr_td is None:
            continue
        area = ""
        if area_td is not None:
            # First paragraph: [在留関係諸申請※１] <areas>
            first = area_td.find("p") or area_td
            area = re.sub(r"^\[[^\]]*\]\s*", "", text(first))
        addr = text(addr_td) if addr_td is not None else ""
        addr = re.sub(r"周辺の地図を開く.*$", "", addr).strip()
        offices.append({"page": key, "bureau": PAGES[key], "name": current, "area": area, "address": addr})
    return offices


def main() -> None:
    s = requests.Session()
    s.headers["User-Agent"] = "Mozilla/5.0 (compatible; zairyu-stats/1.0)"
    all_offices = []
    for key in PAGES:
        r = s.get(BASE.format(key), timeout=60)
        r.raise_for_status()
        r.encoding = "utf-8"
        all_offices += parse_page(key, r.text)
        time.sleep(1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(all_offices, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(all_offices)} offices -> {OUT}")


if __name__ == "__main__":
    main()
