#!/usr/bin/env python3
"""Add Sep 2026-09-25..28 Daily Book top-10 dept sales to public/data/depts.json."""
from __future__ import annotations

import importlib.util
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEPTS_IN = Path("/tmp/depts_live.json")
DAILY_PATH = ROOT / "site-publish/public/data/daily_september.json"
PDF_ROOT = Path("/tmp/s2k/exports/dly_dpt_run")
OUT_PUBLIC = ROOT / "site-publish/public/data/depts.json"
OUT_API = ROOT / "site-publish/api/cf-dist/data/depts.json"
FS_PATH = Path("/tmp/s2k/fill_secondary_tables.py")

DAYS = (25, 26, 27, 28)
SKIP_STATIONS = {"extramile"}

SINGLE_FOLDER = {
    "42179": "42179_HB",
    "42352": "42352_Db",
    "42004": "42004_Pl",
    "42674": "42674_Tu",
}

BD_TSO = {
    "42021": "42021",
    "42048": "42048",
    "42098": "42098",
    "42279": "42279",
    "42280": "42280",
    "42281": "42281",
    "42282": "42282",
    "42359": "42073",
    "42399": "42399",
    "42438": "42438",
    "42439": "42439",
}


def r2(x: float) -> float:
    return round(float(x) + 1e-9, 2)


def r4(x: float) -> float:
    return round(float(x) + 1e-12, 4)


def norm(s: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "", (s or "").upper())


def load_fs():
    spec = importlib.util.spec_from_file_location("fs", FS_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def pdf_for(station_id: str, day: int) -> Path:
    name = f"09{day:02d}2026.pdf"
    if station_id in SINGLE_FOLDER:
        return PDF_ROOT / SINGLE_FOLDER[station_id] / name
    return PDF_ROOT / "BD_central" / name


def match_amount(pdf_depts: dict, dept_name: str) -> float:
    nd = {norm(k): v for k, v in pdf_depts.items() if v is not None}
    key = norm(dept_name)
    if key in nd:
        return float(nd[key])
    hits = [(k, v) for k, v in nd.items() if key in k or k in key]
    if hits:
        hits.sort(key=lambda x: abs(len(x[0]) - len(key)))
        return float(hits[0][1])
    return 0.0


def top10_day_sum(fs, station_id: str, day: int) -> float:
    tso = BD_TSO.get(station_id, station_id)
    path = pdf_for(station_id, day)
    if not path.exists() or path.stat().st_size < 1000:
        return 0.0
    parsed = fs.parse_pdf(path, tso)
    return sum(v or 0.0 for v in parsed["depts"].values())


def main() -> int:
    fs = load_fs()
    depts = json.loads(DEPTS_IN.read_text())
    daily = json.loads(DAILY_PATH.read_text())
    daily_by_id = {s["id"]: s for s in daily["stations"]}

    store_top10_2528: dict[str, float] = {}
    off_stores: list[str] = []

    for st in depts["stations"]:
        sid = st["id"]
        if sid in SKIP_STATIONS:
            continue

        per_dept_delta: dict[str, float] = defaultdict(float)
        top10_total = 0.0

        for day in DAYS:
            tso = BD_TSO.get(sid, sid)
            path = pdf_for(sid, day)
            if not path.exists():
                print(f"WARN missing PDF {sid} day {day}", file=sys.stderr)
                continue
            parsed = fs.parse_pdf(path, tso)
            day_sum = 0.0
            for dep in st["departments"]:
                amt = match_amount(parsed["depts"], dep["name"])
                if amt:
                    per_dept_delta[dep["name"]] += amt
                    day_sum += amt
            top10_total += day_sum

        store_top10_2528[sid] = r2(top10_total)

        dst = daily_by_id.get(sid)
        daily_sales = 0.0
        if dst:
            for day in DAYS:
                dstr = f"2026-09-{day:02d}"
                for row in dst.get("days", []):
                    if row.get("date") == dstr:
                        daily_sales += float(row.get("sales") or 0)
                        break
        daily_sales = r2(daily_sales)
        if daily_sales > 0:
            diff = abs(top10_total - daily_sales) / daily_sales
            if diff > 0.15:
                off_stores.append(
                    f"{sid} top10={top10_total} daily={daily_sales} pct={diff*100:.1f}%"
                )

        for dep in st["departments"]:
            delta = r2(per_dept_delta.get(dep["name"], 0.0))
            if delta <= 0:
                continue
            y = dep["y2026"]
            ms = y.setdefault("months_sales", {})
            ms["2026-09"] = r2(float(ms.get("2026-09", 0)) + delta)
            y["sales"] = r2(float(y.get("sales", 0)) + delta)
            purch = float(y.get("purchases") or 0)
            y["profit"] = r2(y["sales"] - purch)
            y["margin"] = r4(y["profit"] / y["sales"]) if y["sales"] else 0.0

    depts["as_of"] = "2026-09-28"
    note = depts.get("note") or ""
    if "Sep 2026 MTD" in note:
        depts["note"] = note.replace("through 2026-09-24", "through 2026-09-28").replace(
            "Sep MTD", "Sep MTD through 2026-09-28"
        )
    else:
        depts["note"] = (
            "Sep 2026 MTD merged from Daily Book Top-10 sales day-sums + VS purchases Cost$; "
            "Aug preserved; La Mesa excluded; through 2026-09-28"
        )

    OUT_PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(depts, indent=2)
    OUT_PUBLIC.write_text(text + "\n")
    OUT_API.parent.mkdir(parents=True, exist_ok=True)
    OUT_API.write_text(text + "\n")

    report = {
        "store_top10_2528": store_top10_2528,
        "off_by_more_than_15pct": off_stores,
    }
    Path("/tmp/depts_extend_0928_report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
