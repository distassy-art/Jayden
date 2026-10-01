#!/usr/bin/env python3
"""Build a books-save patch from the ExtraMile operational workbook
(Extramile.xlsx) whose month sheets are not the standard Daily template.

Usage: python3 scripts/extract-extramile-book.py <Extramile.xlsx>
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
STORE = {"id": "extramile", "name": "ExtraMile"}

SHEET_MONTH = {
    "JAN26": 1, "FEB26": 2, "MAR26": 3, "APR26": 4, "MAY26": 5, "JUN26": 6,
    "JULY26": 7, "JUL26": 7, "AUG26": 8, "SEP26": 9, "OCT26": 10, "NOV26": 11, "DEC26": 12,
    "JAN25": 1, "FEB25": 2, "MAR25": 3, "APR25": 4, "MAY25": 5, "JUN25": 6,
    "JUL25": 7, "JULY25": 7, "AUG25": 8, "SEP25": 9, "OCT25": 10, "NOV25": 11, "DEC25": 12,
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


def excel_date(n):
    if not isinstance(n, (int, float)) or n < 40000:
        return None
    return datetime(1899, 12, 30) + timedelta(days=int(n))


def header_map(row):
    labels = [str(x or "").strip().lower() for x in row]
    def find(*needles, exclude=(), start=0):
        for i, h in enumerate(labels):
            if i < start:
                continue
            if any(ex in h for ex in exclude):
                continue
            if all(n in h for n in needles):
                return i
        return None
    sales = find("sales")
    purch = find("purchas")
    vol = find("gas vol") or find("vol")
    tp = find("total profit")
    gp = find("gas profit")
    sp = find("profit", exclude=("gas", "total"))
    if gp is None and vol is not None:
        gp = find("profit", exclude=("total",), start=vol)
    return {
        "purch": purch,
        "sales": sales,
        "sp": sp,
        "vol": vol,
        "gp": gp,
        "tp": tp,
        "sm": find("margin", exclude=("gas",)),
    }


def extract(path: str):
    days = []
    with zipfile.ZipFile(path) as z:
        strings = load_strings(z)
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rid = {rel.get("Id"): rel.get("Target") for rel in rels}
        sheets = [
            (sh.get("name"), resolve(rid[sh.get(f"{REL}id")]))
            for sh in wb.findall(f"{NS}sheets/{NS}sheet")
        ]
        for name, target in sheets:
            key = name.replace(" ", "").upper()
            if key not in SHEET_MONTH:
                continue
            rows = grid(z, target, strings)
            hi = None
            cols = None
            for i, row in enumerate(rows[:12]):
                labels = [str(x or "").strip().lower() for x in row]
                if labels and labels[0] == "day" and any("sales" in h for h in labels):
                    hi = i
                    cols = header_map(row)
                    break
            if hi is None or cols["sales"] is None:
                continue
            for row in rows[hi + 1 :]:
                dt = excel_date(row[0] if row else None)
                if not dt:
                    continue
                def g(k):
                    i = cols.get(k)
                    if i is None or i >= len(row):
                        return None
                    v = row[i]
                    return v if isinstance(v, (int, float)) else None
                sales, purch, vol, gp, sp, tp = g("sales"), g("purch"), g("vol"), g("gp"), g("sp"), g("tp")
                # Unfilled future-month sheets still have date serials with zeros.
                if not any(isinstance(v, (int, float)) and v != 0 for v in (sales, purch, vol, gp, sp, tp)):
                    continue
                # Skip leaked month-to-date totals sitting in a daily row.
                if purch is not None and purch > 20000:
                    continue
                if sp is None and sales is not None and purch is not None:
                    sp = sales - purch
                if gp is None and vol is not None:
                    mar = g("sm")
                    if mar is not None and mar > 2:
                        mar = mar / 100.0
                    if mar is not None:
                        gp = vol * mar
                if tp is None and sp is not None and gp is not None:
                    tp = sp + gp
                sm = None
                if sales:
                    sm = (sp / sales) if sp is not None else None
                days.append({
                    "date": dt.strftime("%Y-%m-%d"),
                    "gas_vol": r2(vol),
                    "gas_profit": r2(gp),
                    "sales": r2(sales),
                    "purch": r2(purch),
                    "store_profit": r2(sp),
                    "margin": r4(sm),
                    "total_profit": r2(tp),
                })

    by = {}
    for d in days:
        by[d["date"]] = d
    days = [by[k] for k in sorted(by)]
    if not days:
        raise SystemExit("no ExtraMile daily rows")

    months = {}
    for d in days:
        key = d["date"][:7]
        slot = months.setdefault(key, {"sales": 0, "purchases": 0, "gas_vol": 0, "gas_profit": 0, "store_profit": 0, "total_profit": 0, "n": 0})
        slot["sales"] += d["sales"] or 0
        slot["purchases"] += d["purch"] or 0
        slot["gas_vol"] += d["gas_vol"] or 0
        slot["gas_profit"] += d["gas_profit"] or 0
        slot["store_profit"] += d["store_profit"] or 0
        slot["total_profit"] += d["total_profit"] or 0
        slot["n"] += 1
    out_months = {}
    for k, s in months.items():
        if not s["sales"] and not s["gas_vol"]:
            continue
        rec = {
            "sales": r2(s["sales"]),
            "purchases": r2(s["purchases"]),
            "gas_vol": r2(s["gas_vol"]),
            "gas_profit": r2(s["gas_profit"]),
            "store_profit": r2(s["store_profit"]),
            "total_profit": r2(s["total_profit"]),
            "days": s["n"],
        }
        if s["sales"]:
            rec["store_margin"] = r4(s["store_profit"] / s["sales"])
        if s["gas_vol"]:
            rec["gas_margin"] = r4(s["gas_profit"] / s["gas_vol"])
            rec["fuel_profit"] = rec["gas_profit"]
        out_months[k] = rec

    july = [d for d in days if d["date"].startswith("2026-07")]
    aug = [d for d in days if d["date"].startswith("2026-08")]
    later = [d for d in days if d["date"][:7] >= "2026-09"]
    patch = {
        "daily": [{"id": STORE["id"], "name": STORE["name"], "days": aug + later}],
        "dailyJuly": [{"id": STORE["id"], "name": STORE["name"], "days": july}],
        "monthly": [{"id": STORE["id"], "name": STORE["name"], "months": out_months}],
        "fuel": [{"id": STORE["id"], "name": STORE["name"], "months": {
            k: {"gas_vol": v.get("gas_vol"), "gas_profit": v.get("gas_profit"), "gas_margin": v.get("gas_margin")}
            for k, v in out_months.items()
        }}],
    }
    period = days[-1]["date"][:7]
    return {
        "file": path.rsplit("/", 1)[-1],
        "type": "daily",
        "store": STORE,
        "period": period,
        "patch": patch,
    }


def main():
    if len(sys.argv) != 2:
        print("usage: extract-extramile-book.py <Extramile.xlsx>", file=sys.stderr)
        sys.exit(1)
    patch = extract(sys.argv[1])
    json.dump({"patches": [patch]}, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
