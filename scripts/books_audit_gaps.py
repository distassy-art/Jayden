#!/usr/bin/env python3
"""Report missing daily rows in OneDrive Daily workbooks through a target date."""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "scripts"))
from sync_from_excel import STORE_FILES, extract_station, resolve_path  # noqa: E402


def expected_days(month: str, through: date) -> set[str]:
    y, m = map(int, month.split("-"))
    last = through.day if (through.year, through.month) == (y, m) else (
        30 if m != 2 else 28
    )
    if month.endswith("-09") and through >= date(y, m, 30):
        last = 30
    return {date(y, m, d).isoformat() for d in range(1, last + 1)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx-dir", required=True, type=Path)
    ap.add_argument("--through", required=True, help="YYYY-MM-DD (Pacific target)")
    ap.add_argument("--json", type=Path)
    args = ap.parse_args()
    through = date.fromisoformat(args.through)
    months = sorted({through.strftime("%Y-%m"), f"{through.year}-09"} if through.month == 10 else [through.strftime("%Y-%m")])
    if through.month == 10 and "2026-09" not in months:
        months.insert(0, f"{through.year}-09")

    report: dict = {"through": through.isoformat(), "stores": {}}
    any_gap = False
    for sid, (name, fname) in sorted(STORE_FILES.items()):
        if sid == "extramile":
            continue
        path = resolve_path(args.xlsx_dir, sid, fname)
        if not path:
            report["stores"][sid] = {"error": "missing_file", "name": name}
            any_gap = True
            continue
        store = {"name": name, "months": {}}
        for ym in months:
            st = extract_station(path, sid, name, fname, ym)
            have = {d["date"] for d in st["days"]}
            exp = expected_days(ym, through)
            if ym.startswith("2026-09") and through.month == 10:
                exp = expected_days(ym, date(int(ym[:4]), 9, 30))
            gaps = sorted(exp - have)
            bogus = [
                {"date": d["date"], "sales": d["sales"]}
                for d in st["days"]
                if d.get("sales") and float(d["sales"]) > 50000
            ]
            zeros = sorted(
                d["date"]
                for d in st["days"]
                if d["date"] in exp and float(d.get("sales") or 0) == 0
            )
            store["months"][ym] = {
                "days": len(st["days"]),
                "last": st["days"][-1]["date"] if st["days"] else None,
                "gaps": gaps,
                "zero_sales_days": zeros,
                "bogus_sales": bogus,
            }
            if gaps or bogus or zeros:
                any_gap = True
        report["stores"][sid] = store

    report["ok"] = not any_gap
    text = json.dumps(report, indent=2)
    if args.json:
        args.json.write_text(text + "\n")
    print(text)
    raise SystemExit(0 if report["ok"] else 1)


if __name__ == "__main__":
    main()
