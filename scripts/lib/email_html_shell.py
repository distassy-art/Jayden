"""Branded HTML wrapper for Smart Solutions outbound mail."""
from __future__ import annotations

import html
import json
from pathlib import Path

_BRANDING_PATH = Path(__file__).resolve().parents[1] / "email_branding.json"


def load_branding() -> dict:
    return json.loads(_BRANDING_PATH.read_text(encoding="utf-8"))


def wrap_branded_email_html(body_html: str, *, preheader: str | None = None, branding: dict | None = None) -> str:
    b = {**load_branding(), **(branding or {})}
    pre = (
        f'<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">{html.escape(preheader)}</div>'
        if preheader
        else ""
    )
    site = html.escape(str(b["siteBase"]))
    logo = html.escape(str(b["logoUrl"]))
    foot = html.escape(str(b["footerUrl"]))
    text = html.escape(str(b.get("textColor", "#0f2742")))
    accent = html.escape(str(b.get("accentColor", "#1F4E78")))
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:{text}">
{pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e7ee">
<tr><td style="padding:22px 24px 10px;text-align:center"><a href="{site}" style="text-decoration:none"><img src="{logo}" alt="Smart Solutions AI" width="320" style="max-width:100%;height:auto;border:0;display:block;margin:0 auto" /></a></td></tr>
<tr><td style="padding:12px 24px 28px;font-size:15px;line-height:1.55">{body_html}</td></tr>
<tr><td style="padding:0;line-height:0;font-size:0"><img src="{foot}" alt="" width="600" style="max-width:100%;height:auto;display:block;border:0" /></td></tr>
</table></td></tr></table>
</body></html>"""


def branded_sign_off(from_mailbox: str | None = None) -> str:
    b = load_branding()
    mb = html.escape(from_mailbox or b["mailboxes"]["orders"])
    accent = html.escape(str(b.get("accentColor", "#1F4E78")))
    return (
        f'<p style="margin-top:24px;color:#526070">Thanks,<br>'
        f'<strong style="color:{accent}">Smart Solutions AI</strong><br>'
        f'<span style="font-size:13px">{mb}</span></p>'
    )
