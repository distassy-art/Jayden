#!/usr/bin/env python3
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EXPECT = {
    "queue-system": {
        "title": "نظام انتظار العملاء | BDC Egypt",
        "h1": "نظام انتظار العملاء",
        "desc": "BDC Egypt — نظام انتظار العملاء في مصر للبنوك والمستشفيات والشركات. اطلب عرض سعر على واتساب.",
    },
    "nurse-call-system": {
        "title": "نظام استدعاء الممرضات للمستشفيات | BDC Egypt",
        "h1": "نظام استدعاء الممرضات",
        "desc": "BDC Egypt — نظام استدعاء الممرضات للمستشفيات في مصر. اطلب عرض سعر على واتساب.",
    },
    "self-service-kiosks": {
        "title": "أجهزة كيوسك وخدمات ذاتية | BDC Egypt",
        "h1": "أجهزة الخدمات الذاتية",
        "desc": "BDC Egypt — أجهزة كيوسك وخدمات ذاتية في مصر. اطلب عرض سعر على واتساب.",
    },
}
LEAD_BRAND = re.compile(r"كيوسيرف|QSERVE|QServe|qserveai", re.I)


def main() -> None:
    errors = []
    for slug, exp in EXPECT.items():
        html = (ROOT / slug / "index.html").read_text(encoding="utf-8")
        title = re.search(r"<title>(.*?)</title>", html, re.S).group(1)
        h1 = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S).group(1)
        desc = re.search(r'name="description" content="(.*?)"', html).group(1)
        if title != exp["title"]:
            errors.append(f"{slug} title mismatch: {title!r}")
        if h1 != exp["h1"]:
            errors.append(f"{slug} h1 mismatch: {h1!r}")
        if desc != exp["desc"]:
            errors.append(f"{slug} meta mismatch: {desc!r}")
        if LEAD_BRAND.search(title) or LEAD_BRAND.search(h1):
            errors.append(f"{slug} title/H1 leads with frozen brand")
        if "qserveai.com" in html.lower():
            errors.append(f"{slug} mentions qserveai.com")
        if "Index of" in html:
            errors.append(f"{slug} looks like an Apache index")
        ht = (ROOT / slug / ".htaccess").read_text(encoding="utf-8")
        if "qserveai" in ht.lower() or "RewriteRule" in ht:
            errors.append(f"{slug} .htaccess has redirects")
        if "Options -Indexes" not in ht:
            errors.append(f"{slug} missing Options -Indexes")
    if errors:
        raise SystemExit("\n".join(errors))
    print("ok: 3 product pages, BDC Egypt titles/H1/meta, no redirects")


if __name__ == "__main__":
    main()
