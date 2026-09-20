# Active site (canonical)

Mina’s current site is the live root. There is **no `/new` or `/new1`** anymore (those redirect away).

**Use this site only:**
- Live URL: **https://smartsolutionsai.us/**
- App / Billing: **https://smartsolutionsai.us/app** (Billing tab)
- UI worker: `ss-unified-proto`
- API + `/data/*` worker: `ss-api` (KV `SS_MGR` / `SS_BOOKS`)

**Do not use:**
- `/new` · `/new1` · `/tmp/jayden-admin/site-v2` · worker `smartsolutions-admin`
- Old worker name `smartsolutions-site` (removed from the account)

## Billing
Billing UI: https://smartsolutionsai.us/app → **Billing**
Static feed: `/data/billing.json` (served by `ss-api`)
Live merge / fees / paid status: `/api/billing` (KV key `billing` on `SS_MGR`)

**Stripe payment processing fees** (shown on Billing):
- ACH / e-check: **0.8%** (cap **$5**)
- Debit card or credit card: **2.9% + $0.30**

To add invoices: **`python3 scripts/billing_upsert.py`** → KV upsert only (union by invoice id, **never delete**).
Do **not** deploy `smartsolutions-admin` or anything under `/new`.
