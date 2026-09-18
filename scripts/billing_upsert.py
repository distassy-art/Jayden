#!/usr/bin/env python3
"""Upsert invoices into site billing. Never deletes existing invoices (bot or human)."""
import json, sys, subprocess, os
from copy import deepcopy
from datetime import datetime, timezone

NS = "750cc39750864d5e8adec86a21c1e21d"
SITE = os.environ.get("SS_SITE", "/tmp/ss-site")

def load_kv():
    r = subprocess.run(
        ["npx", "wrangler", "kv:key", "get", "billing", f"--namespace-id={NS}"],
        cwd=SITE, capture_output=True, text=True, check=True,
    )
    return json.loads(r.stdout)

def merge_invoices(*lists):
    by, order = {}, []
    for lst in lists:
        for inv in lst or []:
            iid = inv.get("id")
            if not iid:
                continue
            if iid not in by:
                by[iid] = deepcopy(inv)
                order.append(iid)
            else:
                cur = by[iid]
                for k, v in inv.items():
                    if v is None and cur.get(k) is not None:
                        continue
                    cur[k] = v
    return [by[i] for i in order]

def upsert(new_invoices, fees_patch=None):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    kv = load_kv()
    static_path = os.path.join(SITE, "data/billing.json")
    static = json.load(open(static_path))
    out = deepcopy(static)
    for k, v in kv.items():
        if k not in out:
            out[k] = v
    out["invoices"] = merge_invoices(kv.get("invoices"), static.get("invoices"), new_invoices)
    fees = deepcopy(kv.get("fees") or {})
    fees.update(static.get("fees") or {})
    if fees_patch:
        fees.update(fees_patch)
    out["fees"] = fees
    out["updatedAt"] = now
    proto = out.setdefault("botChargeProtocol", {})
    proto["neverDeleteInvoices"] = True
    proto["mergeRule"] = "union_by_invoice_id"
    proto["updatedAt"] = now
    for rel in ["data/billing.json", "cf-dist/data/billing.json", "netlify/functions/data/billing.json"]:
        json.dump(out, open(os.path.join(SITE, rel), "w"), indent=2)
    print(f"upserted {len(new_invoices)} ; total invoices now {len(out['invoices'])}")
    return out

if __name__ == "__main__":
    patch = json.load(sys.stdin)
    invs = patch if isinstance(patch, list) else patch.get("invoices") or [patch]
    upsert(invs, patch.get("fees") if isinstance(patch, dict) else None)
