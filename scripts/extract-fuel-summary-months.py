#!/usr/bin/env python3
"""Build a books monthly patch from the fuel sheets of a Monthly Summary workbook.

Columns are located by their header text rather than by fixed offsets, so this
reads both workbook layouts: the single "20xx Fuel" sheets and the two-block
"Fuel Summary" sheet that carries 2025 on the left and 2026 on the right
(Westminster 42021, San Diego 42048). Month cells may be Excel serial dates or
labels such as "Jul 2026".

Usage: python3 scripts/extract-fuel-summary-months.py <file.xlsx> <storeId> <storeName>
Prints {"patches":[...]} JSON to stdout.
"""
from __future__ import annotations

import json
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


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
    t = c.get("t")
    v = c.find(f"{NS}v")
    isel = c.find(f"{NS}is")
    if t == "s" and v is not None and strings:
        try:
            return strings[int(v.text)]
        except Exception:
            return v.text
    if t == "inlineStr" and isel is not None:
        return "".join((x.text or "") for x in isel.iter(f"{NS}t"))
    if t == "str" and v is not None:
        return v.text
    if v is not None:
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
    return None if x is None or isinstance(x, str) else round(float(x), 2)


def r4(x):
    return None if x is None or isinstance(x, str) else round(float(x), 4)


MON = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}


def bare_month(val):
    if val is None:
        return None
    s = str(val).strip().lower()
    if s in MON:
        return MON[s]
    return MON.get(s[:3])


def month_key(value, fallback_year=None):
    """Read a "YYYY-MM" key from an Excel serial date or a label like "Jul 2026"."""
    if isinstance(value, (int, float)):
        if not 20000 < value < 80000:
            return None
        d = datetime(1899, 12, 30) + timedelta(days=int(value))
        return f"{d.year}-{d.month:02d}"
    bare = bare_month(value)
    if not bare:
        return None
    year = fallback_year
    for token in str(value).replace("-", " ").replace("/", " ").split():
        if token.isdigit() and len(token) == 4:
            year = int(token)
        elif token.isdigit() and len(token) == 2:
            year = 2000 + int(token)
    return f"{year}-{bare:02d}" if year else None


# Header text that identifies each fuel column. "Fuel Sales ($)" is the gross
# fuel revenue the site publishes as gas_sales; reading it by offset used to
# skip it, which left fuel revenue blank on the website.
FIELDS = (
    ("gas_vol", ("gas volume", "volume (gal)", "gallons"), r2),
    ("gas_sales", ("fuel sales", "gas sales", "fuel revenue"), r2),
    ("gas_margin", ("margin ($/gal)", "margin"), r4),
    ("gas_profit", ("profit ($)", "profit"), r2),
)


def header_blocks(row):
    """Find every "Month … Fuel Sales …" header block in one row.

    A sheet holding two years side by side yields one block per year, each
    mapping field name → column index.
    """
    labels = [str(x or "").strip().lower() for x in row]
    starts = [i for i, x in enumerate(labels) if x in ("month", "period")]
    blocks = []
    for pos, start in enumerate(starts):
        end = starts[pos + 1] if pos + 1 < len(starts) else len(labels)
        block = {"month": start}
        for key, needles, _ in FIELDS:
            for i in range(start + 1, end):
                if any(n in labels[i] for n in needles):
                    block.setdefault(key, i)
                    break
        if "gas_sales" in block or "gas_vol" in block:
            blocks.append(block)
    return blocks


def put(months, key, rec):
    if not key:
        return
    slot = months.setdefault(key, {})
    for k, v in rec.items():
        if v is not None and slot.get(k) is None:
            slot[k] = v


def read_fuel_sheet(rows, fallback_year=None):
    out = {}
    blocks = []
    for row in rows:
        found = header_blocks(row)
        if found:
            blocks = found
            continue
        for block in blocks:
            col = block["month"]
            key = month_key(row[col] if col < len(row) else None, fallback_year)
            if not key:
                continue
            rec = {}
            for field, _, rounder in FIELDS:
                i = block.get(field)
                if i is not None and i < len(row):
                    value = rounder(row[i])
                    if value is not None:
                        rec[field] = value
            if rec:
                put(out, key, rec)
    return out


def sheet_year(name):
    for token in str(name).replace("-", " ").split():
        if token.isdigit() and len(token) == 4:
            return int(token)
    return None


def fuel_sheets(by):
    """Fuel sheets worth reading, skipping year-over-year comparison sheets."""
    for name in by:
        low = name.lower()
        if "fuel" in low and " vs" not in low and not low.startswith("vs"):
            yield name


def extract(path: str, store_id: str, store_name: str):
    months = {}
    with zipfile.ZipFile(path) as z:
        strings = load_strings(z)
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rid = {rel.get("Id"): rel.get("Target") for rel in rels}
        by = {
            sh.get("name"): resolve(rid[sh.get(f"{REL}id")])
            for sh in wb.findall(f"{NS}sheets/{NS}sheet")
        }
        names = list(fuel_sheets(by))
        if not names:
            raise SystemExit("no fuel sheet")
        for name in names:
            rows = grid(z, by[name], strings)
            for key, rec in read_fuel_sheet(rows, sheet_year(name)).items():
                put(months, key, rec)

        if "Profit Summary" in by:
            in_table = False
            for row in grid(z, by["Profit Summary"], strings):
                labels = [str(x or "").strip().lower() for x in row]
                if labels and labels[0] == "month" and any("fuel 2025" in x for x in labels):
                    in_table = True
                    continue
                if not in_table:
                    continue
                lab = labels[0] if labels else ""
                if lab.startswith("ytd") or lab.startswith("total"):
                    break
                bare = bare_month(row[0] if row else None)
                if not bare or len(row) < 7:
                    continue
                put(months, f"2025-{bare:02d}",
                    {"gas_profit": r2(row[1]), "store_profit": r2(row[2]), "total_profit": r2(row[3])})
                put(months, f"2026-{bare:02d}",
                    {"gas_profit": r2(row[4]), "store_profit": r2(row[5]), "total_profit": r2(row[6])})

    for rec in months.values():
        if rec.get("fuel_profit") is None and rec.get("gas_profit") is not None:
            rec["fuel_profit"] = rec["gas_profit"]
        if rec.get("store_profit") is None and rec.get("sales") is not None and rec.get("purchases") is not None:
            rec["store_profit"] = r2(rec["sales"] - rec["purchases"])
        if rec.get("total_profit") is None and rec.get("store_profit") is not None and rec.get("gas_profit") is not None:
            rec["total_profit"] = r2(rec["store_profit"] + rec["gas_profit"])
        if rec.get("store_margin") is None and rec.get("sales"):
            rec["store_margin"] = r4(rec["store_profit"] / rec["sales"])
        if rec.get("gas_margin") is None and rec.get("gas_vol") and rec.get("gas_profit") is not None:
            rec["gas_margin"] = r4(rec["gas_profit"] / rec["gas_vol"])

    if not months:
        raise SystemExit("no fuel rows")

    fuel_keys = ("gas_vol", "gas_sales", "gas_margin", "gas_profit")
    fuel_months = {
        k: {kk: vv for kk, vv in rec.items() if kk in fuel_keys}
        for k, rec in months.items()
    }
    return {
        "file": path.rsplit("/", 1)[-1],
        "type": "monthly",
        "store": {"id": store_id, "name": store_name},
        "period": max(months),
        "patch": {
            "monthly": [{"id": store_id, "name": store_name, "months": months}],
            "fuel": [{"id": store_id, "name": store_name, "months": fuel_months}],
        },
    }


def main():
    if len(sys.argv) != 4:
        print("usage: extract-fuel-summary-months.py <file.xlsx> <storeId> <storeName>", file=sys.stderr)
        sys.exit(1)
    patch = extract(sys.argv[1], sys.argv[2], sys.argv[3])
    json.dump({"patches": [patch]}, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
