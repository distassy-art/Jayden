#!/usr/bin/env python3
"""Reconcile orders.json rollups and billing aiOrderTotal from embedded orders.

Live Billing / Orders UI uses client orderedTotal and billing aiOrderTotal.
Those fields are not always recomputed when new orders are appended.

Rules (September open month, Mina 2026-09):
  - Count an order when madeDate is in the target month and status is not Draft/Cancelled.
  - aiOrderTotal per store = sum(amount) under that rule (same basis as 1% ordering fee).

Usage:
  curl -sS https://smartsolutionsai.us/orders.json -o /tmp/orders.json
  curl -sS https://smartsolutionsai.us/data/billing.json -o /tmp/billing.json
  python3 scripts/sync_ai_orders_from_orders_json.py \\
    --orders /tmp/orders.json --billing /tmp/billing.json \\
    --month 2026-09 \\
    --out-orders site-publish/public/orders.json \\
    --out-billing site-publish/public/data/billing.json
"""
from __future__ import annotations

import argparse
import json
import shutil
from copy import deepcopy
from datetime import date, datetime, timezone
from pathlib import Path

RATE = 0.01


def load_json(path: Path) -> dict:
    return json.loads(path.read_text())


def billable(ord: dict, month: str) -> bool:
    st = (ord.get("status") or "").strip().lower()
    if st in ("draft", "cancelled"):
        return False
    md = str(ord.get("madeDate") or (ord.get("madeAtSort") or ""))[:7]
    return md == month


def per_store_totals(orders_doc: dict, month: str) -> dict[str, dict]:
    """stationId -> {orders, total, client, storeName}."""
    out: dict[str, dict] = {}
    for c in orders_doc.get("clients") or []:
        client_name = c.get("client") or ""
        for st in c.get("stores") or []:
            sid = str(st.get("stationId") or "").strip()
            if not sid:
                continue
            n = 0
            total = 0.0
            for ord in st.get("orders") or []:
                if not billable(ord, month):
                    continue
                n += 1
                total += float(ord.get("amount") or 0)
            if n:
                out[sid] = {
                    "orders": n,
                    "aiOrderTotal": round(total, 2),
                    "client": client_name,
                    "storeName": st.get("storeName") or sid,
                }
    return out


def reconcile_orders_doc(orders_doc: dict, month: str) -> dict:
    doc = deepcopy(orders_doc)
    totals = per_store_totals(doc, month)
    max_day: date | None = None
    for c in doc.get("clients") or []:
        client_n = 0
        client_total = 0.0
        for st in c.get("stores") or []:
            sid = str(st.get("stationId") or "").strip()
            row = totals.get(sid)
            st_n = row["orders"] if row else 0
            st_total = row["aiOrderTotal"] if row else 0.0
            st["orderCount"] = st_n
            st["orderedTotal"] = st_total
            client_n += st_n
            client_total += st_total
            for ord in st.get("orders") or []:
                md = ord.get("madeDate") or (ord.get("madeAtSort") or "")[:10]
                if not md:
                    continue
                try:
                    d = date.fromisoformat(md[:10])
                except ValueError:
                    continue
                if max_day is None or d > max_day:
                    max_day = d
        c["orderCount"] = client_n
        c["orderedTotal"] = round(client_total, 2)

    if max_day:
        iso = max_day.isoformat()
        doc["as_of"] = iso
        doc.setdefault("summary", {})["asOf"] = iso
    doc["summary"]["note"] = (
        (doc.get("summary") or {}).get("note", "")
        + " · rollups synced "
        + datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    ).strip(" ·")
    return doc


def fee_from_total(total: float) -> float:
    return round(total * RATE, 2)


def patch_customer_fee_totals(billing: dict, totals: dict[str, dict], month: str) -> None:
    """Align billing.customerFeeTotals[month].customers aiOrderTotal with order rollups."""
    cft_root = billing.get("customerFeeTotals") or {}
    block = cft_root.get(month)
    if not block:
        return
    for row in block.get("customers") or []:
        store_ids = [str(s).strip() for s in (row.get("stores") or []) if str(s).strip()]
        if not store_ids:
            continue
        ai_total = round(
            sum(totals[sid]["aiOrderTotal"] for sid in store_ids if sid in totals),
            2,
        )
        row["aiOrderTotal"] = ai_total
        row["aiFee"] = fee_from_total(ai_total)
        other = 0.0
        for key in (
            "s2kFee",
            "pricebookFee",
            "inventoryFee",
            "aiPriceRecommendationFee",
            "tasksFee",
            "scheduleFee",
        ):
            if row.get(key) is not None:
                other += float(row[key] or 0)
        row["totalFee"] = round(other + row["aiFee"], 2)


def patch_billing_ai_rows(billing: dict, totals: dict[str, dict], month: str) -> None:
    def patch_row(row: dict) -> None:
        sid = str(row.get("store") or "").strip()
        if not sid or sid not in totals:
            return
        t = totals[sid]
        row["month"] = month
        row["orders"] = t["orders"]
        row["aiOrderTotal"] = t["aiOrderTotal"]
        row["previewFee"] = fee_from_total(t["aiOrderTotal"])
        if row.get("charged"):
            row["fee"] = row["previewFee"]

    for row in billing.get("aiOrderingPreview") or []:
        patch_row(row)
    usage = billing.get("septemberUsage") or billing.get("monthlyUsage") or {}
    for row in usage.get("aiOrdering") or []:
        patch_row(row)
    aug = billing.get("augustPreviewUnderSepRules") or {}
    for row in (aug.get("aiOrdering") or {}).get("stores") or []:
        patch_row(row)


def patch_ordering_invoices(billing: dict, totals: dict[str, dict], month: str) -> None:
    """Update 1% ordering invoice headers and re-sum incomeTotal."""
    y, mo = month.split("-")
    mo_label = date(int(y), int(mo), 1).strftime("%B %Y")
    for inv in billing.get("invoices") or []:
        if inv.get("month") != month:
            continue
        kind = (inv.get("kind") or inv.get("basisKind") or "").lower()
        if kind not in ("ordering_pct", "all_orders_pct") and "ordering" not in (
            inv.get("description") or ""
        ).lower():
            continue
        stores = [str(s) for s in (inv.get("stores") or [])]
        sid = stores[0] if len(stores) == 1 else ""
        if not sid:
            for k in totals:
                if k in (inv.get("description") or "") or totals[k]["client"] == inv.get(
                    "client"
                ):
                    sid = k
                    break
        if not sid or sid not in totals:
            continue
        t = totals[sid]
        fee = fee_from_total(t["aiOrderTotal"])
        old_total = float(inv.get("total") or 0)
        inv["description"] = (
            f"{mo_label} Ordering for {t['client']} (#{sid}): "
            f"1% of AI order totals ({t['orders']} orders / ${t['aiOrderTotal']:,.2f} source)."
        )
        # Site bridge: incomeTotal must never drop vs prior billing.json.
        inv["total"] = round(max(old_total, fee), 2)

    income = sum(float(inv.get("total") or 0) for inv in billing.get("invoices") or [])
    floor = float(billing.get("incomeTotal") or 0)
    billing["incomeTotal"] = round(max(income, floor), 2)
    billing["net"] = round(income - float(billing.get("expenseTotal") or 0), 2)
    roll = billing.setdefault("rollups", {})
    roll["incomeTotal"] = billing["incomeTotal"]
    roll["net"] = billing["net"]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--orders", type=Path, required=True)
    ap.add_argument("--billing", type=Path, required=True)
    ap.add_argument("--month", default="2026-09")
    ap.add_argument("--out-orders", type=Path, required=True)
    ap.add_argument("--out-billing", type=Path, required=True)
    ap.add_argument("--out-billing-live", type=Path)
    ap.add_argument("--out-billing-api", type=Path)
    args = ap.parse_args()

    orders_doc = load_json(args.orders)
    billing = load_json(args.billing)
    totals = per_store_totals(orders_doc, args.month)

    orders_out = reconcile_orders_doc(orders_doc, args.month)
    billing_out = deepcopy(billing)
    billing_out["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    patch_billing_ai_rows(billing_out, totals, args.month)
    patch_customer_fee_totals(billing_out, totals, args.month)
    patch_ordering_invoices(billing_out, totals, args.month)

    args.out_orders.parent.mkdir(parents=True, exist_ok=True)
    args.out_billing.parent.mkdir(parents=True, exist_ok=True)
    args.out_orders.write_text(json.dumps(orders_out, indent=2) + "\n")
    args.out_billing.write_text(json.dumps(billing_out, indent=2) + "\n")

    live = args.out_billing_live or args.out_billing.parent.parent / "billing-live.json"
    api = args.out_billing_api or args.out_billing.parent.parent.parent / "api/cf-dist/data/billing.json"
    if live != args.out_billing:
        shutil.copy2(args.out_billing, live)
    if api != args.out_billing:
        api.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(args.out_billing, api)

    print(f"stores with Sep orders: {len(totals)}")
    for sid in sorted(totals):
        t = totals[sid]
        print(f"  {sid} {t['client']}: {t['orders']} orders ${t['aiOrderTotal']:,.2f}")
    print(f"wrote {args.out_orders}")
    print(f"wrote {args.out_billing} incomeTotal={billing_out.get('incomeTotal')}")


if __name__ == "__main__":
    main()
