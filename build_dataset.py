"""Build one unified, sorted long-format dataset from the downloaded
在留外国人統計テーブルデータ files (see estat_crawler.py).

Every period's file is normalised to the 2023-12+ layout
（国籍・地域別 在留資格別 都道府県別 年齢・性別）:

    period, year, month,
    region_code, region, nationality_code, nationality,
    status_code, status,
    prefecture_code, prefecture,
    sex_code, sex,
    age, age_label, age_group_code, age_group,
    count

Differences between periods that are smoothed out here:
  * 4 different nationality code formats -> the current "RR_NNN" scheme,
    renamed countries mapped to their current names;
  * age as "05歳" / 5 / "5" -> integer; 2019-12 has single ages up to 100+,
    they are top-coded into "80歳以上" like every other period
    (age = 80 means 80+, age = NA means 不詳);
  * sex "1:男" / "1：男" / "01：男" -> 1/2/3.

Usage:
    python build_dataset.py            # -> data/zairyu_gaikokujin_pref_age_sex.{parquet,csv.gz}
    python build_dataset.py --no-csv
"""

from __future__ import annotations

import argparse
import logging
import re
from pathlib import Path

import openpyxl
import pandas as pd

RAW_DIR = Path("data/raw")
INTERIM_DIR = Path("data/interim")
OUT_BASE = Path("data/zairyu_gaikokujin_pref_age_sex")

log = logging.getLogger("build_dataset")

# Old name -> current name.
NATIONALITY_ALIASES = {
    "（朝鮮）": "朝鮮",
    "スワジランド": "エスワティニ",
    "マケドニア": "北マケドニア",
    "セントクリストファー・ネーヴィス": "セントクリストファー・ネービス",
}
REGIONS = {
    "01": "アジア", "02": "ヨーロッパ", "03": "アフリカ", "04": "北米",
    "05": "南米", "06": "オセアニア", "07": "無国籍",
}
SEX = {"1": "男", "2": "女", "3": "その他"}
AGE_TOP = 80

# ---------------------------------------------------------------- reading


def read_long_sheet(path: Path) -> pd.DataFrame:
    """Return the flat data sheet (the one with 都道府県 and 在留外国人数 columns)."""
    wb = openpyxl.load_workbook(path, read_only=True)
    try:
        for ws in wb.worksheets:
            rows = ws.iter_rows(values_only=True)
            header = next(rows, None)
            if header and "在留外国人数" in header and "都道府県" in header:
                cols = [str(h) for h in header]
                df = pd.DataFrame((r for r in rows if any(v is not None for v in r)), columns=cols)
                log.info("%s: sheet %r, %d rows", path.name, ws.title, len(df))
                return df
    finally:
        wb.close()
    raise ValueError(f"{path}: no long-format sheet found")


def load_raw(period: str, path: Path, use_cache: bool) -> pd.DataFrame:
    cache = INTERIM_DIR / f"{period}_t1.parquet"
    if use_cache and cache.exists() and cache.stat().st_mtime >= path.stat().st_mtime:
        return pd.read_parquet(cache)
    df = read_long_sheet(path)
    df = df.astype({c: "string" for c in df.columns if c != "在留外国人数"})
    INTERIM_DIR.mkdir(parents=True, exist_ok=True)
    df.to_parquet(cache, index=False)
    return df


# ---------------------------------------------------------------- parsing

MODERN_NAT = re.compile(r"^(\d\d)_(\d{3})：(.+)$")  # 01_011：韓国
REGION_NAT = re.compile(r"^\d\d\D+?[　 ]*\d{2,3}(\D.*)$")  # 02アジア　　002アラブ首長国連邦
PLAIN_NAT = re.compile(r"^\d{2,3}(\D.*)$")  # 002アラブ首長国連邦 / 08無国籍


def nationality_name(raw: str) -> str:
    raw = raw.strip()
    for rx in (MODERN_NAT, REGION_NAT, PLAIN_NAT):
        m = rx.match(raw)
        if m:
            name = m.groups()[-1].strip()
            return NATIONALITY_ALIASES.get(name, name)
    return NATIONALITY_ALIASES.get(raw, raw)


def build_nationality_codes(raw_values: dict[str, set[str]]) -> dict[str, str]:
    """name -> 'RR_NNN', taken from periods that use the modern code scheme (latest wins)."""
    codes: dict[str, str] = {}
    for period in sorted(raw_values):
        for v in raw_values[period]:
            m = MODERN_NAT.match(v.strip())
            if m:
                codes[nationality_name(v)] = f"{m.group(1)}_{m.group(2)}"
    return codes


def code_name(s: pd.Series) -> tuple[pd.Series, pd.Series]:
    """'35：永住者' / '1:男' -> ('35', '永住者')."""
    parts = s.str.strip().str.extract(r"^(\d+)\s*[：:]\s*(.+)$")
    return parts[0], parts[1]


def parse_age(s: pd.Series) -> pd.Series:
    s = s.astype("string").str.strip()
    num = pd.to_numeric(s.str.extract(r"^(\d+)", expand=False), errors="coerce")
    return num.clip(upper=AGE_TOP).astype("Int64")  # "80歳以上" -> 80, "不詳" -> NA


def age_labels(age: pd.Series) -> pd.DataFrame:
    grp = (age // 5).clip(upper=AGE_TOP // 5)
    lo = grp * 5

    def label(a, fmt: str) -> str:
        if pd.isna(a):
            return "不詳"
        a = int(a)
        return f"{a}歳以上" if a >= AGE_TOP else fmt.format(a=a, b=a + 4)

    return pd.DataFrame({
        "age_label": age.astype(object).map(lambda a: label(a, "{a}歳")),
        "age_group_code": (grp + 1).astype("Int64"),
        "age_group": lo.astype(object).map(lambda a: label(a, "{a}～{b}歳")),
    }, index=age.index)


def normalise(period: str, df: pd.DataFrame, nat_codes: dict[str, str]) -> pd.DataFrame:
    out = pd.DataFrame(index=df.index)
    year, month = period.split("-")
    out["period"] = period
    out["year"] = int(year)
    out["month"] = int(month)

    names = df["国籍・地域"].map(nationality_name)
    unknown = sorted(set(names) - set(nat_codes))
    if unknown:
        log.warning("%s: nationalities without a code: %s", period, unknown)
    out["nationality_code"] = names.map(nat_codes)
    out["region_code"] = out["nationality_code"].str[:2]
    out["region"] = out["region_code"].map(REGIONS)
    out["nationality"] = names

    out["status_code"], out["status"] = code_name(df["在留資格"])
    out["prefecture_code"], out["prefecture"] = code_name(df["都道府県"])
    sex_code, _ = code_name(df["性別"])
    out["sex_code"] = pd.to_numeric(sex_code).astype("Int64")
    out["sex"] = sex_code.str.lstrip("0").map(SEX)

    out["age"] = parse_age(df["年齢"])
    out = out.join(age_labels(out["age"]))
    out["count"] = pd.to_numeric(df["在留外国人数"]).astype("int64")

    for col in ("nationality_code", "status", "prefecture", "sex"):
        if out[col].isna().any():
            bad = df.loc[out[col].isna()].head(3).to_dict("records")
            raise ValueError(f"{period}: could not parse {col}: {bad}")

    # Top-coding ages (2019-12) creates duplicate keys -> aggregate.
    keys = [c for c in out.columns if c != "count"]
    return out.groupby(keys, dropna=False, sort=False, observed=True, as_index=False)["count"].sum()


SORT_KEYS = ["period", "nationality_code", "status_code", "prefecture_code", "age", "sex_code"]
COLUMNS = [
    "period", "year", "month",
    "region_code", "region", "nationality_code", "nationality",
    "status_code", "status", "prefecture_code", "prefecture",
    "sex_code", "sex", "age", "age_label", "age_group_code", "age_group",
    "count",
]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", type=Path, default=RAW_DIR)
    ap.add_argument("--out", type=Path, default=OUT_BASE, help="output path without extension")
    ap.add_argument("--no-csv", action="store_true")
    ap.add_argument("--no-cache", action="store_true", help="re-read xlsx even if data/interim has it")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    files = sorted(args.raw.glob("????-??_t1.xlsx"))
    if not files:
        raise SystemExit(f"no files in {args.raw}; run estat_crawler.py first")

    raw = {f.name[:7]: load_raw(f.name[:7], f, not args.no_cache) for f in files}
    nat_codes = build_nationality_codes({p: set(df["国籍・地域"].dropna()) for p, df in raw.items()})

    parts = [normalise(p, df, nat_codes) for p, df in raw.items()]
    data = pd.concat(parts, ignore_index=True)[COLUMNS]
    data = data.sort_values(SORT_KEYS, na_position="last", kind="stable").reset_index(drop=True)
    cat_cols = ["period", "region_code", "region", "nationality_code", "nationality", "status_code",
                "status", "prefecture_code", "prefecture", "sex", "age_label", "age_group"]
    data[cat_cols] = data[cat_cols].astype("category")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    data.to_parquet(args.out.with_suffix(".parquet"), index=False)
    log.info("wrote %s (%d rows)", args.out.with_suffix(".parquet"), len(data))
    if not args.no_csv:
        csv_path = args.out.with_suffix(".csv.gz")
        data.to_csv(csv_path, index=False, encoding="utf-8")
        log.info("wrote %s", csv_path)

    summary = data.groupby("period", observed=True)["count"].sum()
    print("\nTotal 在留外国人 by period:")
    print(summary.map("{:,}".format).to_string())


if __name__ == "__main__":
    main()
