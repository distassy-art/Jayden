# Admin Statistics patch

Deploy these files to the live Smart Solutions AI site root (same level as `tickets.html`):

- `statistics.html` — new Admin Statistics page
- `statistics.js` — loads `/data/vendor-avg-per-month-2026.json`
- `data/vendor-avg-per-month-2026.json` — whole-year vendor averages
- `app.js` — Admin nav includes Statistics (+ vendor-calendar)
- `tickets.html` — Admin card + sidebar link
- `vendor-calendar.html` — sidebar Statistics link
- `netlify.toml` — `/statistics` → `statistics.html`

Admin-only (same gate as vendor calendar).
