# AGENTS.md

**Publishing anything to smartsolutionsai.us: read [SITE-PUBLISH.md](SITE-PUBLISH.md).** Put the file
under `site-publish/<same path as in ss-unified-proto>`, then commit and push. Never touch Cloudflare,
and never invent numbers.

## Cursor Cloud specific instructions

There is no package install and no dev server. Python 3 (stdlib only) and Node 22 are already on the image. The toolchain check is `python3 --version` and `node --version`.

Prove the committed data set is internally consistent before editing it. The three billing copies must be the same bytes, and the two depts copies must be the same bytes:

```bash
python3 - <<'PY'
import json, pathlib
pairs = [
    ("site-publish/public/data/billing.json", "site-publish/public/billing-live.json"),
    ("site-publish/public/data/billing.json", "site-publish/api/cf-dist/data/billing.json"),
    ("site-publish/public/data/depts.json", "site-publish/api/cf-dist/data/depts.json"),
]
for left, right in pairs:
    left_bytes = pathlib.Path(left).read_bytes()
    right_bytes = pathlib.Path(right).read_bytes()
    if left_bytes != right_bytes:
        raise SystemExit(f"byte mismatch: {left} vs {right}")
    json.loads(left_bytes)
print("billing and depts copies match")
PY
```

Ordering-fee math lives in `scripts/patch_billing_oct2026_ordering_fees.py` (`site_order_fee`). September is a flat 1%. October is 1% on the first $2,000 and 0.5% above that. That script's `main` fetches `https://smartsolutionsai.us/data/billing.json` and rewrites the three billing copies. That URL returns 401 without the site session, so leave `main` unrun and keep working from the copies already under `site-publish/`. `scripts/extend_depts_sept_0928.py` reads Daily Book PDFs and `/tmp/s2k/fill_secondary_tables.py`, which are not in this repo.

Leave `.github/scripts/site-publish-bridge.sh` for the `publish-to-site` GitHub Action. It clones `ss-unified-proto` and pushes `main`. `SS_PROTO_PUSH_TOKEN` is an Actions secret. Do not use `CLOUDFLARE_API_TOKEN`.
