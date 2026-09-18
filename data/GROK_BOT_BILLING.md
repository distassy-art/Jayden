# How bots charge (Billing bot)

Bots send **Smart Solutions work charges** to the Billing bot.  
Not Cursor tokens / seats / compute.

## Locked lanes
| Lane | Rate |
|------|------|
| Ordering | 1% of order totals |
| S2K | $0.10 / billable line |
| Pricebook | $0.25 / item added/fixed |
| Schedule | $25 / month |
| Tasks | $25 / month |

Reports / filing / audits / hourly are **not locked** — do not charge those yet.

## Flow
1. Do the client work.
2. Add an invoice under a locked lane on `smartsolutionsai.us` billing.
3. Tell Billing bot the **job** + invoice ids to check on Sep invoices.
4. Billing bot charges the client from those invoices.

Live: https://smartsolutionsai.us/billing.html
