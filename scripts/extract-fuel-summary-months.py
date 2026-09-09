#!/usr/bin/env python3
"""Build a books-save monthly patch from Monthly Summary workbooks whose
Fuel Summary sheet uses Excel serial dates (Westminster / San Diego layout).

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
    return None if x is None else round(float(x), 2)


def r4(x):
    return None if x is None else round(float(x), 4)


def excel_ym(n):
    if not isinstance(n, (int, float)) or n < 40000:
        return None
    d = datetime(1899, 12, 30) + timedelta(days=int(n))
    return f"{d.year}-{d.month:02d}"


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
    key = s[:3]
    return MON.get(key)


def put(months, key, rec):
    if not key:
        return
    slot = months.setdefault(key, {})
    for k, v in rec.items():
        if v is not None and slot.get(k) is None:
            slot[k] = v


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
        if "Fuel Summary" not in by:
            raise SystemExit("no Fuel Summary sheet")
        for row in grid(z, by["Fuel Summary"], strings):
            if not row or not isinstance(row[0], (int, float)) or row[0] < 40000:
                continue
            k25 = excel_ym(row[0])
            if k25 and len(row) > 4 and row[1] not in (None, ""):
                gp = r2(row[4])
                put(
                    months,
                    k25,
                    {
                        "gas_vol": r2(row[1]),
                        "gas_profit": gp,
                        "gas_margin": r4(row[3]) if len(row) > 3 else None,
                        "fuel_profit": gp,
                    },
                )
            if len(row) > 10 and isinstance(row[6], (int, float)) and row[6] > 40000:
                k26 = excel_ym(row[6])
                if k26 and row[7] not in (None, ""):
                    gp = r2(row[10])
                    put(
                        months,
                        k26,
                        {
                            "gas_vol": r2(row[7]),
                            "gas_profit": gp,
                            "gas_margin": r4(row[9]) if len(row) > 9 else None,
                            "fuel_profit": gp,
                        },
                    )
        if "Profit Summary" in by:
            in_table = False
            for row in grid(z, by["Profit Summary"], strings):
                labels = [str(x or "").strip().lower() for x in row]
                if labels and labels[0] == "month" and any("fuel 2025" in x or x == "fuel 2025" for x in labels):
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
                k25 = f"2025-{bare:02d}"
                k26 = f"2026-{bare:02d}"
                put(months, k25, {"gas_profit": r2(row[1]), "store_profit": r2(row[2]), "total_profit": r2(row[3])})
                put(months, k26, {"gas_profit": r2(row[4]), "store_profit": r2(row[5]), "total_profit": r2(row[6])})
    for rec in months.values():
        if rec.get("store_profit") is None and rec.get("sales") is not None and rec.get("purchases") is not None:
            rec["store_profit"] = r2(rec["sales"] - rec["purchases"])
        if rec.get("total_profit") is None and rec.get("store_profit") is not None and rec.get("gas_profit") is not None:
            rec["total_profit"] = r2(rec["store_profit"] + rec["gas_profit"])
        if rec.get("store_margin") is None and rec.get("sales"):
            rec["store_margin"] = r4(rec["store_profit"] / rec["sales"])
        if rec.get("gas_margin") is None and rec.get("gas_vol") and rec.get("gas_profit") is not None:
            rec["gas_margin"] = r4(rec["gas_profit"] / rec["gas_vol"])

    if not months:
        raise SystemExit("no serial-date fuel rows")

    fuel_months = {
        k: {kk: vv for kk, vv in rec.items() if kk in ("gas_vol", "gas_profit", "gas_margin")}
        for k, rec in months.items()
    }
    return {
        "file": path.rsplit("/", 1)[-1],
        "type": "monthly",
        "store": {"id": store_id, "name": store_name},
        "period": "2026-07",
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
