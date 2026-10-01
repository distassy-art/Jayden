#!/usr/bin/env python3
"""Build command-category-yoy.json from depts.json (+ daily_september for per-store through)."""
from __future__ import annotations

import argparse
import json
import re
import sys
from calendar import monthrange
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

EXCLUDE_STORE_IDS = {"42642", "42073", "42246", "42793", "demo"}
TARGET_MARGIN_YTD = 0.35
SALES_DOWN_THRESHOLD = 0.90
PURCH_HEAVY_THRESHOLD = 1.05
PURCH_LIGHT_THRESHOLD = 0.90


def money(x: float) -> str:
    x = float(x)
    if x < 0:
        return f"-${abs(x):,.2f}"
    return f"${x:,.2f}"


def norm(name: str) -> str:
    s = str(name or "").upper().replace("&", "AND")
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def r2(x: float) -> float:
    return round(float(x) + 1e-9, 2)


def r4(x: float) -> float:
    return round(float(x) + 1e-12, 4)


def parse_iso(d: str) -> date:
    return date.fromisoformat(str(d)[:10])


def daily_through_map(daily: Optional[dict], books_as_of: date) -> Dict[str, date]:
    out: Dict[str, date] = {}
    if not daily:
        return out
    stations = daily.get("stations")
    if not isinstance(stations, list):
        return out
    for st in stations:
        sid = str(st.get("id") or "")
        days = st.get("days") or []
        if not sid or not days:
            continue
        last = max(parse_iso(d["date"]) for d in days if d.get("date"))
        if last.year == books_as_of.year and last.month == books_as_of.month:
            out[sid] = last
        else:
            out[sid] = last
    return out


def latest_month_key(departments: List[dict]) -> Optional[str]:
    best: Optional[str] = None
    for dep in departments:
        y6 = dep.get("y2026") or {}
        keys = set((y6.get("months_sales") or {}).keys()) | set((y6.get("months_purch") or {}).keys())
        for k in keys:
            if not str(k).startswith("2026-"):
                continue
            if best is None or k > best:
                best = k
    return best


def month_bucket(dep: dict, key: Optional[str], field: str) -> float:
    y6 = dep.get("y2026") or {}
    if key:
        v = (y6.get(field) or {}).get(key)
        if v is not None:
            return float(v)
    return 0.0


def months_elapsed_store(through: date) -> float:
    dim = monthrange(through.year, through.month)[1]
    return (through.month - 1) + (through.day / dim)


def partial_scale(through: date, month_key: str) -> float:
    y, m = map(int, month_key.split("-"))
    if (y, m) != (through.year, through.month):
        return 1.0
    dim = monthrange(y, m)[1]
    return through.day / dim


def ly_monthly(y5: dict, field: str = "sales") -> Optional[float]:
    if not y5:
        return None
    val = y5.get(field)
    if val is None:
        return None
    try:
        v = float(val)
    except (TypeError, ValueError):
        return None
    if v <= 0:
        return None
    return v / 12.0


def margin_of(sales: float, purch: float) -> Optional[float]:
    if sales <= 0:
        return None
    return (sales - purch) / sales


def ytd_flags(
    cat: str,
    sales_ytd: float,
    purch_ytd: float,
    sales_ly: Optional[float],
    purch_ly: Optional[float],
    margin_ytd: Optional[float],
) -> List[dict]:
    flags: List[dict] = []
    if sales_ly is not None and sales_ly > 0 and sales_ytd < sales_ly * SALES_DOWN_THRESHOLD:
        drop = ((sales_ytd - sales_ly) / sales_ly) * 100
        if purch_ly is not None and purch_ly > 0 and purch_ytd < purch_ly * PURCH_LIGHT_THRESHOLD:
            flags.append(
                {
                    "code": "sales_down_underbuy",
                    "label": "Sales down — under-buying",
                    "detail": (
                        f"Sales YTD {money(sales_ytd)} vs LY pace {money(sales_ly)} ({drop:.0f}%). "
                        f"Purchases also light ({money(purch_ytd)} vs LY pace {money(purch_ly)}) — "
                        "risk of stockouts starving sales."
                    ),
                }
            )
        elif purch_ly is not None and purch_ly > 0 and purch_ytd > purch_ly * PURCH_HEAVY_THRESHOLD:
            flags.append(
                {
                    "code": "sales_down_overbuy",
                    "label": "Sales down — over-buying",
                    "detail": (
                        f"Sales YTD {money(sales_ytd)} vs LY pace {money(sales_ly)} ({drop:.0f}%). "
                        f"Purchases heavy ({money(purch_ytd)} vs LY pace {money(purch_ly)})."
                    ),
                }
            )
        else:
            flags.append(
                {
                    "code": "sales_down",
                    "label": "Sales down vs last year",
                    "detail": f"Sales YTD {money(sales_ytd)} vs LY pace {money(sales_ly)} ({drop:.0f}%).",
                }
            )
    elif (
        purch_ly is not None
        and purch_ly > 0
        and purch_ytd > purch_ly * 1.15
        and sales_ly is not None
        and sales_ly > 0
        and sales_ytd >= sales_ly * 0.95
    ):
        flags.append(
            {
                "code": "overbuy",
                "label": "Buying heavier vs last year",
                "detail": (
                    f"Purchases YTD {money(purch_ytd)} vs LY pace {money(purch_ly)} while sales are flat/up."
                ),
            }
        )
    if margin_ytd is not None and margin_ytd < TARGET_MARGIN_YTD:
        flags.append(
            {
                "code": "weak_margin",
                "label": "Not making enough margin",
                "detail": f"YTD margin {margin_ytd * 100:.1f}% (target ~40%).",
            }
        )
    return flags


def build_store(
    station: dict,
    books_as_of: date,
    through: date,
    latest_month: str,
) -> dict:
    sid = str(station["id"])
    departments = station.get("departments") or []
    scale = partial_scale(through, latest_month)
    any_ly_baseline = False
    categories: List[dict] = []

    for dep in departments:
        name = str(dep.get("name") or "Unknown")
        if norm(name) in ("TOTAL", "TOP 10 TOTAL"):
            continue
        y5 = dep.get("y2025") or {}
        y6 = dep.get("y2026") or {}
        ly_sales_m = ly_monthly(y5, "sales")
        ly_purch_m = ly_monthly(y5, "purchases")
        if ly_sales_m is not None:
            any_ly_baseline = True

        sales_full = float(y6.get("sales") or 0)
        purch_full = float(y6.get("purchases") or 0)
        sales_m = month_bucket(dep, latest_month, "months_sales")
        purch_m = month_bucket(dep, latest_month, "months_purch")

        sales_latest = r2(sales_m * scale) if sales_m else 0.0
        purch_latest = r2(purch_m * scale) if purch_m else 0.0

        if latest_month and (sales_m or purch_m):
            sales_ytd = r2(sales_full - sales_m + sales_latest)
            purch_ytd = r2(purch_full - purch_m + purch_latest)
        else:
            sales_ytd = r2(sales_full)
            purch_ytd = r2(purch_full)

        if not (sales_ytd or purch_ytd or sales_latest or purch_latest):
            continue

        mel = months_elapsed_store(through)
        sales_ly_ytd = r2(ly_sales_m * mel) if ly_sales_m is not None else None
        purch_ly_ytd = r2(ly_purch_m * mel) if ly_purch_m is not None else None
        sales_ly_m = r2(ly_sales_m) if ly_sales_m is not None else None
        purch_ly_m = r2(ly_purch_m) if ly_purch_m is not None else None

        m_ytd = margin_of(sales_ytd, purch_ytd)
        m_ly = None
        if y5.get("margin") is not None:
            try:
                m_ly = float(y5["margin"])
            except (TypeError, ValueError):
                m_ly = None
        if m_ly is None and y5.get("sales"):
            try:
                s5 = float(y5["sales"])
                p5 = float(y5.get("purchases") or 0)
                m_ly = margin_of(s5, p5)
            except (TypeError, ValueError):
                m_ly = None

        year_end_factor = 12.0 / mel if mel > 0 else None
        year_end_sales = r2(sales_ytd * year_end_factor) if year_end_factor else None
        year_end_purch = r2(purch_ytd * year_end_factor) if year_end_factor else None

        flags = ytd_flags(name, sales_ytd, purch_ytd, sales_ly_ytd, purch_ly_ytd, m_ytd)

        row: Dict[str, Any] = {
            "category": name,
            "salesYtd": sales_ytd,
            "purchYtd": purch_ytd,
            "salesLatestMonth": sales_latest,
            "purchLatestMonth": purch_latest,
            "marginYtd": r4(m_ytd) if m_ytd is not None else None,
            "marginLy": r4(m_ly) if m_ly is not None else None,
            "purchaseBudget": None,
            "yearEndSalesEst": year_end_sales,
            "yearEndPurchEst": year_end_purch,
            "flags": flags,
            "riskCount": len(flags),
        }
        if sales_ly_ytd is not None:
            row["salesLyYtdPace"] = sales_ly_ytd
            row["purchLyYtdPace"] = purch_ly_ytd
        if sales_ly_m is not None:
            row["salesLyMonthPace"] = sales_ly_m
            row["purchLyMonthPace"] = purch_ly_m
        categories.append(row)

    categories.sort(key=lambda c: (-(c.get("riskCount") or 0), c.get("category") or ""))
    at_risk = [c for c in categories if c.get("riskCount")]
    store: Dict[str, Any] = {
        "storeId": sid,
        "storeName": station.get("name") or sid,
        "deptDataThrough": through.isoformat(),
        "atRiskCount": len(at_risk),
        "atRisk": at_risk,
        "categories": categories,
    }
    if through < books_as_of:
        store["deptDataStale"] = True
    if not any_ly_baseline:
        store["lyBaselineMissing"] = True
    if sid == "42359" and latest_month.endswith("-09"):
        store["deptSeptemberNote"] = "September dept buckets used from months_sales (period_2026 label may lag)."
    return store


def build(depts: dict, daily: Optional[dict]) -> dict:
    books_as_of = parse_iso(depts["as_of"])
    daily_map = daily_through_map(daily, books_as_of)
    latest_books_month = books_as_of.strftime("%Y-%m")
    stores_out: List[dict] = []

    for station in depts.get("stations") or []:
        sid = str(station.get("id") or "")
        if not sid or sid in EXCLUDE_STORE_IDS:
            continue
        through = daily_map.get(sid, books_as_of)
        if through > books_as_of:
            through = books_as_of
        lm = latest_month_key(station.get("departments") or []) or latest_books_month
        stores_out.append(build_store(station, books_as_of, through, lm))

    stores_out.sort(key=lambda s: s.get("storeName") or s.get("storeId") or "")
    mel_global = months_elapsed_store(books_as_of)
    doc = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "asOf": books_as_of.isoformat(),
        "latestBooksMonth": latest_books_month,
        "method": {
            "salesPurchSource": "public/data/depts.json (site JSON — not Excel at runtime)",
            "budgetSource": "dept-purchase-budgets.json — same month only",
            "lySameMonths": (
                "2025 annual ÷ 12 × months_elapsed per store from deptDataThrough "
                "(partial latest month = day/days_in_month for that store; not global asOf fraction)"
            ),
            "yearEndEstimate": "YTD × (12 / months_elapsed_store)",
            "budgetPolicy": "same_month_spend_vs_same_month_budget",
            "budgetStatus": "awaiting_mina",
            "spec": "ASK-CURSOR-DEPT-YOY-STALENESS.md",
        },
        "stores": stores_out,
        "budgetFeedStatus": "awaiting_mina_same_month_budgets",
        "meta": {
            "storeCount": len(stores_out),
            "atRiskCount": sum(s.get("atRiskCount") or 0 for s in stores_out),
            "monthsElapsed": round(mel_global, 4),
            "deptsAsOf": books_as_of.isoformat(),
        },
    }
    return doc


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--depts", required=True)
    ap.add_argument("--daily", default="")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    depts = json.load(open(args.depts, encoding="utf-8"))
    daily = json.load(open(args.daily, encoding="utf-8")) if args.daily else None
    doc = build(depts, daily)
    text = json.dumps(doc, separators=(",", ":"), ensure_ascii=False)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"wrote {args.out} ({len(text)} bytes, {len(doc['stores'])} stores)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
