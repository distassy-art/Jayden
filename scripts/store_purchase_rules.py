#!/usr/bin/env python3
"""Store Net Daily Purchases rule — matches Excel ``Deduct`` sheets.

Canonical rule (written on Koval Deduct + used across Daily.xlsx books):

  Net Purchases = sum of **positive** SoftSP invoice amounts for vendors that are
  **not** on the Deduct / exclude list.
  - Negative invoices → treat as **$0** (never reduce the day).
  - Deduct-list vendors (column A) → **excluded** (not counted as purchase).
  - Column B "Add" / "Add to total" vendors (e.g. Marathon, Inventory Adj) →
    **add back** their positive amounts when present.
  - Column B "Ignore / Do Not Add" → **ignored** (same as excluded for net).
  - Day with no countable invoices after rules → **null** (leave Excel blank),
    not 0 — matches ``IF(COUNTA(...)=0,\"\",…)``.

Source of truth for vendor lists: each store's ``* Daily.xlsx`` → sheet ``Deduct``.
Refresh snapshot::

  python3 scripts/store_purchase_rules.py --from-excel /path/to/dailys --write
  python3 scripts/store_purchase_rules.py --show --store 42352
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable

try:
    import openpyxl
except ImportError as exc:  # pragma: no cover
    raise SystemExit("openpyxl required: pip install openpyxl") from exc

REPO = Path(__file__).resolve().parents[1]
DEFAULT_SNAPSHOT = REPO / "scripts" / "data" / "store_purchase_rules.json"

SKIP_A = {
    "deduct",
    "deduct vendors",
    "subtract from daily total",
    "net purchase rule",
    "example",
    "daily purchase total",
    "deduct-vendor amounts",
    "ignored add-vendor amounts",
    "net purchases",
    "column b vendors do not change net purchases",
    "purchase rules",
    "workflow",
    "add back",
    "result",
    "july source",
    "august source",
    "date",
    "vendor",
}

SKIP_B = {
    "add",
    "add to total",
    "ignore / do not add",
    "negative invoice rule",
    "amount",
    "ignored",
    "treat as $0",
}


def norm(s: Any) -> str:
    return re.sub(r"\s+", " ", str(s or "").strip().lower())


def vendor_matches(vendor: str, patterns: Iterable[str]) -> bool:
    """Case-insensitive soft match (substring either way), like Excel SEARCH."""
    v = norm(vendor)
    if not v:
        return False
    for raw in patterns:
        p = norm(raw)
        if not p or len(p) < 2:
            continue
        if p in v or v in p:
            return True
    return False


@dataclass
class StorePurchaseRule:
    store_id: str
    source_file: str = ""
    exclude_vendors: list[str] = field(default_factory=list)
    add_back_vendors: list[str] = field(default_factory=list)
    ignore_vendors: list[str] = field(default_factory=list)
    col_b_mode: str = "add"  # "add" | "ignore" | "none"
    negative_invoices: str = "zero"  # always treat negatives as $0
    empty_day: str = "null"  # leave blank in Excel
    notes: list[str] = field(default_factory=list)

    def classify(self, vendor: str) -> str:
        if vendor_matches(vendor, self.exclude_vendors):
            return "exclude"
        if vendor_matches(vendor, self.ignore_vendors):
            return "ignore"
        if vendor_matches(vendor, self.add_back_vendors):
            return "add_back"
        return "include"

    def amount_toward_net(self, vendor: str, amount: float | None) -> float:
        """Contribution of one invoice line to Net Daily Purchases."""
        if amount is None:
            return 0.0
        # Negatives → $0
        pos = amount if amount > 0 else 0.0
        kind = self.classify(vendor)
        if kind in ("exclude", "ignore"):
            return 0.0
        if kind == "add_back":
            return pos
        return pos  # include


def load_deduct_from_workbook(path: Path, store_id: str | None = None) -> StorePurchaseRule:
    wb = openpyxl.load_workbook(path, data_only=False)
    sn = next((s for s in wb.sheetnames if s.strip().lower() == "deduct"), None)
    if not sn:
        raise SystemExit(f"{path}: no Deduct sheet")
    ws = wb[sn]
    sid = store_id or _store_id_from_name(path.name)

    h1 = norm(ws.cell(1, 1).value)
    h2 = norm(ws.cell(1, 2).value)
    # Arco Db style: first cell is a vendor ("Bonus"), not a header
    row1_is_header = h1 in {
        "deduct",
        "deduct vendors",
        "subtract from daily total",
    } or h1.startswith("deduct")

    if "ignore" in h2:
        col_b_mode = "ignore"
    elif "add" in h2 or "add to" in h2:
        col_b_mode = "add"
    elif not h2:
        col_b_mode = "none"
    else:
        col_b_mode = "add" if "add" in h2 else "ignore"

    exclude: list[str] = []
    add_back: list[str] = []
    ignore: list[str] = []
    notes: list[str] = []

    start = 2 if row1_is_header else 1
    for r in range(start, (ws.max_row or 1) + 1):
        a = ws.cell(r, 1).value
        b = ws.cell(r, 2).value
        if isinstance(a, str):
            sa = a.strip()
            low = norm(sa)
            if "net purchase" in low or low.startswith("net purchases ="):
                notes.append(sa)
                continue
            if low in SKIP_A or len(sa) > 90 or sa.startswith("="):
                continue
            if sa and low not in {norm(x) for x in exclude}:
                exclude.append(sa)
        if isinstance(b, str):
            sb = b.strip()
            low = norm(sb)
            if "treat as" in low:
                notes.append(f"negative_rule: {sb}")
                continue
            if low in SKIP_B or len(sb) > 90 or sb.startswith("="):
                continue
            if not sb:
                continue
            # Skip example amounts / prose left in col B on some books
            if re.fullmatch(r"[\d.,]+", sb):
                continue
            if any(
                w in low
                for w in (
                    "enter each",
                    "subtract all",
                    "invoice",
                    "imported",
                    "vendor credit",
                    "merchandise",
                    "supplied with",
                )
            ):
                continue
            if col_b_mode == "ignore":
                if low not in {norm(x) for x in ignore}:
                    ignore.append(sb)
            elif col_b_mode == "add":
                # Only keep short vendor-like tokens for add-back
                if low not in {norm(x) for x in add_back}:
                    add_back.append(sb)

    # Always exclude common lottery aliases if any lottery-like name is listed
    lottery_aliases = [
        "Lottery",
        "Lotto",
        "California Lottery",
        "Lottery California",
        "Lottery Ca",
    ]
    if any(vendor_matches(x, ["lottery", "lotto"]) for x in exclude):
        for alias in lottery_aliases:
            if not vendor_matches(alias, exclude):
                exclude.append(alias)

    return StorePurchaseRule(
        store_id=sid,
        source_file=path.name,
        exclude_vendors=exclude,
        add_back_vendors=add_back,
        ignore_vendors=ignore,
        col_b_mode=col_b_mode,
        notes=notes,
    )


def _store_id_from_name(name: str) -> str:
    m = re.match(r"^(\d{5})", name)
    return m.group(1) if m else name


def scan_excel_dir(folder: Path) -> dict[str, StorePurchaseRule]:
    rules: dict[str, StorePurchaseRule] = {}
    for path in sorted(folder.glob("*.xlsx")):
        if path.name.startswith("~$"):
            continue
        low = path.name.lower()
        if "daily" not in low:
            continue
        try:
            rule = load_deduct_from_workbook(path)
        except SystemExit:
            continue
        rules[rule.store_id] = rule
    return rules


def rules_to_json(rules: dict[str, StorePurchaseRule]) -> dict:
    return {
        "rule": {
            "summary": (
                "Net Purchases = positive SoftSP invoice amounts for non-excluded "
                "vendors; negatives → $0; Deduct-list excluded; empty day → null."
            ),
            "negative_invoices": "zero",
            "empty_day": "null",
        },
        "stores": {sid: asdict(r) for sid, r in sorted(rules.items())},
    }


def load_snapshot(path: Path = DEFAULT_SNAPSHOT) -> dict[str, StorePurchaseRule]:
    data = json.loads(path.read_text())
    out: dict[str, StorePurchaseRule] = {}
    for sid, raw in (data.get("stores") or data).items():
        if not isinstance(raw, dict):
            continue
        out[sid] = StorePurchaseRule(
            store_id=raw.get("store_id") or sid,
            source_file=raw.get("source_file") or "",
            exclude_vendors=list(raw.get("exclude_vendors") or []),
            add_back_vendors=list(raw.get("add_back_vendors") or []),
            ignore_vendors=list(raw.get("ignore_vendors") or []),
            col_b_mode=raw.get("col_b_mode") or "add",
            negative_invoices=raw.get("negative_invoices") or "zero",
            empty_day=raw.get("empty_day") or "null",
            notes=list(raw.get("notes") or []),
        )
    return out


def apply_invoices(
    rule: StorePurchaseRule,
    invoices: Iterable[dict],
) -> dict[str, float | None]:
    """Group SoftSP invoice lines by date → net purchase (or None).

    Each invoice dict: ``{"date": "YYYY-MM-DD"|date, "vendor": str, "amount": float}``
    """
    buckets: dict[str, list[tuple[str, float]]] = {}
    for inv in invoices:
        d = inv.get("date")
        if isinstance(d, datetime):
            key = d.date().isoformat()
        elif isinstance(d, date):
            key = d.isoformat()
        else:
            key = str(d)[:10]
        vendor = str(inv.get("vendor") or "")
        try:
            amt = float(inv.get("amount") or 0)
        except (TypeError, ValueError):
            continue
        buckets.setdefault(key, []).append((vendor, amt))

    out: dict[str, float | None] = {}
    for key, lines in buckets.items():
        total = 0.0
        counted = 0
        for vendor, amt in lines:
            contrib = rule.amount_toward_net(vendor, amt)
            kind = rule.classify(vendor)
            # Only "include" and "add_back" with positive contrib count as activity
            if kind in ("include", "add_back") and (amt > 0 or contrib > 0):
                counted += 1
            total += contrib
        if counted == 0:
            out[key] = None  # blank / null in Excel
        else:
            out[key] = round(total, 2)
    return out


def show_rule(rule: StorePurchaseRule) -> None:
    print(f"# Store {rule.store_id}  ({rule.source_file})")
    print(f"  col_b_mode={rule.col_b_mode}  negatives→{rule.negative_invoices}  empty→{rule.empty_day}")
    print(f"  EXCLUDE ({len(rule.exclude_vendors)}): {', '.join(rule.exclude_vendors) or '—'}")
    if rule.add_back_vendors:
        print(f"  ADD BACK ({len(rule.add_back_vendors)}): {', '.join(rule.add_back_vendors)}")
    if rule.ignore_vendors:
        print(f"  IGNORE ({len(rule.ignore_vendors)}): {', '.join(rule.ignore_vendors)}")
    for n in rule.notes:
        print(f"  note: {n}")


def demo_apply(rule: StorePurchaseRule) -> None:
    """Show how sample SoftSP lines map under this store's Deduct list."""
    samples = [
        {"date": "2026-09-23", "vendor": "Core-Mark", "amount": 1200.0},
        {"date": "2026-09-23", "vendor": "California Lottery", "amount": 400.0},
        {"date": "2026-09-23", "vendor": "Marathon", "amount": 250.0},
        {"date": "2026-09-23", "vendor": "Vendor Credit", "amount": -80.0},
        {"date": "2026-09-23", "vendor": "Lunch", "amount": 35.0},
        {"date": "2026-09-24", "vendor": "Frito Lay", "amount": -10.0},
    ]
    print("\n  sample SoftSP lines → treatment / toward net:")
    for inv in samples:
        kind = rule.classify(inv["vendor"])
        toward = rule.amount_toward_net(inv["vendor"], inv["amount"])
        print(
            f"    {inv['date']}  {inv['vendor']!r:28} amt={inv['amount']:8.2f}  "
            f"→ {kind:8}  +{toward:.2f}"
        )
    nets = apply_invoices(rule, samples)
    print("  day nets:", nets)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--from-excel",
        type=str,
        default=None,
        help="Folder of *Daily*.xlsx to rebuild rules from Deduct sheets",
    )
    p.add_argument(
        "--write",
        action="store_true",
        help=f"Write snapshot to {DEFAULT_SNAPSHOT}",
    )
    p.add_argument("--snapshot", type=str, default=str(DEFAULT_SNAPSHOT))
    p.add_argument("--show", action="store_true", help="Print rules")
    p.add_argument("--store", type=str, default=None, help="Filter store id (e.g. 42352)")
    p.add_argument("--demo", action="store_true", help="Demo sample invoice → net")
    args = p.parse_args(argv)

    snap_path = Path(args.snapshot)
    if args.from_excel:
        rules = scan_excel_dir(Path(args.from_excel))
        payload = rules_to_json(rules)
        if args.write:
            snap_path.parent.mkdir(parents=True, exist_ok=True)
            snap_path.write_text(json.dumps(payload, indent=2) + "\n")
            print(f"wrote {snap_path} ({len(rules)} stores)")
    else:
        if not snap_path.exists():
            raise SystemExit(f"No snapshot at {snap_path}; run --from-excel … --write")
        rules = load_snapshot(snap_path)
        payload = rules_to_json(rules)

    if args.show or args.demo or not args.write:
        print(payload["rule"]["summary"])
        print()
        for sid, rule in sorted(rules.items()):
            if args.store and args.store not in sid:
                continue
            show_rule(rule)
            if args.demo:
                demo_apply(rule)
            print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
