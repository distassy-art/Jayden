# Grok Bot Billing — standing charge rule

After S2K enter/fix for **Arco Db (#42352)**, **Arco HB (#42179)**, and **Arco Placentia (#42004)**:

1. Add billable lines to `smartsolutionsai.us` billing at **$0.10/line** (`s2k_per_line`).
2. Hand the invoice queue to **Grok Bot Billing** to charge (ACH/card on file).
3. Do not invent amounts. Mark paid on the site only after payment clears.

Handoff drop folder (OneDrive): `GrokBot-Billing/`

Live: https://smartsolutionsai.us/billing.html
