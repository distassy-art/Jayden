# How bots charge (Billing bot)

Work on the **new site only**: https://smartsolutionsai.us/new/  
Do **not** deploy or edit the old root site (`smartsolutions-site` / `/tmp/ss-site`).

Add invoices by **KV upsert** (shared `billing` key). Bot adds and you also add — **do not delete**.

Do **not** email charge handoffs. OneDrive `GrokBot-Billing/` is optional only.

## Locked lanes
| Lane | Rate | Invoice `kind` |
|------|------|----------------|
| Ordering | 1% of order totals | `ordering_pct` |
| S2K | $0.10 / billable line | `s2k_per_line` |
| Pricebook | $0.25 / item | `pricebook_per_item` |
| Schedule | $25 / month | `schedule_tasks` |
| Tasks | $25 / month | `schedule_tasks` |

## Flow
1. Do the client work.
2. Upsert invoice(s) with `scripts/billing_upsert.py` (KV only).
3. Billing shows under **Billing** on https://smartsolutionsai.us/new/
4. Billing bot charges from those Sep invoices.

Helper: `python3 scripts/billing_upsert.py < invoice.json`
