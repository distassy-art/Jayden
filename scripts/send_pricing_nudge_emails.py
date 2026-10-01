#!/usr/bin/env python3
"""
Weekly AI pricing nudge emails — one per manager with pending recommendations not yet in S2K.

Pending logic mirrors app.html AI Pricing cards (review rows):
  weekly increases minus active ignores, minus entered this week (tracked), minus approved this week.

Sends via POST /api/send-pricing-nudge-to-manager (ss-api) when deployed; optional Graph fallback
with GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET (same as order emails).

Default is dry-run. Pass --send to deliver mail. Logs to COORDINATION-LOG.md at repo root.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from email_html_shell import branded_sign_off, wrap_branded_email_html  # noqa: E402

MANAGER_MAP_PATH = Path(__file__).resolve().parent / "manager_email_by_station.json"
COORD_LOG = ROOT / "COORDINATION-LOG.md"
ORDERS_FROM = "orders@smartsolutionsai26.onmicrosoft.com"
UA = "Jayden-pricing-nudge/1.0"

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def num(v: Any) -> float | None:
    try:
        n = float(v)
        if n != n:
            return None
        return n
    except (TypeError, ValueError):
        return None


def cost_key(v: Any) -> float | None:
    n = num(v)
    if n is None:
        return None
    return round(n * 10000) / 10000


def is_increase(f: dict) -> bool:
    c, r = num(f.get("currentRetail")), num(f.get("recommendedRetail"))
    return c is not None and r is not None and r > c + 0.0001


def http_json(
    url: str,
    *,
    method: str = "GET",
    body: dict | None = None,
    headers: dict | None = None,
    timeout: float = 120,
) -> tuple[int, Any]:
    h = {"User-Agent": UA, "Accept": "application/json"}
    if headers:
        h.update(headers)
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        h.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            try:
                return resp.status, json.loads(raw) if raw.strip() else {}
            except json.JSONDecodeError:
                return resp.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(raw) if raw.strip() else {}
        except json.JSONDecodeError:
            return e.code, raw


def week_key(weekly: dict) -> str:
    ws = weekly.get("weekStart") or ""
    we = weekly.get("weekEnd") or ""
    return f"{ws}_{we}" if ws else "unknown"


def load_manager_map() -> dict[str, dict]:
    data = json.loads(MANAGER_MAP_PATH.read_text(encoding="utf-8"))
    out: dict[str, dict] = {}
    for k, v in data.items():
        if k.startswith("_"):
            continue
        out[str(k)] = v
    return out


def login_session(base: str, email: str, password: str) -> str | None:
    status, j = http_json(
        f"{base.rstrip('/')}/api/session",
        method="POST",
        body={"email": email, "password": password},
    )
    if status != 200 or not isinstance(j, dict):
        return None
    return j.get("token") or j.get("accessToken") or j.get("sessionToken")


def fetch_weekly(base: str) -> dict:
    for path in ("/ai-pricing-weekly.json", "/data/ai-pricing-weekly.json"):
        status, j = http_json(f"{base.rstrip('/')}{path}")
        if status == 200 and isinstance(j, dict) and j.get("stores"):
            return j
    raise SystemExit("Could not load ai-pricing-weekly.json from site")


def fetch_ignores(base: str, token: str) -> dict[str, dict[str, dict]]:
    status, j = http_json(
        f"{base.rstrip('/')}/api/ai-pricing/ignores",
        headers={"Authorization": f"Bearer {token}"},
    )
    if status != 200 or not isinstance(j, dict):
        return {}
    return j.get("ignores") or {}


def fetch_tracked(base: str, token: str) -> list[dict]:
    status, j = http_json(
        f"{base.rstrip('/')}/api/ai-pricing/tracked",
        headers={"Authorization": f"Bearer {token}"},
    )
    if status != 200 or not isinstance(j, dict):
        return []
    return j.get("items") or []


def fetch_approvals_for_store(base: str, token: str, wk: str, sid: str) -> set[str]:
    q = f"week={urllib.parse.quote(wk)}&stationId={urllib.parse.quote(sid)}"
    status, j = http_json(
        f"{base.rstrip('/')}/api/ai-pricing/approvals?{q}",
        headers={"Authorization": f"Bearer {token}"},
    )
    upcs: set[str] = set()
    if status != 200 or not isinstance(j, dict):
        return upcs
    for a in j.get("approvals") or []:
        for it in a.get("items") or []:
            if it.get("upc") is not None:
                upcs.add(str(it["upc"]))
    return upcs


@dataclass
class PendingItem:
    item: str
    upc: str
    current_retail: float | None
    recommended_retail: float | None
    impact: float


@dataclass
class StorePending:
    station_id: str
    name: str
    pending: list[PendingItem] = field(default_factory=list)

    @property
    def count(self) -> int:
        return len(self.pending)


def impact_score(f: dict, impact_map: dict[str, float]) -> float:
    upc = str(f.get("upc") or "")
    if upc in impact_map:
        return impact_map[upc]
    c, r = num(f.get("currentRetail")), num(f.get("recommendedRetail"))
    if c is None or r is None:
        return 0.0
    return max(0.0, r - c)


def build_pending(
    weekly: dict,
    *,
    ignores: dict[str, dict[str, dict]],
    tracked_week_upcs: dict[str, set[str]],
    approved_upcs: dict[str, set[str]],
    impact_map: dict[str, float],
) -> list[StorePending]:
    wk = week_key(weekly)
    stores_out: list[StorePending] = []
    for st in weekly.get("stores") or []:
        sid = str(st.get("id") or "")
        if not sid:
            continue
        ign = ignores.get(sid) or {}
        entered = tracked_week_upcs.get(sid) or set()
        appr = approved_upcs.get(sid) or set()
        pending: list[PendingItem] = []
        for f in st.get("findings") or []:
            if not is_increase(f):
                continue
            upc = str(f.get("upc") or "")
            if not upc:
                continue
            ent = ign.get(upc)
            if ent and cost_key(ent.get("cost")) == cost_key(f.get("newCost")):
                continue
            if upc in entered or upc in appr:
                continue
            pending.append(
                PendingItem(
                    item=str(f.get("item") or "—"),
                    upc=upc,
                    current_retail=num(f.get("currentRetail")),
                    recommended_retail=num(f.get("recommendedRetail")),
                    impact=impact_score(f, impact_map),
                )
            )
        pending.sort(key=lambda x: (-x.impact, x.item))
        if pending:
            stores_out.append(
                StorePending(
                    station_id=sid,
                    name=str(st.get("name") or sid),
                    pending=pending,
                )
            )
    stores_out.sort(key=lambda s: (-s.count, s.name))
    _ = wk  # reserved for logging
    return stores_out


def group_by_manager(stores: list[StorePending], mgr_map: dict[str, dict]) -> dict[str, list[StorePending]]:
    by_email: dict[str, list[StorePending]] = {}
    for st in stores:
        meta = mgr_map.get(st.station_id) or {}
        email = str(meta.get("email") or "").strip()
        if not email:
            continue
        by_email.setdefault(email, []).append(st)
    return by_email


def already_logged_this_week(log_path: Path, wk: str, email: str) -> bool:
    if not log_path.is_file():
        return False
    text = log_path.read_text(encoding="utf-8")
    needle = f"pricing-nudge · week {wk} · {email.lower()} · sent"
    return needle in text.lower()


def append_log(lines: list[str]) -> None:
    COORD_LOG.parent.mkdir(parents=True, exist_ok=True)
    if not COORD_LOG.is_file():
        COORD_LOG.write_text("# Coordination log\n\n", encoding="utf-8")
    with COORD_LOG.open("a", encoding="utf-8") as f:
        for line in lines:
            f.write(line.rstrip() + "\n")


def post_worker_nudge(base: str, payload: dict) -> tuple[bool, dict | str]:
    status, j = http_json(
        f"{base.rstrip('/')}/api/send-pricing-nudge-to-manager",
        method="POST",
        body=payload,
    )
    if status == 404 or (isinstance(j, dict) and j.get("error") == "unknown_function"):
        return False, j
    return 200 <= status < 300, j


def graph_send_html(to: str, subject: str, html: str) -> dict:
    tenant = os.environ.get("GRAPH_TENANT_ID", "")
    client_id = os.environ.get("GRAPH_CLIENT_ID", "")
    secret = os.environ.get("GRAPH_CLIENT_SECRET", "")
    if not (tenant and client_id and secret):
        raise RuntimeError("graph_secrets_missing")
    form = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "client_secret": secret,
            "scope": "https://graph.microsoft.com/.default",
            "grant_type": "client_credentials",
        }
    ).encode()
    req = urllib.request.Request(
        f"https://login.microsoftonline.com/{urllib.parse.quote(tenant)}/oauth2/v2.0/token",
        data=form,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        token_json = json.loads(resp.read().decode())
    token = token_json.get("access_token")
    if not token:
        raise RuntimeError(f"graph_token_failed: {token_json!s}"[:300])
    msg = {
        "message": {
            "subject": subject,
            "body": {"contentType": "HTML", "content": html},
            "toRecipients": [{"emailAddress": {"address": to}}],
        },
        "saveToSentItems": True,
    }
    req2 = urllib.request.Request(
        f"https://graph.microsoft.com/v1.0/users/{urllib.parse.quote(ORDERS_FROM)}/sendMail",
        data=json.dumps(msg).encode(),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": UA,
        },
    )
    with urllib.request.urlopen(req2, timeout=60) as resp:
        return {"graphStatus": resp.status}


def build_payload_store(st: StorePending, top_n: int) -> dict:
    top = st.pending[:top_n]
    return {
        "id": st.station_id,
        "name": st.name,
        "pendingCount": st.count,
        "topItems": [
            {
                "item": it.item,
                "upc": it.upc,
                "currentRetail": it.current_retail,
                "recommendedRetail": it.recommended_retail,
                "impact": it.impact,
            }
            for it in top
        ],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Send weekly AI pricing nudge emails to store managers.")
    ap.add_argument("--site", default=os.environ.get("SS_SITE_URL", "https://smartsolutionsai.us"))
    ap.add_argument("--send", action="store_true", help="Actually send (default: dry-run only)")
    ap.add_argument("--force-to", default=os.environ.get("PRICING_NUDGE_FORCE_TO", ""))
    ap.add_argument("--top", type=int, default=5, help="Top N items by impact per store")
    ap.add_argument("--skip-log-dedupe", action="store_true")
    args = ap.parse_args()

    base = args.site.rstrip("/")
    weekly = fetch_weekly(base)
    wk = week_key(weekly)
    mgr_map = load_manager_map()

    token = os.environ.get("SS_SESSION_TOKEN") or os.environ.get("SS_ADMIN_TOKEN")
    if not token:
        email = os.environ.get("SS_ADMIN_EMAIL", "")
        password = os.environ.get("SS_ADMIN_PASSWORD", "")
        if email and password:
            token = login_session(base, email, password)
    if not token:
        print("Warning: no admin session — ignores/approvals/tracked skipped; counts may be high.", file=sys.stderr)
        ignores: dict[str, dict[str, dict]] = {}
        tracked_week_upcs: dict[str, set[str]] = {}
        approved_upcs: dict[str, set[str]] = {}
    else:
        ignores = fetch_ignores(base, token)
        tracked = fetch_tracked(base, token)
        wk_label = weekly.get("weekStart") or wk.split("_")[0]
        tracked_week_upcs = {}
        for it in tracked:
            sid = str(it.get("stationId") or "")
            if str(it.get("week") or "") != str(wk_label):
                continue
            tracked_week_upcs.setdefault(sid, set()).add(str(it.get("upc") or ""))
        approved_upcs = {}
        for st in weekly.get("stores") or []:
            sid = str(st.get("id") or "")
            if sid:
                approved_upcs[sid] = fetch_approvals_for_store(base, token, str(wk_label), sid)

    impact_map: dict[str, float] = {}
    status, imp = http_json(f"{base}/ai-pricing-impact.json")
    if status == 200 and isinstance(imp, dict):
        for _k, v in (imp.get("items") or {}).items():
            if isinstance(v, dict):
                upc = str(v.get("upc") or "")
                wk_profit = num(v.get("weeklyProfitChange"))
                if upc and wk_profit is not None:
                    impact_map[upc] = wk_profit

    stores = build_pending(
        weekly,
        ignores=ignores,
        tracked_week_upcs=tracked_week_upcs,
        approved_upcs=approved_upcs,
        impact_map=impact_map,
    )
    total_pending = sum(s.count for s in stores)
    by_mgr = group_by_manager(stores, mgr_map)

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print(f"Week {weekly.get('weekStart')}–{weekly.get('weekEnd')}: {total_pending} pending across {len(stores)} stores, {len(by_mgr)} managers")

    log_lines = [f"\n## {now} pricing-nudge · week {wk} · dry_run={not args.send}"]
    sent_count = 0

    for email, st_list in sorted(by_mgr.items(), key=lambda x: x[0].lower()):
        pending_n = sum(s.count for s in st_list)
        if pending_n <= 0:
            continue
        if (
            args.send
            and not args.skip_log_dedupe
            and already_logged_this_week(COORD_LOG, wk, email)
        ):
            print(f"  skip {email} (already logged sent this week)")
            log_lines.append(f"- {email} · skipped (already sent this week)")
            continue

        payload = {
            "managerEmail": email,
            "weekStart": weekly.get("weekStart"),
            "weekEnd": weekly.get("weekEnd"),
            "siteBase": base,
            "stores": [build_payload_store(s, args.top) for s in st_list],
            "dryRun": not args.send,
        }
        if args.force_to:
            payload["forceTo"] = args.force_to

        ok, res = post_worker_nudge(base, payload)
        if ok:
            label = "dry-run" if not args.send else "sent"
            subj = res.get("subject") if isinstance(res, dict) else ""
            print(f"  {label} {email} · {pending_n} items · worker · {subj}")
            log_lines.append(
                f"- pricing-nudge · week {wk} · {email} · {label} · pending={pending_n} · via=ss-api · subject={subj}"
            )
            if args.send and isinstance(res, dict) and res.get("sent"):
                sent_count += 1
            continue

        if not args.send:
            print(f"  dry-run {email} · {pending_n} items · (worker endpoint missing; no mail)")
            log_lines.append(
                f"- pricing-nudge · week {wk} · {email} · dry-run · pending={pending_n} · via=local · worker_missing"
            )
            continue

        store_label = st_list[0].name if len(st_list) == 1 else f"{len(st_list)} stores"
        subj = f"AI pricing: {pending_n} items to enter in S2K · {store_label}"
        parts = [
            "<p>Hi,</p>",
            "<p>Smart Solutions AI has price recommendations waiting in S2K for your store(s).</p>",
        ]
        for s in st_list:
            link = f"{base}/app.html#ai-pricing/{s.station_id}"
            parts.append(
                f"<p><strong>{s.name} (#{s.station_id})</strong> — {s.count} pending. "
                f'<a href="{link}">Open AI Pricing tab</a></p><ul>'
            )
            for it in s.pending[: args.top]:
                if it.current_retail is not None and it.recommended_retail is not None:
                    parts.append(
                        f"<li>{it.item}: ${it.current_retail:.2f} → ${it.recommended_retail:.2f} "
                        f"(est. ${it.impact:.2f}/wk)</li>"
                    )
                else:
                    parts.append(f"<li>{it.item}</li>")
            parts.append("</ul>")
        parts.append(branded_sign_off(ORDERS_FROM))
        html = wrap_branded_email_html("".join(parts), preheader=f"{pending_n} AI price updates for S2K")
        try:
            graph_send_html(args.force_to or email, subj, html)
        except RuntimeError as e:
            print(f"  FAILED {email}: {e}", file=sys.stderr)
            log_lines.append(f"- pricing-nudge · week {wk} · {email} · error · {e}")
            return 1
        print(f"  sent {email} · {pending_n} items · graph fallback")
        log_lines.append(
            f"- pricing-nudge · week {wk} · {email} · sent · pending={pending_n} · via=graph-fallback · subject={subj}"
        )
        sent_count += 1

    append_log(log_lines)
    print(f"Logged to {COORD_LOG}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
