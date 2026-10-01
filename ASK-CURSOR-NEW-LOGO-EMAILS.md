# New logo — outbound HTML emails

## Goal
All **Smart Solutions** HTML mail (Graph send from shared mailboxes) uses the **August 2026 wordmark** and footer art, with images served from **https://smartsolutionsai.us** (not inline attachments, not Gmail).

Marketing site favicon remains `logo-mark.png`; **email uses the wide logo** from OneDrive `Documents/Logo/`.

## Hosted assets (publish via Jayden site bridge)
After merge, these URLs must return PNG (200):

| URL | File |
|-----|------|
| `https://smartsolutionsai.us/data/branding/email/Smart-Solutions-AI-logo.png?v=20260823` | Wordmark header |
| `https://smartsolutionsai.us/data/branding/email/footer.png?v=20260823` | Footer strip |

Repo paths (mirror both trees):

- `site-publish/public/data/branding/email/*.png`
- `site-publish/api/cf-dist/data/branding/email/*.png`

Manifest: `site-publish/public/data/branding/email/branding.json`  
Canonical config for code: `scripts/email_branding.json`.

**Refresh PNGs from OneDrive** when Logo folder changes: OneDrive MCP `get_drive_item` on `Smart-Solutions-AI-logo.png` / `footer.png` (folder `Documents/Logo`), download with `@microsoft.graph.downloadUrl`, overwrite site-publish copies, bump `?v=` query in JSON if bytes changed.

## HTML shell (single layout)
| Piece | Path |
|--------|------|
| Node (ss-api reference) | `scripts/lib/email_html_shell.js` |
| Python (Jayden runners) | `scripts/lib/email_html_shell.py` |
| Preview | `python3 scripts/preview_branded_email_html.py` → `/tmp/smart-solutions-branded-email-preview.html` |

Layout: centered 600px card, logo linked to site, body slot, footer image, sign-off with mailbox address.

## Mailboxes (never Gmail)
| From | Use |
|------|-----|
| `orders@smartsolutionsai26.onmicrosoft.com` | Vendor order PDFs, AI pricing nudges |
| `audit@smartsolutionsai26.onmicrosoft.com` | Financial / audit summaries (Send As in Outlook UI when MCP cannot set From) |

See `/cursor/stores/self/email-policy.md`.

## ss-api handlers to update (ss-unified-proto)
Jayden ships **reference** handlers; copy into worker `src/handlers/` and register in the `FN` map:

| Route | Reference |
|-------|-----------|
| `POST /api/send-order-to-manager` | `scripts/ss-api-reference/send-order-to-manager.js` |
| `POST /api/send-pricing-nudge-to-manager` | `scripts/ss-api-reference/send-pricing-nudge-to-manager.js` |

Both use the branded shell (logo + footer URLs above). Deploy ss-api after publishing PNGs so clients load images on first live send.

**Existing production handler:** If ss-api already has `send-order-to-manager`, replace its HTML builder with `wrapBrandedEmailHtml` / the same logo URLs — do not change Graph auth or attachment logic.

## Jayden automation
| Flow | Branding |
|------|----------|
| Weekly AI pricing nudge | `scripts/send_pricing_nudge_emails.py` (Graph fallback uses shell); worker route preferred |
| Order PDF email | ss-api `send-order-to-manager` after deploy |

## Manual / Outlook
For one-off audit or client mail composed in Outlook: insert picture from the hosted logo URL (or local `Documents/Logo/Smart-Solutions-AI-logo.png`), **Send As** `audit@` or `orders@` per Work Mailboxes.xlsx. Do not use personal Gmail.

## Checklist
1. Publish PNGs + `branding.json` through site bridge; verify both URLs in a browser.
2. Deploy ss-api handlers with branded HTML.
3. Send one test to `MinaMorcos@…` with `forceTo` / dry-run, then one live order or pricing nudge.
4. Confirm images render in Outlook desktop and mobile (external images allowed).
