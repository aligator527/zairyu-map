"""Export the two datasets into compact static files for the web site (site/public/data).

    python build_site_data.py

Writes
  meta.json                  dictionaries (ja/en labels), periods, municipalities
  pref/<period>.bin          t1: nationality x status x prefecture x sex x 5-year age group
  muni/<period>.bin          t2: municipality x nationality x status x sex x 5-year age group

.bin files are gzip-compressed column blocks (see site/src/lib/data.ts):
  pref: u32 n | u32 count[n] | u8 nat[n] | u8 status[n] | u8 pref[n] | u8 sex[n] | u8 age[n]
  muni: u32 n | u32 count[n] | u16 muni[n] | u8 nat[n] | u8 status[n] | u8 sex[n] | u8 age[n]
Index 0 always means "not published / suppressed (秘匿)".
"""

from __future__ import annotations

import csv
import gzip
import json
import re
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

from site_labels import NATIONALITY_EN, PREFECTURE_EN, REGION_EN, STATUS_EN, STATUS_GROUPS

PREF_SRC = Path("data/zairyu_gaikokujin_pref_age_sex.parquet")
MUNI_SRC = Path("data/zairyu_gaikokujin_municipal.parquet")
WIKIDATA = Path("data/labels/wikidata_lg_codes.csv")  # refreshed by fetch_labels.sh
POPULATION = Path("data/population.parquet")
TOPO = Path("site/public/geo/japan.topo.json")
OUT = Path("site/public/data")

AGE_UNKNOWN = 18  # 不詳 (only a handful of people in 2016-12 / 2017-12)
# Hamamatsu reorganised its wards on 2024-01-01 (7 -> 3). The 2023-12 figures
# for the old wards are summed into the whole city, drawn as the merged new wards.
HAMAMATSU_OLD = {"22131", "22132", "22133", "22134", "22135", "22136", "22137"}
HAMAMATSU = ("22130", "浜松市", "Hamamatsu", ["22138", "22139", "22140"])
NO_STATS = {"01695", "01696", "01697", "01698", "01699", "01700"}  # 北方領土, excluded from the statistics


def age_idx(s: pd.Series) -> np.ndarray:
    return s.astype("Float64").fillna(AGE_UNKNOWN).astype(int).to_numpy()


def write_bin(path: Path, count: np.ndarray, cols: list[tuple[np.ndarray, str]]) -> int:
    n = len(count)
    parts = [np.array([n], "<u4").tobytes(), count.astype("<u4").tobytes()]
    parts += [c.astype(dt).tobytes() for c, dt in cols]
    raw = b"".join(parts)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gzip.compress(raw, 9, mtime=0))
    return path.stat().st_size


SUFFIX = re.compile(r"(?:[ -](?:ku|shi|cho|machi|mura|son|city|town|village|ward))+$", re.I)
KIND_EN = {"市": "City", "町": "Town", "村": "Village", "区": "Ward"}


def romaji_base(label: str) -> str:
    """'Chūō-ku' -> 'Chuo', 'Kibi-chūō Chō' -> 'Kibi-Chuo', 'Sanʼyō-Onoda' -> 'Sanyo-Onoda'."""
    s = unicodedata.normalize("NFKD", label)
    s = "".join(c for c in s if not unicodedata.combining(c)).replace("ʼ", "").replace("'", "")
    s = s.split(",")[0].strip()
    s = SUFFIX.sub("", s).strip()
    return "-".join(part[:1].upper() + part[1:] for part in s.split("-"))


def wikidata_names() -> dict[str, str]:
    """5-digit code -> romanised base name without the municipality-type suffix."""
    names: dict[str, str] = {}
    with WIKIDATA.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            code, en = row["code"][:5], (row["en"] or "").strip()
            if en and code not in names:
                names[code] = romaji_base(en)
    return names


def main() -> None:
    t1 = pd.read_parquet(PREF_SRC)
    t2 = pd.read_parquet(MUNI_SRC)

    # ---- dictionaries
    nats = t1[["nationality_code", "nationality"]].drop_duplicates().astype(str).sort_values("nationality_code")
    nat_idx = {c: i + 1 for i, c in enumerate(nats["nationality_code"])}
    statuses = t1[["status_code", "status"]].drop_duplicates().astype(str).sort_values("status_code")
    st_idx = {c: i + 1 for i, c in enumerate(statuses["status_code"])}
    prefs = t1[["prefecture_code", "prefecture"]].drop_duplicates().astype(str).sort_values("prefecture_code")

    wd = wikidata_names()
    topo = json.loads(TOPO.read_text(encoding="utf-8"))
    geo_ids = {g["id"] for g in topo["objects"]["muni"]["geometries"]}

    t2 = t2.copy()
    for c in ("municipality_code", "municipality", "designated_city_code", "designated_city"):
        t2[c] = t2[c].astype("string")
    old = t2["municipality_code"].isin(HAMAMATSU_OLD)
    t2.loc[old, ["municipality_code", "municipality"]] = [HAMAMATSU[0], HAMAMATSU[1]]
    munis = (t2[["municipality_code", "municipality", "prefecture_code", "designated_city_code", "designated_city"]]
             .astype(object).fillna("").astype(str).drop_duplicates("municipality_code", keep="last")
             .sort_values("municipality_code"))
    muni_idx = {c: i + 1 for i, c in enumerate(munis["municipality_code"])}
    missing_en = []

    # One style for every place, modelled on the official English names of local
    # governments: "Kawasaki City", "Samukawa Town", "Chuo Ward, Sapporo".
    def muni_en(code: str, ja: str, city_code: str) -> str:
        if code == HAMAMATSU[0]:
            return f"{HAMAMATSU[2]} City"
        if code == "48000":
            return PREFECTURE_EN["48"]
        if code == "99999":
            return PREFECTURE_EN["99"]
        base = wd.get(code)
        if base is None:
            missing_en.append((code, ja))
            return ja
        en = f"{base} {KIND_EN.get(ja[-1], '')}".strip()
        if city_code:
            city = wd.get(f"{city_code}00")
            if city:
                en = f"{en}, {city}"
        return en

    meta = {
        "source": "出入国在留管理庁「在留外国人統計」(e-Stat)",
        "periods": {
            "pref": sorted(t1["period"].astype(str).unique()),
            "muni": sorted(t2["period"].astype(str).unique()),
            "muniAgeSex": sorted(t2.loc[t2["sex"].notna(), "period"].astype(str).unique()),
        },
        "regions": [{"code": k, "ja": v, "en": REGION_EN[k]} for k, v in
                    t1[["region_code", "region"]].drop_duplicates().astype(str).sort_values("region_code").values],
        "nat": [{"code": c, "ja": ja, "en": NATIONALITY_EN[c], "region": c[:2]} for c, ja in nats.values],
        "status": [{"code": c, "ja": ja, "en": STATUS_EN[c]} for c, ja in statuses.values],
        "statusGroups": [{"id": g, "ja": ja, "en": en, "codes": [st_idx[c] for c in codes if c in st_idx]}
                         for g, ja, en, codes in STATUS_GROUPS],
        "pref": [{"code": c, "ja": ja, "en": PREFECTURE_EN[c]} for c, ja in prefs.values],
        "sex": [{"code": 1, "ja": "男", "en": "Male"}, {"code": 2, "ja": "女", "en": "Female"},
                {"code": 3, "ja": "その他", "en": "Other"}],
        "age": [{"code": i + 1, "ja": (f"{i*5}～{i*5+4}歳" if i < 16 else "80歳以上"),
                 "en": (f"{i*5}–{i*5+4}" if i < 16 else "80+")} for i in range(17)]
               + [{"code": AGE_UNKNOWN, "ja": "不詳", "en": "Unknown"}],
        "muni": [{"code": c, "ja": ja, "en": muni_en(c, ja, city), "pref": p,
                  "city": city, "cityJa": city_ja, "geo": c in geo_ids}
                 for c, ja, p, city, city_ja in munis.values],
        "geoMerge": {HAMAMATSU[0]: HAMAMATSU[3]},
        "noStats": sorted(NO_STATS),
    }
    if missing_en:
        print("municipalities without an English name:", missing_en)

    # ---- total population (住民基本台帳, 1 January) for the per-1,000 metric.
    # Dec period -> 1 Jan of the next year; Jun period -> mean of the surrounding 1 Januaries.
    pop = pd.read_parquet(POPULATION)
    by_year = {y: dict(zip(g["code"], g["population"])) for y, g in pop.groupby("year")}

    def pop_for(period: str, code: str) -> int | None:
        y, m = map(int, period.split("-"))
        years = [y + 1] if m == 12 else [y, y + 1]
        vals = [by_year.get(yy, {}).get(code) for yy in years]
        if any(v is None for v in vals):
            vals = [v for v in vals if v is not None][:1]  # latest year not published yet
        return round(sum(vals) / len(vals)) if vals else None

    meta["population"] = {
        "source": "総務省「住民基本台帳に基づく人口、人口動態及び世帯数」（総計、各年1月1日）",
        "pref": {p: [pop_for(p, "00000")] + [pop_for(p, f"{i:02d}000") for i in range(1, 48)]
                 for p in meta["periods"]["pref"]},
        "muni": {p: [None] + [pop_for(p, m["code"]) for m in meta["muni"]] for p in meta["periods"]["muni"]},
    }
    miss = [m["code"] for i, m in enumerate(meta["muni"]) if m["geo"] and meta["population"]["muni"][meta["periods"]["muni"][-1]][i + 1] is None]
    if miss:
        print("municipalities without population:", miss)
    # What this build was made from; check_updates.py compares it with e-Stat.
    meta["sources"] = {
        "zairyu": [{k: e.get(k) for k in ("dataset", "period", "stat_inf_id", "updated", "title")}
                   for e in json.loads(Path("data/raw/manifest.json").read_text(encoding="utf-8"))],
        "population": [{k: e.get(k) for k in ("year", "stat_inf_id", "updated")}
                       for e in json.loads(Path("data/raw/pop/manifest.json").read_text(encoding="utf-8"))],
    }

    # ---- pref files
    total = 0
    for period, df in t1.groupby("period", observed=True):
        df = df.assign(age5=age_idx(df["age_group_code"]))
        g = (df.groupby(["prefecture_code", "nationality_code", "status_code", "age5", "sex_code"], observed=True)
             ["count"].sum().reset_index())
        size = write_bin(OUT / "pref" / f"{period}.bin", g["count"].to_numpy(), [
            (g["nationality_code"].astype(str).map(nat_idx).to_numpy(), "u1"),
            (g["status_code"].astype(str).map(st_idx).to_numpy(), "u1"),
            (g["prefecture_code"].astype(int).to_numpy(), "u1"),
            (g["sex_code"].astype(int).to_numpy(), "u1"),
            (g["age5"].to_numpy(), "u1"),
        ])
        total += size
        print(f"pref {period}: {len(g):,} rows, {size/1024:,.0f} KB")

    # ---- muni files
    for period, df in t2.groupby("period", observed=True):
        df = df.assign(
            nat=df["nationality_code"].astype("string").map(nat_idx).fillna(0).astype(int),
            st=df["status_code"].astype("string").map(st_idx).fillna(0).astype(int),
            sex=df["sex_code"].fillna(0).astype(int),
            age5=df["age_group_code"].fillna(0).astype(int),
            mi=df["municipality_code"].map(muni_idx),
        )
        g = df.groupby(["mi", "nat", "st", "age5", "sex"])["count"].sum().reset_index()
        size = write_bin(OUT / "muni" / f"{period}.bin", g["count"].to_numpy(), [
            (g["mi"].to_numpy(), "<u2"), (g["nat"].to_numpy(), "u1"), (g["st"].to_numpy(), "u1"),
            (g["sex"].to_numpy(), "u1"), (g["age5"].to_numpy(), "u1"),
        ])
        total += size
        print(f"muni {period}: {len(g):,} rows, {size/1024:,.0f} KB")

    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"total data: {total/1024/1024:.1f} MB, meta {(OUT/'meta.json').stat().st_size/1024:.0f} KB")


if __name__ == "__main__":
    main()
