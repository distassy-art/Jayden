# Upload to SuperSonic (bdcegypt.com)

Live host: `162.0.212.3`. This overlay does **not** change home titles/H1, About/Contact, or www. It does **not** redirect to qserveai.com.

## Missing access

This environment has no cPanel, FTP, or SSH to SuperSonic (ports 21/22/2082/2083 timed out). Upload these files in cPanel File Manager or FTP to `public_html`.

## Files

Copy into the matching folders (do not replace `public_html/index.html`):

- `queue-system/index.html`
- `queue-system/.htaccess`
- `nurse-call-system/index.html`
- `nurse-call-system/.htaccess`
- `self-service-kiosks/index.html`
- `self-service-kiosks/.htaccess`
- `_next/.htaccess` (stops `Index of /_next`)

Optional: merge `indexes-only.htaccess` into the existing root `.htaccess` (Options -Indexes + hide `__next*` files). Do not add www or qserveai rewrites.

## After upload

These must return `200` `text/html` (not `Index of`):

- https://bdcegypt.com/queue-system/
- https://bdcegypt.com/nurse-call-system/
- https://bdcegypt.com/self-service-kiosks/

`https://bdcegypt.com/queue-system/__next._full.txt` should be 403.
