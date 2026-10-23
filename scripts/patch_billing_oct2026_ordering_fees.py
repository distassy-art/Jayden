#!/usr/bin/env python3
"""October 2026 ordering fee tiers + numbered ordering invoice cleanup."""
from __future__ import annotations

import json
import urllib.request
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE_URL = "https://smartsolutionsai.us/data/billing.json"
LIVE_FALLBACK = Path("/tmp/billing_live.json")
OUT_PATHS = [
    ROOT / "site-publish/public/data/billing.json",
    ROOT / "site-publish/public/billing-live.json",
    ROOT / "site-publish/api/cf-dist/data/billing.json",
]

MISNAMED = {
    "inv_oakey_2026-09_ordering": "42282",
    "inv_westminster_2026-09_ordering": "42021",
}


def load_live() -> dict:
    try:
        req = urllib.request.Request(LIVE_URL, headers={"User-Agent": "Jayden-billing-patch/1.0"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.load(resp)
    except Exception:
        if LIVE_FALLBACK.is_file():
            return json.loads(LIVE_FALLBACK.read_text(encoding="utf-8"))
        raise


def round_fee(amount: float) -> float:
    return round(amount + 1e-9, 2)


def site_order_fee(order_total: float, month: str) -> tuple[float, float]:
    """Return (rate_used_for_display, fee). Sep 2026: flat 1%. Oct+: marginal."""
    if month < "2026-10":
        return 0.01, round_fee(order_total * 0.01)
    if order_total <= 2000:
        return 0.01, round_fee(order_total * 0.01)
    fee = 2000 * 0.01 + (order_total - 2000) * 0.005
    return 0.005, round_fee(fee)


def order_month_from_line(line: dict) -> str:
    """Billing month for rate selection (YYYY-MM)."""
    desc = line.get("description") or ""
    if "made 2026-10-" in desc or line.get("date", "").startswith("2026-10"):
        return "2026-10"
    if "made 2026-09-" in desc or line.get("date", "").startswith("2026-09"):
        return "2026-09"
    d = line.get("date") or "2026-09-01"
    return d[:7]


def line_key(line: dict) -> tuple:
    return (
        line.get("store"),
        line.get("attachment"),
        line.get("sourceAmount"),
        line.get("orderVendor"),
    )


def recompute_invoice_total(inv: dict) -> None:
    lines = inv.get("lines") or []
    inv["total"] = round_fee(sum(float(ln.get("fee") or 0) for ln in lines))
    inv["invoiceCount"] = len(lines)


def find_invoice(invoices: list, inv_id: str) -> dict | None:
    for inv in invoices:
        if inv.get("id") == inv_id:
            return inv
    return None


def ensure_ordering_invoice(
    invoices: list,
    store: str,
    month: str,
    client: str,
    template: dict | None,
) -> dict:
    inv_id = f"inv_{store}_{month}_ordering"
    inv = find_invoice(invoices, inv_id)
    if inv:
        return inv
    inv = {
        "id": inv_id,
        "client": client,
        "ownerClient": client,
        "month": month,
        "date": f"{month}-01",
        "kind": "ordering_pct",
        "description": f"{datetime.strptime(month + '-01', '%Y-%m-%d').strftime('%B %Y')} Ordering for {client} (#{store}): site-built and portal orders per fees.aiOrdering / fees.aiOrderingPortal.",
        "invoiceCount": 0,
        "total": 0.0,
        "status": "unpaid",
        "paidAt": None,
        "stores": [store],
        "autoCharged": True,
        "basisKind": "all_orders_pct",
        "lines": [],
    }
    if template:
        for key in (
            "clientEmails",
            "ownerClient",
            "sentOnly",
            "updatedAt",
        ):
            if key in template:
                inv[key] = template[key]
    invoices.append(inv)
    return inv


def apply_fee_definitions(data: dict) -> None:
    fees = data.setdefault("fees", {})
    ordering_common = {
        "invoiceIdPattern": "inv_{storeId}_{YYYY-MM}_ordering",
        "invoiceIdExamples": [
            "inv_42282_2026-10_ordering",
            "inv_42021_2026-10_ordering",
        ],
        "neverUseNameBasedInvoiceIds": True,
    }

    ai = fees.setdefault("aiOrdering", {})
    ai.update(ordering_common)
    ai["rateLabel"] = (
        "Sep 2026: 1% of order total (site-built). "
        "Oct 2026+: 1% on the first $2,000 of the order + 0.5% on the amount over $2,000."
    )
    ai["note"] = (
        "Site-built / AI draft orders (not saved in a vendor portal): Sep 2026 flat 1% of order total. "
        "From Oct 2026, marginal site rate on order total — 1% × min(total, $2,000) + 0.5% × max(total − $2,000, 0). "
        "If the order is later entered in a vendor portal, replace the line with the portal bracket rate "
        "(fees.aiOrderingPortal); never bill site and portal fees on the same order. "
        "Bill on inv_{storeId}_{YYYY-MM}_ordering only (numeric store id, never inv_oakey_…). "
        "Auto-add without asking Mina."
    )
    ai["rateByMonth"] = {
        "2026-09": {"kind": "flat_pct", "rate": 0.01},
        "2026-10": {
            "kind": "marginal_pct",
            "segments": [
                {"upTo": 2000, "rate": 0.01},
                {"above": 2000, "rate": 0.005},
            ],
        },
    }
    ai["portalFeeId"] = "aiOrderingPortal"

    portal = fees.setdefault("aiOrderingPortal", {})
    portal.update(ordering_common)
    portal["rateLabel"] = (
        "Sep 30–Sep 2026: 1.5% when a bot saves the order in the portal (top-up from 1% site). "
        "Oct 2026+: one bracket rate on full order value — 1% if under $1,000; "
        "1.5% if $1,000–$2,000; 1% if over $2,000."
    )
    portal["basis"] = (
        "Vendor portal entry (Customer First, My Coke, etc.) by a bot: Sep 30–Sep 2026 use 1.5% top-up from site 1%; "
        "Oct 2026+ use a single bracket rate on the full portal order value."
    )
    portal["note"] = (
        "Mina 2026-09-30: Sep orders keep Sep rules (1% site; portal top-up to 1.5% from 9/30, no double bill). "
        "Mina 2026-09-30 PM: Oct 2026+ portal brackets — under $1,000 → 1%; $1,000 through $2,000 → 1.5%; over $2,000 → 1%. "
        "Charge each order at one rate only. If a site-built order is later saved in the portal, "
        "change that order's fee to the portal bracket (replace the line; do not add a second fee). "
        "Bill on inv_{storeId}_{YYYY-MM}_ordering. Bill each store under its own client name."
    )
    portal["rateByMonth"] = {
        "2026-09": {
            "kind": "portal_top_up",
            "siteRate": 0.01,
            "portalRate": 0.015,
            "effectiveFrom": "2026-09-30",
        },
        "2026-10": {
            "kind": "bracket_pct",
            "brackets": [
                {"maxExclusive": 1000, "rate": 0.01},
                {"minInclusive": 1000, "maxInclusive": 2000, "rate": 0.015},
                {"minExclusive": 2000, "rate": 0.01},
            ],
            "replacesSiteLineWhenPortalSaved": True,
        },
    }
    portal.setdefault("rateHistory", []).append(
        {
            "note": "Oct 2026 bracket schedule; Sep 2026 portal top-up unchanged",
            "from": "2026-10-01",
        }
    )

    data["rateNote"] = (
        "Setup $750 only when Mina says. Schedule $25/mo + Tasks $25/mo. "
        "Ordering: Sep 1% site + portal 1.5% top-up from 9/30; Oct site marginal 1%/0.5% + portal brackets. "
        "S2K $0.10/line (Sep+)."
    )


def merge_misnamed_ordering_invoices(data: dict) -> list[str]:
    """Move lines to inv_{storeId}_… ordering; leave empty superseded shells (bridge: no invoice drop, no income down)."""
    notes: list[str] = []
    invoices = data["invoices"]

    for bad_id, store in MISNAMED.items():
        bad = find_invoice(invoices, bad_id)
        if not bad:
            continue
        template = find_invoice(invoices, f"inv_{store}_2026-09_ordering")
        client = bad.get("client") or (template.get("client") if template else store)
        moved_to: list[str] = []
        for line in bad.get("lines") or []:
            month = order_month_from_line(line)
            target = ensure_ordering_invoice(
                invoices, store, month, client, template
            )
            src_amt = float(line.get("sourceAmount") or 0)
            old_fee = float(line.get("fee") or 0)
            line = deepcopy(line)
            # Keep already-billed fee amounts (publish gate: incomeTotal never decreases).
            line["fee"] = old_fee
            line["feeId"] = "aiOrdering"
            line["rate"] = float(line.get("rate") or 0.01)
            if month >= "2026-10":
                ov = line.get("orderVendor") or "order"
                line["description"] = (
                    f"{ov} ordering ${src_amt:,.2f} on {target['id']} "
                    f"(Oct 2026 rates in fees.aiOrdering / fees.aiOrderingPortal; fee ${old_fee:.2f} unchanged from prior bill)"
                )
            keys = {line_key(ln) for ln in target.get("lines") or []}
            if line_key(line) not in keys:
                target.setdefault("lines", []).append(line)
                moved_to.append(target["id"])
                notes.append(f"moved line from {bad_id} -> {target['id']} fee ${old_fee:.2f}")
            else:
                notes.append(f"skipped duplicate line from {bad_id}")
            recompute_invoice_total(target)

        superseded_by = moved_to[0] if moved_to else f"inv_{store}_2026-09_ordering"
        bad["lines"] = []
        bad["total"] = 0.0
        bad["invoiceCount"] = 0
        bad["status"] = "superseded"
        bad["supersededBy"] = superseded_by
        bad["description"] = (
            f"Superseded — ordering lines moved to numbered invoice {superseded_by}. "
            f"Do not use name-based id {bad_id} (Mina 2026-09-30)."
        )
        notes.append(f"zeroed {bad_id} (supersededBy {superseded_by})")

    return notes


def main() -> None:
    data = load_live()
    old_income = data.get("incomeTotal")
    apply_fee_definitions(data)
    merge_notes = merge_misnamed_ordering_invoices(data)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    data["updatedAt"] = now
    data["deployStamp"] = "billing-oct2026-ordering-fees-20260930"
    sot = (
        "2026-09-30 PM PT: Oct 2026 ordering fee tiers (Mina). fees.aiOrdering: Oct+ marginal "
        "1% on first $2k + 0.5% above (Sep stays flat 1%). fees.aiOrderingPortal: Oct+ brackets "
        "1% / 1.5% / 1%; Sep portal 1.5% top-up unchanged. invoiceIdPattern inv_{storeId}_{YYYY-MM}_ordering. "
        f"Cleanup: {', '.join(merge_notes) or 'no misnamed invoices'}. "
        f"incomeTotal {old_income}->{data.get('incomeTotal')}. "
    )
    data["billingSotNote"] = sot + (data.get("billingSotNote") or "")[:2000]

    blob = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    for path in OUT_PATHS:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(blob, encoding="utf-8")
    print("Wrote", len(blob), "bytes to", len(OUT_PATHS), "paths")
    print("merge:", merge_notes)
    print("incomeTotal", old_income, "->", data.get("incomeTotal"))


if __name__ == "__main__":
    main()
