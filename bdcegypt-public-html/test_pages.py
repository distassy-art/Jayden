#!/usr/bin/env python3
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EXPECT = {
    "queue-system": "كيوسيرف | نظام انتظار العملاء في مصر | QServe",
    "nurse-call-system": "كيوسيرف | نظام استدعاء الممرضات في مصر | QServe",
    "self-service-kiosks": "كيوسيرف | كيوسك في مصر | QServe",
}
NEED = [
    "+20 122 799 3999",
    "info@bdcegypt.com",
    "التجمع الثالث",
    "القاهرة الجديدة",
    "منطقة 10000",
    "الاسم",
    "الرسالة",
    "إرسال",
    "Facebook",
    "YouTube",
    "WhatsApp",
]


def main() -> None:
    errors = []
    for slug, exp_title in EXPECT.items():
        html = (ROOT / slug / "index.html").read_text(encoding="utf-8")
        title = re.search(r"<title>(.*?)</title>", html, re.S).group(1)
        h1 = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S).group(1)
        if title != exp_title:
            errors.append(f"{slug} title mismatch: {title!r}")
        if not h1.startswith("كيوسيرف QServe"):
            errors.append(f"{slug} H1 must lead with كيوسيرف QServe")
        if "BDC Egypt" in title or "BDC Egypt" in h1:
            errors.append(f"{slug} title/H1 has BDC Egypt")
        if "qserveai.com" in html.lower():
            errors.append(f"{slug} mentions qserveai.com")
        for bit in NEED:
            if bit not in html:
                errors.append(f"{slug} missing {bit!r}")
        ht = (ROOT / slug / ".htaccess").read_text(encoding="utf-8")
        if "RewriteRule" in ht:
            errors.append(f"{slug} .htaccess has redirects")
    if errors:
        raise SystemExit("\n".join(errors))
    print("ok")


if __name__ == "__main__":
    main()
