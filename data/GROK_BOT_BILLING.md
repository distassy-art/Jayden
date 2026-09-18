# How bots charge (Billing bot)

Add invoices **directly on the website Billing section** (`smartsolutionsai.us` → `data/billing.json`), same cards as Ordering / S2K / Schedule.

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
2. Append an invoice object under the right client/month (same shape as existing Sep invoices).
3. Deploy `billing.json` (assets + KV).
4. Billing bot charges from those Sep invoices on the site.

Live: https://smartsolutionsai.us/billing.html
