#!/usr/bin/env python3
"""Upsert invoices into shared billing KV. Never deletes. Never deploys old site."""
import json, sys, subprocess, os
from copy import deepcopy
from datetime import datetime, timezone

NS = "750cc39750864d5e8adec86a21c1e21d"
# Scratch dir for wrangler cwd only — NOT the old site tree for deploys
WRANGLER_CWD = os.environ.get("SS_WRANGLER_CWD", "/tmp/ss-site")

def load_kv():
    r = subprocess.run(
        ["npx", "wrangler", "kv:key", "get", "billing", f"--namespace-id={NS}"],
        cwd=WRANGLER_CWD, capture_output=True, text=True, check=True,
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
    out = deepcopy(kv)
    out["invoices"] = merge_invoices(kv.get("invoices"), new_invoices)
    fees = deepcopy(kv.get("fees") or {})
    if fees_patch:
        fees.update(fees_patch)
    out["fees"] = fees
    out["updatedAt"] = now
    proto = out.setdefault("botChargeProtocol", {})
    proto.update({
        "neverDeleteInvoices": True,
        "mergeRule": "union_by_invoice_id",
        "activeSite": "https://smartsolutionsai.us/new/",
        "noOldSiteDeploy": True,
        "updatedAt": now,
    })
    path = "/tmp/billing_kv_upsert.json"
    json.dump(out, open(path, "w"), indent=2)
    subprocess.run(
        ["npx", "wrangler", "kv:key", "put", "billing", f"--path={path}", f"--namespace-id={NS}"],
        cwd=WRANGLER_CWD, check=True,
    )
    print(f"KV upserted {len(new_invoices)}; total invoices {len(out['invoices'])} (no old-site deploy)")
    return out

if __name__ == "__main__":
    patch = json.load(sys.stdin)
    invs = patch if isinstance(patch, list) else patch.get("invoices") or [patch]
    upsert(invs, patch.get("fees") if isinstance(patch, dict) else None)
