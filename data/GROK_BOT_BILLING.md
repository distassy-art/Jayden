# How bots charge (Billing bot)

Add invoices **directly on the website Billing section** (`smartsolutionsai.us` → `data/billing.json`), same cards as Ordering / S2K / Schedule.

**Bot adds and you also add — do not delete.** Upsert by invoice `id` only. Never remove another bot’s or human’s invoices.

Do **not** email charge handoffs. OneDrive `GrokBot-Billing/` is optional only.

Not Cursor tokens / seats / compute.

## Locked lanes
| Lane | Rate | Invoice `kind` |
|------|------|----------------|
| Ordering | 1% of order totals | `ordering_pct` |
| S2K | $0.10 / billable line | `s2k_per_line` |
| Pricebook | $0.25 / item | `pricebook_per_item` |
| Schedule | $25 / month | `schedule_tasks` |
| Tasks | $25 / month | `schedule_tasks` |

Reports / filing / audits / hourly are **not locked** — do not charge those yet.

## Flow
1. Do the client work.
2. Upsert an invoice under the right client/month (same shape as existing Sep invoices).
3. Merge with current KV + site billing first — keep every existing invoice id.
4. Deploy `billing.json` (assets + KV).
5. Billing bot charges from those Sep invoices on the site.

Helper: `scripts/billing_upsert.py` (stdin JSON invoice(s) → safe union merge).

Live: https://smartsolutionsai.us/billing.html
