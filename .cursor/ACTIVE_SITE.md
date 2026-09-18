# Active site (canonical)

**Use this site only:**
- Path: `/tmp/jayden-admin/site-v2` (symlink: `/workspace/smartsolutions-site`)
- Live URL: **https://smartsolutionsai.us/new/**
- Worker: `smartsolutions-admin` (`npx wrangler deploy --env live`)
- Preview: `smartsolutions-admin-preview`

**Do not use / do not deploy again:**
- `/tmp/ss-site` · Worker `smartsolutions-site` · root `https://smartsolutionsai.us/` (old site)

## Billing
New site Billing page reads company billing via `/api/billing` (proxied).
To add invoices: **upsert KV key `billing` only** (union by invoice id, never delete).
Do **not** run `wrangler deploy` on the old `smartsolutions-site` worker.
