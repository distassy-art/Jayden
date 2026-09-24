# Smart Solutions AI — NEW SITE Source of Truth

**ALWAYS work on this site. Never deploy Better profit / marketing-old or site-v2 shell as `/`.**

## Live identity (confirmed 2026-09-24)
- **Domain:** https://smartsolutionsai.us/ (and www)
- **Worker:** `ss-unified-proto` (Cloudflare Workers custom domain + routes `smartsolutionsai.us/*`)
- **API worker:** `ss-api` (routes `/api/*`, `/data/*`, `/contact`)
- **Pre-login home `/`:** ice-blue marketing login page
  - HTML comment: `ss-home-restore:20260923-152228:login.html`
  - Title: `Smart Solutions AI · AI gas station & convenience store manager`
  - Theme: `#1e6bff`
  - Response header: `x-ss-page: login`
  - Login CTA: `#login` / `#btnLogin`
- **Post-login app `/app`:** locked shell `x-ss-shell-source: locked-shell`, stamp `hb125+`

## Rejected / OLD (do not put on `/`)
1. "Better profit by controlling the buy" (navy/cyan marketing-old)
2. site-v2 SPA boot ("An AI store manager for fuel and convenience sites", `#0b2545`, `id="app"`)
3. App-zip “Controlling your store got easier with AI” (navy/cyan; OneDrive Aug 23 zips)

## OneDrive — archives only (do not restore as live home)
Ice-blue `#1e6bff` / `ss-home-restore` / `fb-carousel` home is **not** stored on OneDrive.
These OneDrive paths are **old** and must not be redeployed as `/`:
- `Documents/website/smartsolutionsai-2026-09-*.tar.gz` → Better profit index
- `Documents/Smart Solutions — archived websites/smartsolutions-site-OLD-CLOUDFLARE-archive-20260924.tar.gz` → same Better profit snapshot
- `Documents/Smart Solutions Ai App/Smart-Solutions-AI-app*.zip` → older “Controlling your store…” login home

Canonical source for the new home: **live** `https://smartsolutionsai.us/` (+ local mirror below).

## Local mirror
- Live snapshot: `/tmp/ss-new-live/`
- Deploy tree: `/tmp/ss-unified-proto/` (assets must match live login home)

## Deploy rule
Only `npx wrangler deploy` from `/tmp/ss-unified-proto` for frontend/UI on the custom domain.
Never deploy `ss-site` / `smartsolutions-site` / site-v2 as the custom-domain home.
