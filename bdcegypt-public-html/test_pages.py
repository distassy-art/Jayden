#!/usr/bin/env python3
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EXPECT = {
    "queue-system": {
        "title": "مصنع شاشات نظام انتظار العملاء في مصر كيوسيرف | Queue Management System Egypt Qserve Kiosk",
        "h1": "نظام انتظار العملاء في مصر",
    },
    "nurse-call-system": {
        "title": " مصنع نظام استدعاء الممرضات في مصر| Nurse Call System Egypt",
        "h1": "نظام استدعاء الممرضات للمستشفيات في مصر",
    },
    "self-service-kiosks": {
        "title": "أجهزة الخدمات الذاتية  كيوسك في مصر  | Self Service Kiosks Egypt",
        "h1": "أجهزة الخدمات الذاتية في مصر",
    },
}


def main() -> None:
    errors = []
    for slug, exp in EXPECT.items():
        html = (ROOT / slug / "index.html").read_text(encoding="utf-8")
        title = re.search(r"<title>(.*?)</title>", html, re.S).group(1)
        h1 = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S).group(1)
        if title != exp["title"]:
            errors.append(f"{slug} title mismatch: {title!r}")
        if h1 != exp["h1"]:
            errors.append(f"{slug} h1 mismatch: {h1!r}")
        if "qserveai.com" in html.lower():
            errors.append(f"{slug} mentions qserveai.com")
        if "Index of" in html:
            errors.append(f"{slug} looks like an Apache index")
        ht = (ROOT / slug / ".htaccess").read_text(encoding="utf-8")
        if "qserveai" in ht.lower() or "RewriteRule" in ht:
            errors.append(f"{slug} .htaccess has redirects")
        if "Options -Indexes" not in ht:
            errors.append(f"{slug} missing Options -Indexes")
    root_ht = (ROOT / "indexes-only.htaccess").read_text(encoding="utf-8")
    if "RewriteRule" in root_ht or "qserveai" in root_ht.lower():
        errors.append("indexes-only.htaccess has redirects")
    if errors:
        raise SystemExit("\n".join(errors))
    print("ok: 3 product pages, original titles/H1, no qserveai redirects")


if __name__ == "__main__":
    main()
