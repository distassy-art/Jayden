#!/usr/bin/env python3
"""Add acceptableMargin, purchBudgetMtd, purchActualMtd to command-category-yoy.json."""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from typing import Any, Dict, Optional

ACCEPTABLE_BY_DEPT: Dict[str, float] = {
    "BEER": 0.30,
    "BEER NON ALCOHOLIC": 0.30,
    "CIGARETTES - PACKS": 0.12,
    "CIGARETTES PACKS": 0.12,
    "CIGARETTES CARTONS": 0.12,
    "OTHER TOBACCO PRODUCTS": 0.25,
    "SMOKELESS": 0.25,
    "E CIG CETEC": 0.25,
    "ENERGY DRINK-AZ-LT CA-T NV-NT": 0.45,
    "ENERGY DRINK AZ LT CA NT NV NT": 0.45,
    "ENERGY DRINK AZ LT CA T NV NT": 0.45,
    "ENERGY DRINK AZ HT CA T NV T": 0.45,
    "PACKAGED BEVERAGES - NON-CARBONATED": 0.45,
    "PACKAGED BEVERAGES - CARBONATED": 0.45,
    "PACKAGED BEVERAGES - CARB": 0.45,
    "PACKAGED BEVERAGE SUPPLEMENT": 0.45,
    "COLD DISPENSED BEV - CARB": 0.45,
    "COLD DISPENSED BEV CARB": 0.45,
    "COLD DISPENSED BEV NON CARB": 0.45,
    "FROZEN DISPENSED BEVERAGES": 0.45,
    "SNACKS": 0.45,
    "PACKAGED SWEET SNACKS": 0.45,
    "CANDY": 0.50,
    "EDIBLE GROCERY": 0.50,
    "NON EDIBLE GROCERY": 0.45,
    "GENERAL MERCHANDISE": 0.45,
    "HEALTH AND BEAUTY CARE": 0.45,
    "AUTOMOTIVE PRODUCTS": 0.45,
    "PUBLICATIONS": 0.45,
    "FROZEN FOODS": 0.45,
    "FLUID MILK PRODUCTS": 0.45,
    "OTHER DAIRY AND DELI PRODUCTS": 0.45,
    "COMMISSARY SALAD SANDWICHES": 0.45,
    "COMMISSARY AND OTHER PACKAGED PRODUCTS": 0.45,
    "AMPM FOODSERVICE - HOT": 0.60,
    "AMPM FOODSERVICE HOT": 0.60,
    "AMPM FOODSERVICE OTHER": 0.45,
    "AMPM MOJO DELI": 0.45,
    "HOT DISPENSED BEVERAGES": 0.40,
    "LIQUOR": 0.30,
    "WINE": 0.30,
    "CAR WASH": 0.45,
    "ICE": 0.45,
    "ICE BLOCKS": 0.45,
    "PACKAGED ICE CREAM NOVELTIES": 0.45,
    "PROPANE EXCHANGES": 0.45,
    "STORE USE SUPPLY": 0.45,
}


def norm(name: Any) -> str:
    s = str(name or "").upper().replace("&", "AND")
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def acceptable_margin(category: str, pass_through: bool) -> Optional[float]:
    if pass_through:
        return None
    key = norm(category)
    if key in ("TOTAL", "TOP 10 TOTAL"):
        return None
    if key in ACCEPTABLE_BY_DEPT:
        return ACCEPTABLE_BY_DEPT[key]
    if key.startswith("PACKAGED BEVERAGES") and "CARB" in key:
        return 0.45
    if key.startswith("PACKAGED BEVERAGES"):
        return 0.45
    if key.startswith("ENERGY DRINK"):
        return 0.45
    return None


def num(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    if not (x == x):  # NaN
        return None
    return x


def dept_budget_map(dept_pack: dict, store_id: str) -> Dict[str, dict]:
    st = (dept_pack.get("stores") or {}).get(str(store_id))
    out: Dict[str, dict] = {}
    if not st or not isinstance(st.get("departments"), list):
        return out
    for d in st["departments"]:
        k = norm(d.get("name"))
        if k:
            out[k] = d
    return out


def store_month_budget(vendor_mix: dict, budget_targets: dict, store_id: str) -> Optional[float]:
    sid = str(store_id)
    for pack in (vendor_mix, budget_targets):
        st = (pack.get("stores") or {}).get(sid)
        if st and st.get("month_purchase_budget") is not None:
            v = num(st["month_purchase_budget"])
            if v is not None and v > 0:
                return v
    return None


def resolve_purch_budget_mtd(
    category: str,
    sales_latest: float,
    bud_map: Dict[str, dict],
    store_month_bud: Optional[float],
    cat_sales_total: float,
    purchase_ratio: float,
) -> Optional[float]:
    key = norm(category)
    bud = bud_map.get(key)
    if bud and bud.get("pass_through"):
        return None
    set_amt = num(bud.get("purchase_budget") if bud else None)
    if set_amt is not None and set_amt > 0:
        return round(set_amt, 2)
    if (
        store_month_bud is not None
        and store_month_bud > 0
        and sales_latest > 0
        and cat_sales_total > 0
    ):
        return round(store_month_bud * (sales_latest / cat_sales_total), 2)
    if sales_latest > 0:
        return round(sales_latest * purchase_ratio, 2)
    return None


def enrich(
    doc: dict,
    dept_pack: dict,
    vendor_mix: dict,
    budget_targets: Optional[dict] = None,
) -> dict:
    budget_targets = budget_targets or {}
    meta = dept_pack.get("meta") or {}
    purchase_ratio = num(meta.get("purchase_ratio"))
    if purchase_ratio is None or purchase_ratio <= 0:
        purchase_ratio = 0.60

    for st in doc.get("stores") or []:
        store_id = str(st.get("storeId") or "")
        bud_map = dept_budget_map(dept_pack, store_id)
        store_month_bud = store_month_budget(vendor_mix, budget_targets, store_id)

        cat_sales_total = 0.0
        for c in st.get("categories") or []:
            key = norm(c.get("category"))
            bud = bud_map.get(key)
            if bud and bud.get("pass_through"):
                continue
            s = num(c.get("salesLatestMonth")) or 0.0
            if s > 0:
                cat_sales_total += s

        for c in st.get("categories") or []:
            key = norm(c.get("category"))
            bud = bud_map.get(key)
            pass_through = bool(bud and bud.get("pass_through"))
            sales_latest = num(c.get("salesLatestMonth")) or 0.0
            purch_latest = num(c.get("purchLatestMonth"))

            c["acceptableMargin"] = acceptable_margin(c.get("category") or "", pass_through)
            c["purchActualMtd"] = purch_latest
            c["purchBudgetMtd"] = resolve_purch_budget_mtd(
                c.get("category") or "",
                sales_latest,
                bud_map,
                store_month_bud,
                cat_sales_total,
                purchase_ratio,
            )
            if c.get("purchaseBudget") is None and c["purchBudgetMtd"] is not None:
                c["purchaseBudget"] = c["purchBudgetMtd"]

    doc["generatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    m = doc.setdefault("method", {})
    if isinstance(m, dict):
        m["deptMarginBudgetFields"] = (
            "acceptableMargin, purchBudgetMtd, purchActualMtd on every categories[] row "
            "(see ASK-CURSOR-DEPT-MARGIN-BUDGET.md)"
        )
    return doc


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", required=True, help="command-category-yoy.json input")
    ap.add_argument("--dept-budgets", required=True)
    ap.add_argument("--vendor-mix", required=True)
    ap.add_argument("--budget-targets", default="")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    doc = json.load(open(args.live, encoding="utf-8"))
    dept_pack = json.load(open(args.dept_budgets, encoding="utf-8"))
    vendor_mix = json.load(open(args.vendor_mix, encoding="utf-8"))
    budget_targets = {}
    if args.budget_targets:
        budget_targets = json.load(open(args.budget_targets, encoding="utf-8"))

    enrich(doc, dept_pack, vendor_mix, budget_targets)

    text = json.dumps(doc, separators=(",", ":"), ensure_ascii=False)
    if "\n" in text:
        print("refusing to write multiline JSON", file=sys.stderr)
        return 1
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(text)

    n_cat = sum(len(st.get("categories") or []) for st in doc.get("stores") or [])
    missing = 0
    for st in doc.get("stores") or []:
        for c in st.get("categories") or []:
            for field in ("acceptableMargin", "purchBudgetMtd", "purchActualMtd"):
                if field not in c:
                    missing += 1
    print(f"wrote {args.out} ({len(text)} bytes, {n_cat} categories, missing fields {missing})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
