#!/usr/bin/env python3
"""Extract daily rows from standard store Daily.xlsx month sheets.

books-parse often misses the current month when date cells are DATE()
formulas with empty cached values. San Diego keeps values on
"<Month> Calculations" sheets; Brookhurst keeps them on
"<Month> YYYY Source" sheets.

Usage:
  python3 scripts/extract-daily-month-sheets.py <Daily.xlsx> [--min-month 2026-09]
Prints a JSON array of day objects to stdout.
"""
from __future__ import annotations

import argparse
import calendar
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
DATE_F = re.compile(r"DATE\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)", re.I)
MONTH_SHEET = re.compile(
    r"^(January|February|March|April|May|June|July|August|September|October|November|December)"
    r"(?:\s+(\d{4}))?(?:\s+Calculations|\s+Source)?$",
    re.I,
)
MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}


def resolve(target: str) -> str:
    target = target.replace("\\", "/")
    if target.startswith("/"):
        target = target[1:]
    return target if target.startswith("xl/") else "xl/" + target


def col_idx(ref: str) -> int:
    col = "".join(ch for ch in ref if ch.isalpha())
    n = 0
    for ch in col:
        n = n * 26 + ord(ch.upper()) - 64
    return n - 1


def cell_val(c, strings):
    f = c.find(f"{NS}f")
    if f is not None and f.text:
        m = DATE_F.search(f.text.replace(" ", ""))
        if m:
            y, mo, d = map(int, m.groups())
            try:
                return (datetime(y, mo, d) - datetime(1899, 12, 30)).days
            except ValueError:
                pass
    t = c.get("t")
    v = c.find(f"{NS}v")
    isel = c.find(f"{NS}is")
    if t == "s" and v is not None and v.text and strings:
        try:
            return strings[int(v.text)]
        except Exception:
            return v.text
    if t == "inlineStr" and isel is not None:
        return "".join((x.text or "") for x in isel.iter(f"{NS}t"))
    if v is not None and v.text not in (None, ""):
        try:
            return float(v.text)
        except Exception:
            return v.text
    return None


def load_strings(z):
    try:
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    out = []
    for si in root.findall(f"{NS}si"):
        out.append("".join(t.text or "" for t in si.iter(f"{NS}t")))
    return out


def grid(z, target, strings):
    root = ET.fromstring(z.read(target))
    cells = {}
    maxr = maxc = 0
    for c in root.iter(f"{NS}c"):
        ref = c.get("r")
        r = int("".join(ch for ch in ref if ch.isdigit()))
        ci = col_idx(ref)
        cells[(r, ci)] = cell_val(c, strings)
        maxr = max(maxr, r)
        maxc = max(maxc, ci)
    return [[cells.get((r, c)) for c in range(maxc + 1)] for r in range(1, maxr + 1)]


def r2(x):
    return None if x is None else round(float(x), 2)


def r4(x):
    return None if x is None else round(float(x), 4)


def excel_date(n):
    if not isinstance(n, (int, float)) or n < 40000:
        return None
    return datetime(1899, 12, 30) + timedelta(days=int(n))


def header_map(row):
    labels = [str(x or "").strip().lower() for x in row]

    def find(*needles, exclude=()):
        for i, h in enumerate(labels):
            if any(ex in h for ex in exclude):
                continue
            if all(n in h for n in needles):
                return i
        return None

    return {
        "vol": find("gas volume") or find("gas vol") or find("volume (gal)"),
        "gp": find("gas profit"),
        "sales": find("c-store sales") or find("sales"),
        "purch": find("purchase"),
        "sp": find("store profit"),
        "tp": find("total profit"),
        "sm": find("store margin") or find("margin", exclude=("gas",)),
    }


def day_obj(dt, sales, purch, vol, gp, sp, tp):
    if sp is None and sales is not None and purch is not None:
        sp = sales - purch
    if tp is None and sp is not None and gp is not None:
        tp = sp + gp
    sm = (sp / sales) if (sales and sp is not None) else None
    return {
        "date": dt.strftime("%Y-%m-%d"),
        "gas_vol": r2(vol),
        "gas_profit": r2(gp),
        "sales": r2(sales),
        "purch": r2(purch),
        "store_profit": r2(sp),
        "margin": r4(sm),
        "total_profit": r2(tp),
    }


def extract_days(path: str, min_month="2026-09"):
    days = []
    with zipfile.ZipFile(path) as z:
        strings = load_strings(z)
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rid = {rel.get("Id"): rel.get("Target") for rel in rels}
        for sh in wb.findall(f"{NS}sheets/{NS}sheet"):
            name = sh.get("name")
            m = MONTH_SHEET.match(name or "")
            if not m:
                continue
            year = int(m.group(2)) if m.group(2) else 2026
            month = MONTHS[m.group(1).lower()]
            if f"{year:04d}-{month:02d}" < min_month:
                continue
            target = resolve(rid[sh.get(f"{REL}id")])
            rows = grid(z, target, strings)
            hi = None
            cols = None
            for i, row in enumerate(rows[:20]):
                labels = [str(x or "").strip().lower() for x in row]
                if labels and "date" in labels[0] and any("gas" in h and "vol" in h for h in labels):
                    hi = i
                    cols = header_map(row)
                    break
            if hi is None:
                continue

            def g(row, k):
                i = cols.get(k)
                if i is None or i >= len(row):
                    return None
                v = row[i]
                return v if isinstance(v, (int, float)) else None

            for offset, row in enumerate(rows[hi + 1 :]):
                if row and isinstance(row[0], str) and str(row[0]).strip():
                    break
                dt = excel_date(row[0] if row else None)
                if not dt:
                    dayn = offset + 1
                    last = calendar.monthrange(year, month)[1]
                    if dayn > last:
                        continue
                    dt = datetime(year, month, dayn)
                if dt.year != year or dt.month != month:
                    continue
                sales, purch, vol, gp, sp, tp = (
                    g(row, "sales"),
                    g(row, "purch"),
                    g(row, "vol"),
                    g(row, "gp"),
                    g(row, "sp"),
                    g(row, "tp"),
                )
                if not any(isinstance(v, (int, float)) and v != 0 for v in (sales, purch, vol, gp, sp, tp)):
                    continue
                days.append(day_obj(dt, sales, purch, vol, gp, sp, tp))
    by = {d["date"]: d for d in days}
    return [by[k] for k in sorted(by)]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("xlsx")
    ap.add_argument("--min-month", default="2026-09", help="YYYY-MM inclusive lower bound")
    args = ap.parse_args()
    extra = extract_days(args.xlsx, min_month=args.min_month)
    json.dump(extra, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
