#!/usr/bin/env python3
"""Write a sample branded HTML email to /tmp for manual review in a browser."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from email_html_shell import branded_sign_off, wrap_branded_email_html  # noqa: E402

body = (
    "<p>Hi,</p>"
    "<p>This is a <strong>preview</strong> of the Smart Solutions AI branded email shell "
    "(header wordmark + footer bar).</p>"
    + branded_sign_off("orders@smartsolutionsai26.onmicrosoft.com")
)
html = wrap_branded_email_html(body, preheader="Branded email preview")
out = Path("/tmp/smart-solutions-branded-email-preview.html")
out.write_text(html, encoding="utf-8")
print(out)
