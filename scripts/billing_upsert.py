#!/usr/bin/env python3
"""Upsert invoices into shared billing KV for the live site Billing page.

Active site: https://smartsolutionsai.us/ (app Billing tab)
Workers: ss-unified-proto (UI) + ss-api (API/data, SS_MGR KV)
Never deletes invoices. Do not deploy /new or smartsolutions-admin.
"""
import json, sys, subprocess, os
from copy import deepcopy
from datetime import datetime, timezone

NS = "750cc39750864d5e8adec86a21c1e21d"
ACTIVE_SITE = "https://smartsolutionsai.us/"
ACTIVE_BILLING = "https://smartsolutionsai.us/app"
# Neutral cwd + pinned wrangler v3 (KV get/put flags).
WRANGLER_CWD = os.environ.get("SS_WRANGLER_CWD", "/tmp")
WRANGLER = ["npx", "--yes", "wrangler@3.114.15"]

def _wrangler(*args, check=True):
    return subprocess.run(
        [*WRANGLER, *args],
        cwd=WRANGLER_CWD, capture_output=True, text=True, check=check,
    )

def load_kv():
    r = _wrangler("kv:key", "get", "billing", f"--namespace-id={NS}")
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
        "activeSite": ACTIVE_SITE,
        "activeBilling": ACTIVE_BILLING,
        "noNewPath": True,
        "noOldSiteDeploy": True,
        "how": "Upsert invoices into KV billing for https://smartsolutionsai.us/app Billing. Do not use /new.",
        "updatedAt": now,
    })
    path = "/tmp/billing_kv_upsert.json"
    json.dump(out, open(path, "w"), indent=2)
    _wrangler(
        "kv:key", "put", "billing", f"--path={path}", f"--namespace-id={NS}",
    )
    print(
        f"KV upserted {len(new_invoices)}; total invoices {len(out['invoices'])} "
        f"(activeSite={ACTIVE_SITE}; no old-site deploy)"
    )
    return out

if __name__ == "__main__":
    patch = json.load(sys.stdin)
    invs = patch if isinstance(patch, list) else patch.get("invoices") or [patch]
    upsert(invs, patch.get("fees") if isinstance(patch, dict) else None)
