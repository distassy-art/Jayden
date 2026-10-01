#!/usr/bin/env python3
"""Attach store-level daily MTD sales/purch to command-category-yoy.json for every store.

Flags department category purchase feeds that are missing/zero vs daily books so Command
Center can steer margin decisions to store daily totals (see ASK-CURSOR-DEPT-PURCH-FEED.md).
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Dict, Optional, Tuple


def sum_daily(st: dict) -> Tuple[float, float]:
    sales = purch = 0.0
    for day in st.get("days") or []:
        if not isinstance(day, dict):
            continue
        sales += float(day.get("sales") or 0)
        purch += float(day.get("purch") or 0)
    return sales, purch


def classify(cat_purch: float, daily_purch: float, zero_cats: int, n_cats: int) -> str:
    if daily_purch <= 5000:
        return "ok"
    if cat_purch < max(500.0, 0.15 * daily_purch):
        return "unreliable"
    if n_cats and zero_cats > n_cats * 0.5:
        return "partial"
    return "ok"


def margin_source(status: str) -> str:
    if status == "unreliable":
        return "store_daily_books"
    if status == "partial":
        return "store_daily_books_for_margin"
    return "dept_category_and_daily"


def overlay(doc: dict, daily: dict) -> dict:
    through = str(daily.get("through") or doc.get("asOf") or "")
    by_id = {str(s.get("id")): s for s in daily.get("stations") or [] if s.get("id")}

    for st in doc.get("stores") or []:
        sid = str(st.get("storeId") or st.get("id") or "")
        cats = st.get("categories") or []
        cat_purch = sum(float(c.get("purchLatestMonth") or 0) for c in cats)
        cat_sales = sum(float(c.get("salesLatestMonth") or 0) for c in cats)
        zero_cats = sum(1 for c in cats if abs(float(c.get("purchLatestMonth") or 0)) < 0.01)

        d_st = by_id.get(sid)
        d_sales, d_purch = sum_daily(d_st) if d_st else (0.0, 0.0)
        status = classify(cat_purch, d_purch, zero_cats, len(cats))
        margin = (d_sales - d_purch) / d_sales if d_sales > 0 else None

        st["storeDailyThrough"] = through
        st["storeDailySalesMtd"] = round(d_sales, 2)
        st["storeDailyPurchMtd"] = round(d_purch, 2)
        if margin is not None:
            st["storeDailyMarginMtd"] = round(margin, 4)
        st["deptCategoryPurchMtd"] = round(cat_purch, 2)
        st["deptCategorySalesMtd"] = round(cat_sales, 2)
        st["deptPurchZeroCategories"] = zero_cats
        st["deptPurchFeedStatus"] = status
        st["deptPurchFeedReliable"] = status == "ok"
        st["marginDecisionSource"] = margin_source(status)
        if status == "unreliable":
            st["deptPurchFeedNote"] = (
                "Department purchase totals are missing or zero in depts.json for this store. "
                "Use store-level daily sales and purchase above for margin decisions."
            )
        elif status == "partial":
            st["deptPurchFeedNote"] = (
                "Many categories show zero department purchases; category mix is incomplete. "
                "Prefer store-level daily sales and purchase for margin decisions."
            )

    method = doc.setdefault("method", {})
    method["storeDailyOverlay"] = (
        "storeDailySalesMtd / storeDailyPurchMtd from public/data/daily_september.json; "
        "deptPurchFeedStatus per store — unreliable/partial → marginDecisionSource uses daily books"
    )
    method["deptPurchFeedSpec"] = "ASK-CURSOR-DEPT-PURCH-FEED.md"
    return doc


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--yoy", required=True, help="command-category-yoy.json")
    ap.add_argument("--daily", required=True, help="daily_september.json")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    doc = json.load(open(args.yoy, encoding="utf-8"))
    daily = json.load(open(args.daily, encoding="utf-8"))
    overlay(doc, daily)
    text = json.dumps(doc, separators=(",", ":"), ensure_ascii=False)
    if "\n" in text:
        print("refusing multiline JSON", file=sys.stderr)
        return 1
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(text)

    counts: Dict[str, int] = {}
    for st in doc.get("stores") or []:
        k = st.get("deptPurchFeedStatus") or "?"
        counts[k] = counts.get(k, 0) + 1
    print(f"wrote {args.out} ({len(text)} bytes) feed status: {counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
