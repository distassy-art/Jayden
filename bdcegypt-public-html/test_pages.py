#!/usr/bin/env python3
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EXPECT = {
    "queue-system": {
        "title": "كيوسيرف QServe | نظام انتظار العملاء | Queue Management System",
        "h1": "كيوسيرف QServe — نظام انتظار العملاء",
        "desc": "كيوسيرف QServe — نظام انتظار العملاء في مصر | Queue Management System. اطلب عرض سعر على واتساب.",
    },
    "nurse-call-system": {
        "title": "كيوسيرف QServe | نظام استدعاء الممرضات | Nurse Call System",
        "h1": "كيوسيرف QServe — نظام استدعاء الممرضات",
        "desc": "كيوسيرف QServe — نظام استدعاء الممرضات للمستشفيات | Nurse Call System. اطلب عرض سعر على واتساب.",
    },
    "self-service-kiosks": {
        "title": "كيوسيرف QServe | أجهزة كيوسك | Self Service Kiosks",
        "h1": "كيوسيرف QServe — أجهزة كيوسك",
        "desc": "كيوسيرف QServe — أجهزة كيوسك وخدمات ذاتية | Self Service Kiosks. اطلب عرض سعر على واتساب.",
    },
}


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
        if not title.startswith("كيوسيرف QServe"):
            errors.append(f"{slug} title must lead with كيوسيرف QServe")
        visible = re.sub(r"<link rel=\"canonical\"[^>]*>", "", html)
        visible = re.sub(r"<[^>]+>", " ", visible)
        if re.search(r"BDC|bdcegypt", visible, re.I):
            errors.append(f"{slug} visible text still has BDC/bdcegypt")
        if "qserveai.com" in html.lower():
            errors.append(f"{slug} mentions qserveai.com")
        ht = (ROOT / slug / ".htaccess").read_text(encoding="utf-8")
        if "qserveai" in ht.lower() or "RewriteRule" in ht:
            errors.append(f"{slug} .htaccess has redirects")
    if errors:
        raise SystemExit("\n".join(errors))
    print("ok: 3 pages lead with كيوسيرف QServe, no qserveai redirects")


if __name__ == "__main__":
    main()
