#!/usr/bin/env python3
"""Show Budget and Command Center to owners and stations.

Owners see every station they own, and one station at a time.
A station login sees only that station.
Admin still sees every client.

The live worker is downloaded and this block is inserted. Existing lines stay.
Budget, billing, Command Center, the Arco Db count, and the Tustin count are
checked before the new version is left in place.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

ACCOUNT = "1ad267ec20bc187ad2fe348f66ed7acf"
OAUTH_CLIENT = "54d11594-84e4-41aa-b438-e81b8fa78ee7"
TOML = Path("/home/ubuntu/.config/.wrangler/config/default.toml")
WORKER = "ss-unified-proto"
MARK = "ss-owner-budget-v1"
BLOCK_START = "/* ss-owner-budget-v1 */"
BLOCK_END = "/* ss-owner-budget-v1-end */"
HOOK = "  chosen = ssAddTustinCig(chosen);\n"
CALL = "  chosen = ssAddTustinCig(chosen);\n  chosen = ssOwnerBudget(chosen);\n"
PAIRS = [["        const navBudget = document.getElementById('navBudget');\n        // Budget + Command Center nav: admin only. Owners and managers never see them.\n        if (navBudget) navBudget.hidden = !(role === 'admin');\n        const navCommand = document.getElementById('navCommand');\n        if (navCommand) navCommand.hidden = !(role === 'admin');\n        refreshScopes();\n        if (role !== 'admin' && (view === 'budget' || view === 'command')) setView('home');\n","        const navBudget = document.getElementById('navBudget');\n        /* ss-owner-budget-applied */\n        if (navBudget) navBudget.hidden = !(role === 'admin' || role === 'owner' || role === 'manager');\n        const navCommand = document.getElementById('navCommand');\n        if (navCommand) navCommand.hidden = !(role === 'admin' || role === 'owner' || role === 'manager');\n        refreshScopes();\n        if (view === 'budget' && typeof buildBudget === 'function') buildBudget();\n        if (view === 'command' && typeof buildCommandCenter === 'function') buildCommandCenter();\n"],["      function setView(next) {\n        if ((next === 'budget' || next === 'command') && role !== 'admin') {\n          next = 'home';\n          try {\n            const h = (location.hash || '').replace(/^#/, '');\n            if (h === 'budget' || h === 'command' || h === 'command-center') {\n              history.replaceState(null, '', location.pathname + location.search);\n            }\n          } catch (e) {}\n        }\n        view = next;\n","      function setView(next) {\n        view = next;\n"],["          if (h === 'budget' || h === 'command' || h === 'command-center') {\n            var adminView = (h === 'command-center') ? 'command' : h;\n            if (role === 'admin') setView(adminView);\n            else {\n              history.replaceState(null, '', location.pathname + location.search);\n              if (view === 'budget' || view === 'command') setView('home');\n            }\n            return;\n          }\n","          if (h === 'budget' || h === 'command' || h === 'command-center') {\n            var adminView = (h === 'command-center') ? 'command' : h;\n            setView(adminView);\n            return;\n          }\n"],["        if (role !== 'admin' && (view === 'budget' || view === 'command' || h === 'budget' || h === 'command' || h === 'command-center')) {\n          setView('home');\n        }\n","        /* owner and station stay on Budget and Command Center */\n"],["        if (role !== 'admin') {\n          hideBudgetKpis();\n          if (panels) {\n            panels.innerHTML = '<div class=\"card table-wrap\"><table class=\"data\"><tbody><tr><td class=\"muted\">Admin only.</td></tr></tbody></table></div>';\n          }\n          return;\n        }\n",""],["        const allow = function (id) {\n          if (!allowed || !ownerKey || ownerKey === 'all') return true;\n          return allowed.indexOf(String(id)) >= 0;\n        };\n","        const allow = function (id) {\n          if (typeof role !== 'undefined' && role !== 'admin' && typeof stationIdsForScope === 'function') {\n            if (String(id) === '42642') return false;\n            var mine = stationIdsForScope().map(String);\n            if (mine.indexOf(String(id)) < 0) return false;\n          }\n          if (!allowed || !ownerKey || ownerKey === 'all') return true;\n          return allowed.indexOf(String(id)) >= 0;\n        };\n"],["        if (ownerKey && ownerKey !== 'all') return ownerKey;\n        return '';\n      }\n\n","        if (ownerKey && ownerKey !== 'all') return ownerKey;\n        if (typeof role !== 'undefined' && role !== 'admin' && typeof stationIdsForScope === 'function') {\n          var scoped = stationIdsForScope().map(String).filter(function (id) { return id !== '42642'; });\n          if (scoped.length === 1) return scoped[0];\n          if (scoped.length) return '__scope__';\n        }\n        return '';\n      }\n\n"],["        if (!k) return '';\n        if (/^\\d{4,}$/i.test(k) || k === 'extramile') return budgetClientLabel(k) || k;\n","        if (!k) return '';\n        if (k === '__scope__') {\n          var n = (typeof stationIdsForScope === 'function') ? stationIdsForScope().length : 0;\n          return n ? ('Your stations (' + n + ')') : 'Your stations';\n        }\n        if (/^\\d{4,}$/i.test(k) || k === 'extramile') return budgetClientLabel(k) || k;\n"],["        const looksLikeStore = /^\\d{4,}$/i.test(raw) || raw === 'extramile';\n        let storeIds;\n        if (looksLikeStore) {\n          storeIds = [raw];\n        } else {\n          // Demoted path: old owner-email selection\n          storeIds = ownerStoresForFilter(raw).map(String);\n        }\n","        const looksLikeStore = /^\\d{4,}$/i.test(raw) || raw === 'extramile';\n        let storeIds;\n        if (raw === '__scope__') {\n          storeIds = (typeof stationIdsForScope === 'function') ? stationIdsForScope().map(String) : [];\n        } else if (looksLikeStore) {\n          storeIds = [raw];\n        } else {\n          // Demoted path: old owner-email selection\n          storeIds = ownerStoresForFilter(raw).map(String);\n        }\n        if (typeof role !== 'undefined' && role !== 'admin' && typeof stationIdsForScope === 'function') {\n          var mineSet = {};\n          stationIdsForScope().forEach(function (id) { mineSet[String(id)] = true; });\n          storeIds = storeIds.filter(function (id) { return String(id) !== '42642' && mineSet[String(id)]; });\n        }\n"],["        let html = '<option value=\"\">Select a client\u2026</option>';\n","        let html = '<option value=\"\">' + ((typeof role !== 'undefined' && role !== 'admin') ? 'All your stations' : 'Select a client\u2026') + '</option>';\n"],["          if (sp && sid && Array.prototype.some.call(sp.options, function (o) { return o.value === sid; })) {\n            sp.value = sid;\n            syncStationToLegacy(sid);\n          }\n          buildBudget();\n","          if (sp && sid && Array.prototype.some.call(sp.options, function (o) { return o.value === sid; })) {\n            sp.value = sid;\n            syncStationToLegacy(sid);\n          } else if (sp && !sid && typeof role !== 'undefined' && role !== 'admin') {\n            if (Array.prototype.some.call(sp.options, function (o) { return o.value === 'all'; })) {\n              sp.value = 'all';\n              syncStationToLegacy('all');\n            }\n          }\n          buildBudget();\n"],["        populateBudgetClientSelect();\n","        var budgetLead = document.getElementById('budgetLead');\n        if (budgetLead && typeof role !== 'undefined' && role !== 'admin') {\n          budgetLead.textContent = 'Your stations only. All stores shows every station you own. Pick one station to see that budget.';\n        }\n        populateBudgetClientSelect();\n"],["      function commandFilterStoreIds() {\n        const storeSel = document.getElementById('storePicker');\n        const stationVal = storeSel ? String(storeSel.value || 'all') : 'all';\n        if (stationVal && stationVal !== 'all') return [stationVal];\n        const ownerKey = (typeof currentOwnerFilter === 'function') ? currentOwnerFilter() : 'all';\n        if (ownerKey && ownerKey !== 'all' && typeof ownerStoresForFilter === 'function') {\n          return ownerStoresForFilter(ownerKey).map(String);\n        }\n        return null;\n      }\n\n","      function commandFilterStoreIds() {\n        if (typeof role !== 'undefined' && role !== 'admin' && typeof stationIdsForScope === 'function') {\n          var mine = stationIdsForScope().map(String).filter(function (id) { return id !== '42642'; });\n          return mine.length ? mine : ['__none__'];\n        }\n        const storeSel = document.getElementById('storePicker');\n        const stationVal = storeSel ? String(storeSel.value || 'all') : 'all';\n        if (stationVal && stationVal !== 'all') return [stationVal];\n        const ownerKey = (typeof currentOwnerFilter === 'function') ? currentOwnerFilter() : 'all';\n        if (ownerKey && ownerKey !== 'all' && typeof ownerStoresForFilter === 'function') {\n          return ownerStoresForFilter(ownerKey).map(String);\n        }\n        return null;\n      }\n\n"],["  if (typeof role !== \"undefined\" && role !== \"admin\") {\n    host.innerHTML = '<p class=\"cc-empty\">Admin only.</p>';\n    if (situation) situation.textContent = \"Command Center is for the admin view.\";\n    return;\n  }\n",""],["    if (meta) meta.textContent = \"All clients \u00b7 through \" + (through || \"latest posted day\");\n    if (allWrap) allWrap.hidden = false;\n","    if (meta) meta.textContent = ((typeof role !== \"undefined\" && role !== \"admin\") ? \"Your stations\" : \"All clients\") + \" \u00b7 through \" + (through || \"latest posted day\");\n    if (allWrap) allWrap.hidden = false;\n    if (allWrap && typeof role !== \"undefined\" && role !== \"admin\") {\n      var scopeHead = allWrap.querySelector(\"h3\");\n      if (scopeHead) scopeHead.textContent = \"Your stations\";\n    }\n"],["        if (role !== 'admin') {\n          body.innerHTML = '<tr><td colspan=\"7\" class=\"muted\">Admin only.</td></tr>';\n          if (tabsHost) tabsHost.innerHTML = '';\n          if (panelHost) panelHost.innerHTML = '<p class=\"cc-empty\">Admin only.</p>';\n          if (yoyGrid) yoyGrid.innerHTML = '<p class=\"muted\">Admin only.</p>';\n          setText('ccValStores', '\u2014'); setText('ccValMargin', '\u2014'); setText('ccValOver', '\u2014'); setText('ccValRisk', '\u2014'); setText('ccValSpike', '\u2014');\n          var mb = document.getElementById('commandMarginBody');\n          var ob = document.getElementById('commandOverDeptBody');\n          if (mb) mb.innerHTML = '<p class=\"cc-empty\">Admin only.</p>';\n          if (ob) ob.innerHTML = '<p class=\"cc-empty\">Admin only.</p>';\n          return;\n        }\n",""]]


def load_token() -> str:
    text = TOML.read_text()
    match = re.search(r'oauth_token\s*=\s*"([^"]+)"', text)
    if not match:
        raise SystemExit("wrangler oauth token missing")
    return match.group(1)


def refresh_token() -> str:
    text = TOML.read_text()
    refresh = re.search(r'refresh_token\s*=\s*"([^"]+)"', text)
    if not refresh:
        raise SystemExit("wrangler refresh token missing")
    body = urllib.parse.urlencode(
        {
            "grant_type": "refresh_token",
            "refresh_token": refresh.group(1),
            "client_id": OAUTH_CLIENT,
        }
    ).encode()
    req = urllib.request.Request(
        "https://dash.cloudflare.com/oauth2/token",
        data=body,
        headers={"User-Agent": "ss-owner-budget", "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.loads(resp.read().decode())
    token = payload.get("access_token")
    new_refresh = payload.get("refresh_token") or refresh.group(1)
    expires_in = int(payload.get("expires_in") or 3600)
    if not token:
        raise SystemExit("oauth refresh returned no access token")
    from datetime import datetime, timedelta, timezone

    exp = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    text = re.sub(r'oauth_token\s*=\s*"[^"]*"', f'oauth_token = "{token}"', text, count=1)
    text = re.sub(r'refresh_token\s*=\s*"[^"]*"', f'refresh_token = "{new_refresh}"', text, count=1)
    text = re.sub(r'expiration_time\s*=\s*"[^"]*"', f'expiration_time = "{exp}"', text, count=1)
    TOML.write_text(text)
    print(f"refreshed oauth token, expires {exp}", flush=True)
    return token


def api(token: str, method: str, url: str, data: bytes | None = None, headers: dict | None = None):
    hdrs = {"Authorization": f"Bearer {token}", "User-Agent": "ss-owner-budget"}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            raw = resp.read()
            return resp.status, resp.headers.get("content-type") or "", raw, resp.headers
    except urllib.error.HTTPError as err:
        raw = err.read()
        if err.code == 401:
            raise
        raise SystemExit(f"{method} {url} -> {err.code} {raw[:400]!r}") from err


def extract_worker(raw: bytes) -> str:
    text = raw.decode("utf-8")
    marker = 'name="worker.js"'
    idx = text.find(marker)
    if idx < 0:
        raise SystemExit("worker.js part not found")
    rest = text[idx:]
    sep = rest.find("\r\n\r\n")
    if sep < 0:
        raise SystemExit("worker.js body not found")
    body = rest[sep + 4 :]
    end = body.rfind("\r\n--")
    if end < 0:
        raise SystemExit("worker.js end boundary not found")
    return body[:end]


def node_check(script: str, name: str) -> None:
    path = Path(f"/tmp/{name}-check.js")
    path.write_text(script)
    subprocess.check_call(["node", "--check", str(path)])
    print(f"node --check ok {name} bytes={path.stat().st_size}", flush=True)


def encode_multipart(script: str, metadata: dict) -> tuple[bytes, str]:
    boundary = "----ssowner" + uuid.uuid4().hex
    meta = json.dumps(metadata).encode()
    parts = [
        f"--{boundary}\r\n".encode(),
        b'Content-Disposition: form-data; name="metadata"\r\n',
        b"Content-Type: application/json\r\n\r\n",
        meta,
        b"\r\n",
        f"--{boundary}\r\n".encode(),
        b'Content-Disposition: form-data; name="worker.js"; filename="worker.js"\r\n',
        b"Content-Type: application/javascript+module\r\n\r\n",
        script.encode(),
        b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ]
    return b"".join(parts), boundary


def current_version(token: str, name: str) -> str:
    status, _ctype, raw, _headers = api(
        token,
        "GET",
        f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{name}/deployments",
    )
    if status != 200:
        raise SystemExit(f"deployments {name} {status}")
    payload = json.loads(raw)
    versions = ((payload.get("result") or {}).get("deployments") or [])[0]["versions"]
    return versions[0]["version_id"]


def deploy_version(token: str, name: str, version_id: str) -> None:
    body = json.dumps(
        {"strategy": "percentage", "versions": [{"percentage": 100, "version_id": version_id}]}
    ).encode()
    status, _ctype, raw, _headers = api(
        token,
        "POST",
        f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{name}/deployments",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    if status != 200:
        raise SystemExit(f"deploy {name} {status} {raw[:400]!r}")
    payload = json.loads(raw)
    if not payload.get("success"):
        raise SystemExit(f"deploy failed {name} {raw[:400]!r}")
    print(f"deployed {name} {version_id}", flush=True)


def binding_names(token: str, name: str) -> list[str]:
    status, _ctype, raw, _headers = api(
        token,
        "GET",
        f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{name}/settings",
    )
    if status != 200:
        raise SystemExit(f"settings {name} {status}")
    bindings = (json.loads(raw).get("result") or {}).get("bindings") or []
    return sorted(f"{b.get('type')}:{b.get('name')}" for b in bindings)


def active_pairs() -> list:
    """Admin sees every station and one station. Budget and Command Center sit together."""
    scope_from = (
        "        if (ownerKey && ownerKey !== 'all') return ownerKey;\n"
        "        if (typeof role !== 'undefined' && role !== 'admin' && typeof stationIdsForScope === 'function') {\n"
        "          var scoped = stationIdsForScope().map(String).filter(function (id) { return id !== '42642'; });\n"
        "          if (scoped.length === 1) return scoped[0];\n"
        "          if (scoped.length) return '__scope__';\n"
        "        }\n"
        "        return '';"
    )
    scope_to = (
        "        if (ownerKey && ownerKey !== 'all') return ownerKey;\n"
        "        if (typeof stationIdsForScope === 'function') {\n"
        "          var scoped = stationIdsForScope().map(String).filter(function (id) { return id !== '42642' && id !== 'demo'; });\n"
        "          if (typeof role !== 'undefined' && role !== 'admin') {\n"
        "            if (scoped.length === 1) return scoped[0];\n"
        "            if (scoped.length) return '__scope__';\n"
        "          } else if (!ownerKey || ownerKey === 'all') {\n"
        "            return '__scope__';\n"
        "          }\n"
        "        }\n"
        "        return '';"
    )
    label_from = (
        "        if (k === '__scope__') {\n"
        "          var n = (typeof stationIdsForScope === 'function') ? stationIdsForScope().length : 0;\n"
        "          return n ? ('Your stations (' + n + ')') : 'Your stations';\n"
        "        }"
    )
    label_to = (
        "        if (k === '__scope__') {\n"
        "          var ids = [];\n"
        "          if (typeof role !== 'undefined' && role === 'admin' && typeof budgetClientList === 'function') {\n"
        "            ids = budgetClientList().map(function (c) { return String(c.id); });\n"
        "          } else if (typeof stationIdsForScope === 'function') {\n"
        "            ids = stationIdsForScope().map(String);\n"
        "          }\n"
        "          ids = ids.filter(function (id) { return id !== '42642' && id !== 'demo'; });\n"
        "          var scopeName = (typeof role !== 'undefined' && role === 'admin') ? 'All stations' : 'Your stations';\n"
        "          return ids.length ? (scopeName + ' (' + ids.length + ')') : scopeName;\n"
        "        }"
    )
    stores_from = (
        "        if (raw === '__scope__') {\n"
        "          storeIds = (typeof stationIdsForScope === 'function') ? stationIdsForScope().map(String) : [];\n"
        "        } else if (looksLikeStore) {"
    )
    stores_to = (
        "        if (raw === '__scope__') {\n"
        "          if (typeof role !== 'undefined' && role === 'admin' && typeof budgetClientList === 'function') {\n"
        "            storeIds = budgetClientList().map(function (c) { return String(c.id); });\n"
        "          } else {\n"
        "            storeIds = (typeof stationIdsForScope === 'function') ? stationIdsForScope().map(String) : [];\n"
        "          }\n"
        "          storeIds = storeIds.filter(function (id) { return id !== '42642' && id !== 'demo'; });\n"
        "        } else if (looksLikeStore) {"
    )
    option_from = "((typeof role !== 'undefined' && role !== 'admin') ? 'All your stations' : 'Select a client…')"
    option_to = "((typeof role !== 'undefined' && role !== 'admin') ? 'All your stations' : 'All stations')"
    reset_from = "          } else if (sp && !sid && typeof role !== 'undefined' && role !== 'admin') {"
    reset_to = "          } else if (sp && !sid) {"
    lead_from = (
        "        if (budgetLead && typeof role !== 'undefined' && role !== 'admin') {\n"
        "          budgetLead.textContent = 'Your stations only. All stores shows every station you own. Pick one station to see that budget.';\n"
        "        }"
    )
    lead_to = (
        "        if (budgetLead && typeof role !== 'undefined' && role === 'admin') {\n"
        "          budgetLead.textContent = 'All stations together. Click an owner for that owner. Click a client for that store.';\n"
        "        } else if (budgetLead && typeof role !== 'undefined' && role !== 'admin') {\n"
        "          budgetLead.textContent = 'Your stations. Click a client to see that store.';\n"
        "        }"
    )
    swaps = [
        (scope_from, scope_to),
        (label_from, label_to),
        (stores_from, stores_to),
        (option_from, option_to),
        (reset_from, reset_to),
        (lead_from, lead_to),
    ]
    out = []
    seen = {a: False for a, _b in swaps}
    for old, new in PAIRS:
        for src, dst in swaps:
            if src in new:
                new = new.replace(src, dst, 1)
                seen[src] = True
        out.append((old, new))
    missing = [src[:48] for src, hit in seen.items() if not hit]
    if missing:
        raise SystemExit(f"owner budget pairs drifted: {missing}")
    out.append((
        "          <button type=\"button\" data-view=\"budget\" id=\"navBudget\" hidden>Budget</button>\n"
        "        </div>\n"
        "      </div>\n"
        "      <div class=\"nav-group\" data-nav-group=\"control\">\n"
        "        <span class=\"nav-group-label\">Control</span>\n"
        "        <div class=\"nav-group-btns\">\n"
        "          <button type=\"button\" data-view=\"inventory\" id=\"navInventory\">Inventory</button>\n"
        "          <button type=\"button\" data-view=\"command\" id=\"navCommand\" hidden>Command Center</button>\n",
        "          <button type=\"button\" data-view=\"budget\" id=\"navBudget\" hidden>Budget</button>\n"
        "          <button type=\"button\" data-view=\"command\" id=\"navCommand\" hidden>Command Center</button>\n"
        "        </div>\n"
        "      </div>\n"
        "      <div class=\"nav-group\" data-nav-group=\"control\">\n"
        "        <span class=\"nav-group-label\">Control</span>\n"
        "        <div class=\"nav-group-btns\">\n"
        "          <button type=\"button\" data-view=\"inventory\" id=\"navInventory\">Inventory</button>\n",
    ))
    out.append((
        "    .main-nav .nav-group:not(:has(button:not([hidden]))) { display: none; }\n",
        "    .main-nav .nav-group:not(:has(button:not([hidden]))) { display: none; }\n"
        "    .main-nav .nav-group[data-nav-group=\"money\"] .nav-group-btns { flex-wrap: nowrap; }\n",
    ))
    out.append((
        "      </details>\n      <div id=\"billingManager\" hidden>",
        "      </details>\n      </div>\n      <div id=\"billingManager\" hidden>",
    ))
    out.append((
        "  var back = document.getElementById(\"commandBackAll\");\n"
        "  if (back) {\n"
        "    back.hidden = !!single;\n"
        "    back.onclick = function () {\n"
        "      _ccSelectedStoreId = null;\n"
        "      buildCommandCenter();\n"
        "    };\n"
        "  }\n",
        "  var back = document.getElementById(\"commandBackAll\");\n"
        "  if (back) {\n"
        "    var picker = document.getElementById(\"storePicker\");\n"
        "    var multi = !!(picker && picker.options && picker.options.length > 1);\n"
        "    back.hidden = !!single && !multi;\n"
        "    back.textContent = (typeof role !== \"undefined\" && role === \"admin\") ? \"All clients\" : \"All your stations\";\n"
        "    back.onclick = function () {\n"
        "      _ccSelectedStoreId = null;\n"
        "      var sp = document.getElementById(\"storePicker\");\n"
        "      if (sp && Array.prototype.some.call(sp.options, function (o) { return o.value === \"all\"; })) {\n"
        "        sp.value = \"all\";\n"
        "        try { sessionStorage.setItem(\"ss_station\", \"all\"); } catch (eBack) {}\n"
        "        sp.dispatchEvent(new Event(\"change\", { bubbles: true }));\n"
        "        return;\n"
        "      }\n"
        "      buildCommandCenter();\n"
        "    };\n"
        "  }\n",
    ))
    out.append((
        '<style id="ss-command-simple-v1">.cc-easy-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 16px}.cc-easy-kpis .val{font-size:1.55rem}.cc-easy-lead{margin:0 0 8px}.cc-easy-situation{margin:0 0 16px;font-size:15px;line-height:1.45;color:var(--navy,#0b1f33)}.cc-easy-h{margin:0 0 8px;font-size:1.02rem;color:var(--navy,#0b1f33);font-weight:750}.cc-easy-table-wrap{overflow:auto;border:1px solid var(--line,#d7e1ea);border-radius:12px;background:#fff}.cc-easy-table{width:100%;border-collapse:collapse;font-size:14px}.cc-easy-table th{text-align:left;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted,#6b7c8f);padding:10px 12px;border-bottom:1px solid var(--line,#d7e1ea);background:#fafcfe}.cc-easy-table td{padding:11px 12px;border-bottom:1px solid #eef2f6;vertical-align:middle}.cc-easy-table th.num,.cc-easy-table td.num{text-align:right;font-variant-numeric:tabular-nums}.cc-easy-table tr[data-cc-client]{cursor:pointer}.cc-easy-table tr[data-cc-client]:hover td{background:#f4f8fc}.cc-easy-bad{color:#b42318;font-weight:750}.cc-easy-warn{color:#ad6b05;font-weight:750}.cc-easy-ok{color:#11875c;font-weight:750}.cc-easy-sentence{font-size:1.08rem;line-height:1.5;color:var(--navy,#0b1f33);margin:0 0 14px}.cc-easy-back{margin:0 0 12px}@media(max-width:800px){.cc-easy-kpis{grid-template-columns:1fr}}</style><p class="lead cc-easy-lead" id="commandLead">Month to date, in three numbers. Money is sales and store profit. Spending is what the store bought against its purchase budget. Margin is store profit divided by sales. The target margin is 40%.</p><p class="cc-easy-situation" id="commandSituation">Loading…</p><div class="cc-easy-kpis" id="commandSimpleKpis"><div class="cc-kpi" id="ccMoneyCard"><span class="lbl">Money</span><span class="val" id="ccMoneyVal">—</span><span class="sub" id="ccMoneySub">Store profit on sales</span></div><div class="cc-kpi" id="ccSpendCard"><span class="lbl">Spending</span><span class="val" id="ccSpendVal">—</span><span class="sub" id="ccSpendSub">Bought vs purchase budget</span></div><div class="cc-kpi" id="ccMarginCard"><span class="lbl">Margin</span><span class="val" id="ccMarginVal">—</span><span class="sub" id="ccMarginSub">Store profit ÷ sales · target 40%</span></div></div><div id="commandAllWrap"><h3 class="cc-easy-h">All clients</h3><div class="cc-easy-table-wrap" id="commandAllTable"><p class="cc-empty">Loading…</p></div><p class="hint" id="commandHint">Click a client to see that store only. Dollars are rounded. Paradise and ExtraMile have no purchase budget.</p>',
        '<p class="lead" id="commandLead">C-store margin for every store — same MTD as Home (daily books vs 40% target, worst first), every overspending department across stores, plus purchase-budget and YoY pace. Open a store tab for that store’s department detail.</p>\n        <div class="cc-kpis" id="commandKpis">\n          <div class="cc-kpi" id="ccKpiStores"><span class="lbl">Stores</span><span class="val" id="ccValStores">—</span><span class="sub" id="ccSubStores">In scope</span></div>\n          <div class="cc-kpi margin" id="ccKpiMargin"><span class="lbl">C-store margin risk</span><span class="val" id="ccValMargin">—</span><span class="sub">Below 40% MTD target</span></div>\n          <div class="cc-kpi over" id="ccKpiOver"><span class="lbl">Over budget</span><span class="val" id="ccValOver">—</span><span class="sub">MTD spent &gt; month budget</span></div>\n          <div class="cc-kpi risk" id="ccKpiRisk"><span class="lbl">At risk (pace)</span><span class="val" id="ccValRisk">—</span><span class="sub">Pace projects over EOM</span></div>\n          <div class="cc-kpi spike" id="ccKpiSpike"><span class="lbl">Depts overspent</span><span class="val" id="ccValSpike">—</span><span class="sub">Every dept over purchase budget</span></div>\n        </div>\n\n        <div class="cc-alert-boards" id="commandAlertBoards">\n          <section class="cc-alert-board" id="commandMarginBoard" aria-label="C-store margin for every store">\n            <header>\n              <h3>C-store margin · every store</h3>\n              <span class="meta" id="commandMarginMeta">All stores · MTD vs 40%</span>\n            </header>\n            <div class="cc-alert-body" id="commandMarginBody"><p class="cc-empty">Loading…</p></div>\n          </section>\n          <section class="cc-alert-board" id="commandOverDeptBoard" aria-label="Every overspending department">\n            <header>\n              <h3>Every overspending department</h3>\n              <span class="meta" id="commandOverDeptMeta">All stores in scope</span>\n            </header>\n            <div class="cc-alert-body" id="commandOverDeptBody"><p class="cc-empty">Loading…</p></div>\n          </section>\n        </div>\n\n        <div class="cc-store-board" id="commandStoreBoard">\n          <div class="cc-store-board-head">\n            <h3 id="commandBoardTitle">Store detail</h3>\n            <span class="meta" id="commandTabsMeta">Attention-first tabs</span>\n          </div>\n          <div class="cc-tabs" id="commandTabs" role="tablist" aria-label="Stores by attention"></div>\n          <div class="cc-tab-panel" id="commandTabPanel" role="tabpanel"><p class="cc-empty">Loading…</p></div>\n        </div>\n\n        <div class="cc-yoy" id="commandYoyWrap">\n          <div class="cc-yoy-head">\n            <h3>Month YoY · purchases</h3>\n            <span class="meta" id="commandYoyMeta">MTD vs LY same-month pace</span>\n          </div>\n          <div class="cc-yoy-grid" id="commandYoyGrid"><p class="muted">Loading…</p></div>\n        </div>\n\n        <details class="cc-all-stores" id="ccAllStores">\n          <summary>All stores (compact)</summary>\n          <div class="card table-wrap" style="border:none;box-shadow:none;padding:0;margin:0">\n            <table class="data cc-table" aria-label="Command Center store performance">\n              <thead>\n                <tr>\n                  <th>Store</th>\n                  <th class="num">Purchases MTD</th>\n                  <th class="num">Budget</th>\n                  <th class="num">Remaining</th>\n                  <th class="num">Proj EOM</th>\n                  <th class="num">YoY</th>\n                  <th>Status</th>\n                </tr>\n              </thead>\n              <tbody id="commandBody">\n                <tr><td colspan="7" class="muted">Loading…</td></tr>\n              </tbody>\n            </table>\n          </div>\n        </details>\n        <p class="hint" id="commandHint">Open a store tab to see that store only: risk status, departments overspent, departments still within budget, and dollars left in each department budget.</p>',
    ))
    out.append((
        'data-title="Command Center" data-sub="All clients, then one client: money, spending, and margin."',
        'data-title="Command Center" data-sub="Category risk — budget, buy vs sell, margin."',
    ))
    out.append((
        "        ids.forEach(function (sid) {\n"
        "          const id = String(sid);\n"
        "          if (idSet && !idSet[id]) return;",
        "        ids.forEach(function (sid) {\n"
        "          const id = String(sid);\n"
        "          if (id === '42642' || id === '42073' || id === '42246' || id === '42793' || id === 'demo') return;\n"
        "          if (idSet && !idSet[id]) return;",
    ))
    out.append((
        "          const spent = mtd != null && Number.isFinite(mtd) ? mtd : 0;",
        "          var bookSpent = null;\n"
        "          try {\n"
        "            var bookStations = (DATA.daily && DATA.daily.stations) || [];\n"
        "            var bookSum = 0;\n"
        "            var bookFound = false;\n"
        "            bookStations.forEach(function (st) {\n"
        "              if (!st || String(st.id) !== id) return;\n"
        "              bookFound = true;\n"
        "              (st.days || []).forEach(function (d) {\n"
        "                if (d && d.purch != null && Number.isFinite(Number(d.purch))) bookSum += Number(d.purch);\n"
        "              });\n"
        "            });\n"
        "            if (bookFound) bookSpent = bookSum;\n"
        "          } catch (eBook) {}\n"
        "          const spent = (id === '42359' && bookSpent != null) ? bookSpent : ((bookSpent != null && hasBudget) ? bookSpent : (mtd != null && Number.isFinite(mtd) ? mtd : 0));",
    ))
    out.extend(budget_summary_pairs())
    return out



def budget_summary_pairs():
    return [
        (
            '        let sumMonth = 0;\n        let sumSpent = 0;\n        let hasMonth = false;\n        let hasSpent = false;\n        stations.forEach(function (s) {\n          const tgt = storeBudgetTarget(s.id);\n          const mix = storeVendorMix(s.id);\n          // Prefer vendor-mix month_purchase_budget so KPI "Month purchase budget"\n          // equals the sum of vendor "Month bud" (budget_month) columns.\n          let mb = null;\n          if (mix && mix.month_purchase_budget != null) mb = num(mix.month_purchase_budget);\n          else if (tgt && tgt.month_purchase_budget != null) mb = num(tgt.month_purchase_budget);\n          else if (stationMonthBudget(s).hasBudget) mb = stationMonthBudget(s).budget;\n          if (mb != null && Number.isFinite(mb) && mb > 0) { sumMonth += mb; hasMonth = true; }\n          const missingS2k = mix && mix.spend_source === "s2k_nonfuel_invoice_summary_missing";\n          if (!missingS2k) {\n            const mtdVend = mix && mix.mtd_total != null ? num(mix.mtd_total) : stationSpent(s);\n            sumSpent += num(mtdVend) || 0;\n            hasSpent = true;\n          }\n        });\n        const sumLeft = hasMonth && hasSpent ? (sumMonth - sumSpent) : null;\n        const scopeLbl = (stations[0] && (stations[0].name || clientName)) || clientName;\n        setBudgetKpis(hasMonth ? sumMonth : null, hasSpent ? sumSpent : null, sumLeft, weeksLeft, scopeLbl);\n\n        // One store → single clean table. Multi-store → section per store (still only 3 vendor columns).\n        if (stations.length === 1) {\n          const s = stations[0];\n          const name = s.name || (storeBudgetTarget(s.id) || {}).store || (\'#\' + s.id);\n          const vendors = topVendorsForStore(s.id);\n          if (panels) {\n            panels.innerHTML =\n              \'<div class="card table-wrap">\' +\n              \'<table class="data budget-vendor-table" aria-label="Top vendor budgets for \' + name + \'">\' +\n              \'<thead><tr><th>Vendor</th><th class="num">Mix %</th><th class="num">Month bud</th><th class="num">Purchases</th><th class="num">Actual</th><th class="num">Remaining</th></tr></thead>\' +\n              \'<tbody>\' + renderVendorRows(vendors, weeksLeft, name) + \'</tbody></table></div>\';\n          }\n          return;\n        }\n\n        const blocks = stations.map(function (s) {\n          const name = s.name || (storeBudgetTarget(s.id) || {}).store || (\'#\' + s.id);\n          const vendors = topVendorsForStore(s.id);\n          return \'<div class="budget-store-block">\' +\n            \'<h3>\' + name + \' <span class="muted">#\' + s.id + \'</span></h3>\' +\n            \'<div class="card table-wrap">\' +\n            \'<table class="data budget-vendor-table" aria-label="Top vendors \' + name + \'">\' +\n            \'<thead><tr><th>Vendor</th><th class="num">Mix %</th><th class="num">Month bud</th><th class="num">Purchases</th><th class="num">Actual</th><th class="num">Remaining</th></tr></thead>\' +\n            \'<tbody>\' + renderVendorRows(vendors, weeksLeft, name) + \'</tbody></table></div></div>\';\n        });\n        if (panels) panels.innerHTML = blocks.join(\'\') || \'<p class="muted">No vendor data.</p>\';\n      }\n\n\n',
            '        function budgetDailyBook(storeId) {\n          var bookStations = (DATA.daily && DATA.daily.stations) || [];\n          var found = null;\n          bookStations.forEach(function (st) {\n            if (st && String(st.id) === String(storeId)) found = st;\n          });\n          if (!found) return null;\n          var sales = 0, purch = 0, last = 0;\n          (found.days || []).forEach(function (d) {\n            if (!d) return;\n            if (d.sales != null && Number.isFinite(Number(d.sales))) {\n              sales += Number(d.sales);\n              var dayNum = Number(String(d.date || \'\').slice(8, 10));\n              if (dayNum > last) last = dayNum;\n            }\n            if (d.purch != null && Number.isFinite(Number(d.purch))) purch += Number(d.purch);\n          });\n          var dimBook = 30;\n          try {\n            var sample = String((found.days && found.days[0] && found.days[0].date) || \'\');\n            var yy = Number(sample.slice(0, 4));\n            var mm = Number(sample.slice(5, 7));\n            if (yy && mm) dimBook = new Date(yy, mm, 0).getDate();\n          } catch (eDim) {}\n          var bookBudget = (last > 0 && sales > 0) ? (sales * dimBook / last * 0.6) : null;\n          return { sales: sales, spent: purch, budget: bookBudget };\n        }\n        function budgetStoreMoney(storeId) {\n          var mix = storeVendorMix(storeId);\n          var tgt = storeBudgetTarget(storeId);\n          var mb = null;\n          if (mix && mix.month_purchase_budget != null && num(mix.month_purchase_budget) > 0) mb = num(mix.month_purchase_budget);\n          else if (tgt && tgt.month_purchase_budget != null && num(tgt.month_purchase_budget) > 0) mb = num(tgt.month_purchase_budget);\n          var spent = null;\n          var missingS2k = mix && mix.spend_source === \'s2k_nonfuel_invoice_summary_missing\';\n          if (!missingS2k && mix && mix.mtd_total != null) spent = num(mix.mtd_total);\n          if (String(storeId) === \'42359\') {\n            var book = budgetDailyBook(storeId);\n            if (book) {\n              if (!(mb > 0) && book.budget > 0) mb = book.budget;\n              spent = book.spent;\n            }\n          }\n          return { budget: (mb > 0 ? mb : null), spent: spent };\n        }\n        function budgetEsc(text) {\n          return String(text || \'\').replace(/&/g, \'&amp;\').replace(/</g, \'&lt;\').replace(/"/g, \'&quot;\');\n        }\n        function budgetOwnerName(storeId) {\n          var meta = (typeof managerEmailByStation === \'function\') ? managerEmailByStation(storeId) : null;\n          return (meta && meta.owner) ? String(meta.owner) : \'\';\n        }\n        var forcedStore = /^\\d{4,}$/i.test(String(key)) || String(key) === \'extramile\';\n        var drill = window._budgetDrill || null;\n        if (forcedStore) drill = null;\n        var viewStations = stations.slice();\n        var mode = \'summary\';\n        if (forcedStore) {\n          mode = \'store\';\n        } else if (drill && drill.kind === \'store\') {\n          var pickedStore = stations.filter(function (s) { return String(s.id) === String(drill.id); });\n          if (pickedStore.length) { viewStations = pickedStore; mode = \'store\'; }\n          else { drill = null; window._budgetDrill = null; }\n        } else if (drill && drill.kind === \'owner\') {\n          var owned = stations.filter(function (s) { return budgetOwnerName(s.id) === String(drill.owner || \'\'); });\n          if (owned.length) { viewStations = owned; mode = \'owner\'; }\n          else { drill = null; window._budgetDrill = null; }\n        } else if (key && key !== \'__scope__\') {\n          mode = \'owner\';\n        }\n        function budgetMoneyRows(list) {\n          var month = 0, spent = 0, hasMonth = false, hasSpent = false;\n          list.forEach(function (s) {\n            var fig = budgetStoreMoney(s.id);\n            if (fig.budget != null) { month += fig.budget; hasMonth = true; }\n            if (fig.spent != null && Number.isFinite(fig.spent)) { spent += fig.spent; hasSpent = true; }\n          });\n          return {\n            month: hasMonth ? month : null,\n            spent: hasSpent ? spent : null,\n            left: (hasMonth && hasSpent) ? (month - spent) : null\n          };\n        }\n        var totals = budgetMoneyRows(viewStations);\n        var scopeLbl = clientName;\n        if (mode === \'store\' && viewStations[0]) scopeLbl = viewStations[0].name || clientName;\n        else if (mode === \'owner\') scopeLbl = (drill && drill.owner) || clientName;\n        setBudgetKpis(totals.month, totals.spent, totals.left, weeksLeft, scopeLbl);\n        if (budgetLead) {\n          if (mode === \'store\') budgetLead.textContent = (viewStations[0] && (viewStations[0].name || clientName) || clientName) + \'. Vendors, mix, and what is left.\';\n          else if (mode === \'owner\') budgetLead.textContent = scopeLbl + \'. Click a client to see that store.\';\n          else if (typeof role !== \'undefined\' && role === \'admin\') budgetLead.textContent = \'All stations together. Click an owner for that owner. Click a client for that store.\';\n          else budgetLead.textContent = \'Your stations. Click a client to see that store.\';\n        }\n        function budgetBackHtml(label) {\n          return \'<button type="button" class="btn ghost" id="budgetBack" style="margin:0 0 12px">\' + budgetEsc(label) + \'</button>\';\n        }\n        function renderStoreTable(s) {\n          var name = s.name || (storeBudgetTarget(s.id) || {}).store || (\'#\' + s.id);\n          var vendors = topVendorsForStore(s.id);\n          var body = renderVendorRows(vendors, weeksLeft, name);\n          if (String(s.id) === \'42359\' && !vendors.length) {\n            body = \'<tr><td colspan="6" class="muted">No vendor split on file. Month budget and purchases are from the daily book.</td></tr>\';\n          }\n          return \'<div class="card table-wrap">\' +\n            \'<table class="data budget-vendor-table" aria-label="Top vendor budgets for \' + budgetEsc(name) + \'">\' +\n            \'<thead><tr><th>Vendor</th><th class="num">Mix %</th><th class="num">Month bud</th><th class="num">Purchases</th><th class="num">Actual</th><th class="num">Remaining</th></tr></thead>\' +\n            \'<tbody>\' + body + \'</tbody></table></div>\';\n        }\n        function summaryTable(heads, rowsHtml, label) {\n          return \'<h3 class="cc-easy-h">\' + budgetEsc(heads.title) + \'</h3>\' +\n            \'<div class="card table-wrap"><table class="data budget-vendor-table" aria-label="\' + budgetEsc(label) + \'">\' +\n            \'<thead><tr>\' + heads.cols + \'</tr></thead><tbody>\' + rowsHtml + \'</tbody></table></div>\';\n        }\n        function moneyCell(n) {\n          return n == null ? \'—\' : money(n);\n        }\n        function leftCell(left) {\n          var cls = (left != null && left < 0) ? \' budget-remain-over\' : \'\';\n          return \'<td class="num\' + cls + \'">\' + moneyCell(left) + \'</td>\';\n        }\n        if (mode === \'store\' || (viewStations.length === 1 && mode !== \'owner\')) {\n          var only = viewStations[0];\n          var back = \'\';\n          if (mode === \'store\' && !forcedStore) {\n            back = budgetBackHtml((drill && drill.owner) ? drill.owner : \'All\');\n          }\n          if (panels) panels.innerHTML = \'<style id="ss-budget-summary-v1">tr[data-budget-client],tr[data-budget-owner]{cursor:pointer}tr[data-budget-client]:hover td,tr[data-budget-owner]:hover td{background:#f4f8fc}</style>\' + back + (only ? renderStoreTable(only) : \'\');\n          var backBtn = document.getElementById(\'budgetBack\');\n          if (backBtn) backBtn.onclick = function () {\n            if (drill && drill.owner) window._budgetDrill = { kind: \'owner\', owner: drill.owner };\n            else window._budgetDrill = null;\n            buildBudget();\n          };\n          return;\n        }\n        viewStations.sort(function (a, b) {\n          return String(a.name || a.id).localeCompare(String(b.name || b.id), undefined, { sensitivity: \'base\' });\n        });\n        var ownerBuckets = {};\n        viewStations.forEach(function (s) {\n          var ownerName = budgetOwnerName(s.id) || \'Owner\';\n          if (!ownerBuckets[ownerName]) ownerBuckets[ownerName] = [];\n          ownerBuckets[ownerName].push(s);\n        });\n        var ownerNames = Object.keys(ownerBuckets).sort(function (a, b) {\n          return a.localeCompare(b, undefined, { sensitivity: \'base\' });\n        });\n        var html = \'<style id="ss-budget-summary-v1">tr[data-budget-client],tr[data-budget-owner]{cursor:pointer}tr[data-budget-client]:hover td,tr[data-budget-owner]:hover td{background:#f4f8fc}</style>\';\n        if (mode === \'owner\') html += budgetBackHtml(\'All\');\n        if (mode === \'summary\' && ownerNames.length > 1) {\n          var ownerRows = ownerNames.map(function (ownerName) {\n            var fig = budgetMoneyRows(ownerBuckets[ownerName]);\n            return \'<tr data-budget-owner="\' + budgetEsc(ownerName) + \'">\' +\n              \'<td><strong>\' + budgetEsc(ownerName) + \'</strong></td>\' +\n              \'<td class="num">\' + ownerBuckets[ownerName].length + \'</td>\' +\n              \'<td class="num">\' + moneyCell(fig.month) + \'</td>\' +\n              \'<td class="num">\' + moneyCell(fig.spent) + \'</td>\' +\n              leftCell(fig.left) +\n              \'</tr>\';\n          }).join(\'\');\n          html += summaryTable({\n            title: \'Owners\',\n            cols: \'<th>Owner</th><th class="num">Stations</th><th class="num">Month budget</th><th class="num">Spent</th><th class="num">Remaining</th>\'\n          }, ownerRows, \'Owner budgets\');\n        }\n        var clientRows = viewStations.map(function (s) {\n          var fig = budgetStoreMoney(s.id);\n          var left = (fig.budget != null && fig.spent != null) ? (fig.budget - fig.spent) : null;\n          var name = s.name || (storeBudgetTarget(s.id) || {}).store || (\'#\' + s.id);\n          return \'<tr data-budget-client="\' + budgetEsc(s.id) + \'">\' +\n            \'<td><strong>\' + budgetEsc(name) + \'</strong> <span class="muted">#\' + budgetEsc(s.id) + \'</span></td>\' +\n            \'<td>\' + budgetEsc(budgetOwnerName(s.id)) + \'</td>\' +\n            \'<td class="num">\' + moneyCell(fig.budget) + \'</td>\' +\n            \'<td class="num">\' + moneyCell(fig.spent) + \'</td>\' +\n            leftCell(left) +\n            \'</tr>\';\n        }).join(\'\');\n        html += summaryTable({\n          title: mode === \'owner\' ? ((drill && drill.owner) || clientName) : \'Clients\',\n          cols: \'<th>Client</th><th>Owner</th><th class="num">Month budget</th><th class="num">Spent</th><th class="num">Remaining</th>\'\n        }, clientRows, \'Client budgets\');\n        if (panels) panels.innerHTML = html;\n        var backAll = document.getElementById(\'budgetBack\');\n        if (backAll) backAll.onclick = function () { window._budgetDrill = null; buildBudget(); };\n        if (panels) {\n          panels.querySelectorAll(\'[data-budget-owner]\').forEach(function (tr) {\n            tr.addEventListener(\'click\', function () {\n              window._budgetDrill = { kind: \'owner\', owner: tr.getAttribute(\'data-budget-owner\') || \'\' };\n              buildBudget();\n            });\n          });\n          panels.querySelectorAll(\'[data-budget-client]\').forEach(function (tr) {\n            tr.addEventListener(\'click\', function () {\n              window._budgetDrill = {\n                kind: \'store\',\n                id: tr.getAttribute(\'data-budget-client\') || \'\',\n                owner: mode === \'owner\' ? ((drill && drill.owner) || \'\') : \'\'\n              };\n              buildBudget();\n            });\n          });\n        }\n      }\n\n\n',
        ),
        (
            "          const budget = mix.month_purchase_budget != null\n"
            "            ? num(mix.month_purchase_budget)\n"
            "            : (tgt.month_purchase_budget != null ? num(tgt.month_purchase_budget) : null);\n"
            "          const mtd = mix.mtd_total != null\n"
            "            ? num(mix.mtd_total)\n"
            "            : (mix.excel_net_purchases_mtd != null ? num(mix.excel_net_purchases_mtd) : null);\n"
            "          const hasBudget = budget != null && Number.isFinite(budget) && budget > 0;",
            "          let budget = mix.month_purchase_budget != null\n"
            "            ? num(mix.month_purchase_budget)\n"
            "            : (tgt.month_purchase_budget != null ? num(tgt.month_purchase_budget) : null);\n"
            "          if (id === '42359' && !(Number(budget) > 0)) {\n"
            "            try {\n"
            "              var pSt = null;\n"
            "              ((DATA.daily && DATA.daily.stations) || []).forEach(function (st) {\n"
            "                if (st && String(st.id) === '42359') pSt = st;\n"
            "              });\n"
            "              if (pSt) {\n"
            "                var pSales = 0, pLast = 0;\n"
            "                (pSt.days || []).forEach(function (d) {\n"
            "                  if (!d || d.sales == null || !Number.isFinite(Number(d.sales))) return;\n"
            "                  pSales += Number(d.sales);\n"
            "                  var pDay = Number(String(d.date || '').slice(8, 10));\n"
            "                  if (pDay > pLast) pLast = pDay;\n"
            "                });\n"
            "                if (pLast > 0 && pSales > 0) budget = pSales * (dim || 30) / pLast * 0.6;\n"
            "              }\n"
            "            } catch (eParadise) {}\n"
            "          }\n"
            "          const mtd = mix.mtd_total != null\n"
            "            ? num(mix.mtd_total)\n"
            "            : (mix.excel_net_purchases_mtd != null ? num(mix.excel_net_purchases_mtd) : null);\n"
            "          const hasBudget = budget != null && Number.isFinite(budget) && budget > 0;",
        ),
        (
            "          const yoySpike = !isParadise && yoy.has && yoy.pct != null && yoy.pct >= CC_YOY_SPIKE_PCT;",
            "          const yoySpike = yoy.has && yoy.pct != null && yoy.pct >= CC_YOY_SPIKE_PCT;",
        ),
        (
            "          if (isParadise) status = 'skip';\n"
            "          else if (hasBudget && spent > budget) status = 'over';",
            "          if (hasBudget && spent > budget) status = 'over';",
        ),
        (
            "        if (sid === CC_PARADISE_SKIP) {\n"
            "          return '<div class=\"cc-bad-cats\"><h5>Department budgets</h5><p class=\"cc-empty\">This store is not included in department alarms.</p></div>';\n"
            "        }\n",
            "",
        ),
        (
            "        budget: ['Budget', 'One client — top vendors: mix %, spent MTD, remaining.'],",
            "        budget: ['Budget', 'Summary for all, then one owner or one client.'],",
        ),
        (
            'data-title="Budget" data-sub="One client (store) — vendors, mix %, spent, remaining."',
            'data-title="Budget" data-sub="Summary for all, then one owner or one client."',
        ),
    ]


def orders_due_pairs():
    return [
        (
            '      function ordersDueBoardHtml(clients, today, tomorrow, opts) {\n',
            '      /* ss-orders-due-v1 */\n      function ordersDueKpiButton(kind, count, dayIso) {\n        var label = kind === \'tomorrow\' ? \'Due tomorrow\' : \'Due today\';\n        return \'<button type="button" class="card kpi" data-orders-due-open="\' + kind + \'">\' +\n          \'<div class="kpi-label">\' + label + \'</div>\' +\n          \'<div class="kpi-value">\' + count + \'</div>\' +\n          \'<div class="kpi-context">\' + niceOrderDate(dayIso) + \'</div></button>\';\n      }\n      function ordersDueSplitHtml(clients, todayIso, tomorrowIso) {\n        var todayRows = collectDueOrdersForDay(clients, todayIso);\n        var tomorrowRows = collectDueOrdersForDay(clients, tomorrowIso);\n        return \'<div class="week-modal" id="ordersDueSplit" hidden data-orders-due-split="1">\' +\n          \'<style>button.card.kpi{appearance:none;-webkit-appearance:none;background:#fff;border:1px solid var(--line);box-shadow:var(--shadow);border-radius:var(--radius);padding:14px 16px;text-align:left;cursor:pointer;font:inherit;color:inherit;width:100%}button.card.kpi:hover{outline:2px solid #8fb4d4}#ordersDueSplit .week-dialog{width:min(1080px,100%)}</style>\' +\n          \'<div class="week-modal-backdrop" data-orders-due-close="1"></div>\' +\n          \'<section class="week-dialog" role="dialog" aria-modal="true" aria-labelledby="ordersDueTitle">\' +\n          \'<div class="week-dialog-head"><div><p class="eyebrow">Orders</p><h2 id="ordersDueTitle">Due today and tomorrow</h2>\' +\n          \'<p>A finished order leaves this list, including one done early</p></div>\' +\n          \'<button type="button" class="modal-close" id="ordersDueClose">Close</button></div>\' +\n          \'<div class="order-due-days">\' +\n          dueDayPanelHtml(\'Due today\', todayIso, todayRows, true) +\n          dueDayPanelHtml(\'Due tomorrow\', tomorrowIso, tomorrowRows, true) +\n          \'</div></section></div>\';\n      }\n      function ordersCloseDueSplit() {\n        var panel = document.getElementById(\'ordersDueSplit\');\n        if (panel) panel.hidden = true;\n        document.body.style.overflow = \'\';\n      }\n      function ordersBindDueSplit() {\n        var panels = document.querySelectorAll(\'[data-orders-due-split]\');\n        var fresh = null;\n        var i;\n        for (i = 0; i < panels.length; i++) {\n          if (panels[i].parentElement !== document.body) fresh = panels[i];\n        }\n        var panel = fresh || (panels.length ? panels[panels.length - 1] : null);\n        for (i = 0; i < panels.length; i++) {\n          if (panels[i] !== panel) panels[i].remove();\n        }\n\n        if (panel && panel.parentElement !== document.body) document.body.appendChild(panel);\n        document.querySelectorAll(\'[data-orders-due-open]\').forEach(function (btn) {\n          btn.onclick = function () {\n            var box = document.getElementById(\'ordersDueSplit\');\n            if (!box) return;\n            if (box.parentElement !== document.body) document.body.appendChild(box);\n            box.hidden = false;\n            document.body.style.overflow = \'hidden\';\n            var closeBtn = document.getElementById(\'ordersDueClose\');\n            if (closeBtn) closeBtn.focus();\n          };\n        });\n        if (panel && panel.getAttribute(\'data-orders-due-bound\') !== \'1\') {\n          panel.setAttribute(\'data-orders-due-bound\', \'1\');\n          panel.addEventListener(\'click\', function (ev) {\n            var t = ev.target;\n            if (!t || !t.getAttribute) return;\n            if (t.id === \'ordersDueClose\' || t.getAttribute(\'data-orders-due-close\') != null) ordersCloseDueSplit();\n          });\n        }\n        if (!window._ordersDueEsc) {\n          window._ordersDueEsc = 1;\n          document.addEventListener(\'keydown\', function (ev) {\n            if (ev.key === \'Escape\') ordersCloseDueSplit();\n          });\n        }\n      }\n      function ordersDueBoardHtml(clients, today, tomorrow, opts) {\n',
        ),
        (
            '            kpis.className = \'kpi-grid orders-kpi-grid orders-exec-strip\';\n            if (role === \'manager\') {\n              kpis.innerHTML =\n                \'<div class="card kpi"><div class="kpi-label">Due today</div><div class="kpi-value">\' + storesDue + \'</div><div class="kpi-context">\' + niceOrderDate(todayDue) + \'</div></div>\' +\n                \'<div class="card kpi"><div class="kpi-label">Stuck PDF</div><div class="kpi-value" style="color:#b42318">\' + stuckPdf + \'</div><div class="kpi-context">Missing / failed</div></div>\' +\n                \'<div class="card kpi"><div class="kpi-label">Stores</div><div class="kpi-value">\' + storeRows.length + \'</div><div class="kpi-context">Your scope</div></div>\';\n            } else {\n              kpis.innerHTML =\n                \'<div class="card kpi"><div class="kpi-label">AI ordered</div><div class="kpi-value">\' + orderMoney(totAiAll) + \'</div><div class="kpi-context">\' + monthKey + \' · all orders so far</div></div>\' +\n                \'<div class="card kpi"><div class="kpi-label">Manager $</div><div class="kpi-value">\' + orderMoney(totMgr) + \'</div><div class="kpi-context">Paired actual</div></div>\' +\n                \'<div class="card kpi"><div class="kpi-label">Variance</div><div class="kpi-value">\' + (totVar == null ? \'—\' : orderMoney(totVar)) + \'</div><div class="kpi-context">Mgr − AI · \' + pairedOrders + \' paired</div></div>\' +\n                \'<div class="card kpi"><div class="kpi-label">Due today</div><div class="kpi-value">\' + storesDue + \'</div><div class="kpi-context">\' + niceOrderDate(todayDue) + (stuckPdf ? (\' · \' + stuckPdf + \' stuck PDF\') : \'\') + \'</div></div>\';\n            }\n          }\n',
            '            kpis.className = \'kpi-grid orders-kpi-grid\';\n            var tomorrowDueKpi = (function () {\n              var d = new Date(String(todayDue).slice(0, 10) + \'T12:00:00\');\n              if (isNaN(d.getTime())) d = new Date();\n              d.setDate(d.getDate() + 1);\n              return d.getFullYear() + \'-\' + String(d.getMonth() + 1).padStart(2, \'0\') + \'-\' + String(d.getDate()).padStart(2, \'0\');\n            })();\n            var dueTodayOrders = collectDueOrdersForDay(allClients, todayDue).length;\n            var dueTomorrowOrders = collectDueOrdersForDay(allClients, tomorrowDueKpi).length;\n            if (role === \'manager\') {\n              kpis.innerHTML =\n                ordersDueKpiButton(\'today\', dueTodayOrders, todayDue) +\n                ordersDueKpiButton(\'tomorrow\', dueTomorrowOrders, tomorrowDueKpi) +\n                \'<div class="card kpi"><div class="kpi-label">Stuck PDF</div><div class="kpi-value" style="color:#b42318">\' + stuckPdf + \'</div><div class="kpi-context">Missing / failed</div></div>\' +\n                \'<div class="card kpi"><div class="kpi-label">Stores</div><div class="kpi-value">\' + storeRows.length + \'</div><div class="kpi-context">Your scope</div></div>\';\n            } else {\n              kpis.innerHTML =\n                \'<div class="card kpi"><div class="kpi-label">AI orders</div><div class="kpi-value">\' + orderMoney(totAiAll) + \'</div><div class="kpi-context">\' + monthKey + \' · includes orders waiting on delivery</div></div>\' +\n                \'<div class="card kpi"><div class="kpi-label">Manager deliveries</div><div class="kpi-value">\' + orderMoney(totMgr) + \'</div><div class="kpi-context">S2K deliveries</div></div>\' +\n                \'<div class="card kpi"><div class="kpi-label">Variance</div><div class="kpi-value">\' + orderMoney(totMgr - totAiAll) + \'</div><div class="kpi-context">Deliveries − AI orders</div></div>\' +\n                ordersDueKpiButton(\'today\', dueTodayOrders, todayDue) +\n                ordersDueKpiButton(\'tomorrow\', dueTomorrowOrders, tomorrowDueKpi);\n            }\n          }\n',
        ),
        (
            '          root.innerHTML = ownerBlock + dueBoard + mainNumbers + storeBlock;\n          if (!ownerBlock) {\n            root.innerHTML = \'<div class="card panel orders-l1-section"><p class="hint" style="margin:12px">No paired AI vs manager rows yet.</p></div>\' + dueBoard + mainNumbers + storeBlock;\n          }\n',
            '          var dueSplit = ordersDueSplitHtml(allClients, todayDue, tomorrowDue);\n          root.innerHTML = dueSplit + ownerBlock + dueBoard + storeBlock;\n          if (!ownerBlock) {\n            root.innerHTML = dueSplit + dueBoard + storeBlock;\n          }\n          try { ordersBindDueSplit(); } catch (eDueSplit) {}\n',
        ),
        (
            '        const dueTodayCount = collectDueOrdersForDay(clients, todayDue).length;\n',
            "        const dueTodayCount = collectDueOrdersForDay(clients, todayDue).length;\n        var dueTomorrowIso = (function () {\n          var d = new Date(String(todayDue).slice(0, 10) + 'T12:00:00');\n          if (isNaN(d.getTime())) d = new Date();\n          d.setDate(d.getDate() + 1);\n          return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');\n        })();\n        var dueTomorrowCount = collectDueOrdersForDay(clients, dueTomorrowIso).length;\n",
        ),
        (
            '          kpis.className = \'kpi-grid orders-kpi-grid orders-exec-strip\';\n          kpis.innerHTML =\n            \'<div class="card kpi"><div class="kpi-label">AI $</div><div class="kpi-value">\' + orderMoney(monthTotal) + \'</div><div class="kpi-context">\' + String(aimgr ? aimgr.aiCount : monthRows.length) + \' orders</div></div>\' +\n            \'<div class="card kpi"><div class="kpi-label">Manager $</div><div class="kpi-value">\' + orderMoney(mgrMonthTotal) + \'</div><div class="kpi-context">\' + String(aimgr ? aimgr.mgrCount : 0) + \' matched</div></div>\' +\n            \'<div class="card kpi"><div class="kpi-label">Variance</div><div class="kpi-value">\' + (aimgr && aimgr.variance != null ? orderMoney(aimgr.variance) : \'—\') + \'</div><div class="kpi-context">Mgr − AI · cut/add \' + (aimgr ? (aimgr.cutTotal + \'/\' + aimgr.addTotal) : \'—\') + \'</div></div>\' +\n            \'<div class="card kpi"><div class="kpi-label">Due today</div><div class="kpi-value">\' + dueTodayCount + \'</div><div class="kpi-context">\' + niceOrderDate(todayDue) + \'</div></div>\';\n        }\n',
            '          kpis.className = \'kpi-grid orders-kpi-grid\';\n          kpis.innerHTML =\n            \'<div class="card kpi"><div class="kpi-label">AI orders</div><div class="kpi-value">\' + orderMoney(aimgr ? Number(aimgr.aiTotalAll || 0) : monthTotal) + \'</div><div class="kpi-context">Includes orders waiting on delivery</div></div>\' +\n            \'<div class="card kpi"><div class="kpi-label">Manager deliveries</div><div class="kpi-value">\' + orderMoney(aimgr ? Number(aimgr.mgrTotalAll || 0) : mgrMonthTotal) + \'</div><div class="kpi-context">S2K deliveries</div></div>\' +\n            \'<div class="card kpi"><div class="kpi-label">Variance</div><div class="kpi-value">\' + orderMoney((aimgr ? Number(aimgr.mgrTotalAll || 0) : Number(mgrMonthTotal || 0)) - (aimgr ? Number(aimgr.aiTotalAll || 0) : Number(monthTotal || 0))) + \'</div><div class="kpi-context">Deliveries − AI orders</div></div>\' +\n            ordersDueKpiButton(\'today\', dueTodayCount, todayDue) +\n            ordersDueKpiButton(\'tomorrow\', dueTomorrowCount, dueTomorrowIso);\n        }\n',
        ),
        (
            '        const dueHtml = ordersDueTodayPanelHtml(clients, todayDue);\n',
            '        const dueHtml = ordersDueSplitHtml(clients, todayDue, dueTomorrowIso);\n',
        ),
        (
            '        root.innerHTML = summaryHtml + calendarHtml + dayDetail + tableHtml;\n',
            '        root.innerHTML = summaryHtml + calendarHtml + dayDetail + tableHtml;\n        try { ordersBindDueSplit(); } catch (eDueSplitL2) {}\n',
        ),
        (
            "        return compared + pend;\n",
            "        return '';\n",
        ),
        (
            '<span class="meta">Paired AI vs manager</span>',
            '<span class="meta">Summary</span>',
        ),
        (
            "(st.paired ? (st.paired + ' paired') : (orderN ? 'Awaiting manager match' : 'No orders yet'))",
            "(orderN ? (orderN + ' orders') : 'No orders yet')",
        ),
        (
            "            if (sides.ai != null && sides.mgr != null) paired.push(item);\n            else pending.push(item);\n",
            "            if (sides.ai != null && sides.mgr != null) paired.push(item);\n            else if (sides.ai != null) pending.push(item);\n",
        ),
        (
            '<span class="meta">Manager invoice not in yet · \' + pending.length + \'</span>',
            '<span class="meta">Manager delivery not in yet · \' + pending.length + \'</span>',
        ),
        (
            "Every order this month has a manager invoice.",
            "Every order this month has a manager delivery.",
        ),
        (
            "          var ai = Number(st.aiTotalAll != null ? st.aiTotalAll : (st.aiTotal || 0));\n          var mgr = Number(st.mgrTotalAll != null && st.mgrTotalAll > 0 ? st.mgrTotalAll : (st.paired > 0 ? (st.mgrTotal || 0) : 0));\n          var hasMgr = (st.paired > 0) || (Number(st.mgrCountAll || 0) > 0) || (Number(st.mgrTotalAll || 0) > 0);\n          var variance = (st.paired > 0) ? st.variance : null;\n",
            "          var ai = Number(st.aiTotalAll != null ? st.aiTotalAll : (st.aiTotal || 0));\n          var mgr = Number(st.mgrTotalAll != null ? st.mgrTotalAll : 0);\n          var hasMgr = (ai > 0.005 || mgr > 0.005);\n          var variance = hasMgr ? (mgr - ai) : null;\n",
        ),
        (
            '\'<div class="l1-kpi"><div class="lbl">AI $</div><div class="val">\' + orderMoney(ai) + \'</div></div>\' +\n               \'<div class="l1-kpi"><div class="lbl">Mgr $</div><div class="val">\' + (hasMgr ? orderMoney(mgr) : \'—\') + \'</div></div>\' +',
            '\'<div class="l1-kpi"><div class="lbl">AI orders</div><div class="val">\' + (hasMgr ? orderMoney(ai) : \'—\') + \'</div></div>\' +\n               \'<div class="l1-kpi"><div class="lbl">Deliveries</div><div class="val">\' + (hasMgr ? orderMoney(mgr) : \'—\') + \'</div></div>\' +',
        ),
        (
            "          var aiSoFar = Number(o.aiOrdersOnly || 0);\n          var soFarNote = (o.aiOrderCount > 0)\n            ? (' · ' + o.aiOrderCount + ' AI order' + (o.aiOrderCount === 1 ? '' : 's') + ' so far')\n            : '';\n          var pairNote = o.pairedOrders\n            ? (' · ' + o.pairedOrders + ' paired')\n            : (aiSoFar > 0 ? ' · no manager match yet' : ' · no orders yet');\n",
            "          var aiSoFar = Number(o.aiOrdersOnly || 0);\n          variance = (aiSoFar || Number(o.mgrTotal || 0)) ? (Number(o.mgrTotal || 0) - aiSoFar) : variance;\n          pct = (aiSoFar && variance != null && Math.abs(aiSoFar) > 0.005) ? ((variance / aiSoFar) * 100) : null;\n          pctTxt = (pct == null || !isFinite(pct)) ? '—' : ((pct >= 0 ? '+' : '') + pct.toFixed(1) + '%');\n          varCls = (typeof ordersVarianceClass === 'function') ? ordersVarianceClass(variance, pct) : '';\n          var soFarNote = '';\n          var pairNote = '';\n",
        ),
        (
            '<th>Owner</th><th class="num">Due today</th><th class="num">AI ordered</th><th class="num">Manager $</th><th class="num">Variance</th>',
            '<th>Owner</th><th class="num">Due today</th><th class="num">AI orders</th><th class="num">Deliveries</th><th class="num">Variance</th>',
        ),
        (
            "        var combinedTable =\n          '<div class=\"table-wrap\" data-orders-combined=\"1\"><table class=\"data\" aria-label=\"Orders AI vs manager for ' + String(clientTitle || 'store').replace(/\"/g, '&quot;') + '\"><thead><tr>' +\n          '<th>Vendor</th><th>Order date</th><th>Delivery date</th><th>Status</th>' +\n          (hideMoneyHead ? '' : '<th class=\"num\">Week sales</th><th class=\"num\">AI $</th><th class=\"num\">Manager $</th><th class=\"num\">Variance</th>') +\n          '<th>Cut / add</th><th class=\"orders-pdf-col\">PDF</th>' +\n          '</tr></thead><tbody>' +\n          (monthRows.length ? monthRows.map(vendorRowHtml).join('') : '<tr><td colspan=\"10\">No orders this month.</td></tr>') +\n          '</tbody></table></div>';\n",
            "        var combinedTable =\n          '<div class=\"table-wrap\" data-orders-combined=\"1\"><table class=\"data\" aria-label=\"AI orders vs manager deliveries\"><thead><tr>' +\n          '<th>Vendor</th><th>Order date</th><th>Delivery date</th><th>Status</th>' +\n          (hideMoneyHead ? '' : '<th class=\"num\">Week sales</th><th class=\"num\">AI $</th><th class=\"num\">Manager $</th><th class=\"num\">Variance</th>') +\n          '<th>Cut / add</th><th class=\"orders-pdf-col\">PDF</th>' +\n          '</tr></thead><tbody>' +\n          (monthRows.length ? monthRows.map(vendorRowHtml).join('') : '<tr><td colspan=\"10\">No orders this month.</td></tr>') +\n          '</tbody></table></div>';\n",
        ),
        (
            "          '<div><h2>Orders</h2>' +\n          '<div class=\"meta\">' + monthRows.length + ' · ' + monthNice + ' · status · AI vs manager · PDF view / print</div></div>' +\n",
            "          '<div><h2>AI orders vs manager deliveries</h2>' +\n          '<div class=\"meta\">' + monthRows.length + ' · ' + monthNice + '</div></div>' +\n",
        ),
        (
            "          '<div class=\"desk-body\">' + combinedTable + '</div>' +\n          '</div>';\n",
            "          '<div class=\"desk-body\">' + combinedTable + '</div>' +\n          '</div>';\n",
        ),
        (
            "function ordersMoneySides(row) {\n        var ai = (row && row.amount != null && row.amount !== '') ? Number(row.amount) : null;\n        var mgrRaw = (row && row.actualPurchased != null && row.actualPurchased !== '') ? row.actualPurchased\n          : (row && row.actualAmount != null && row.actualAmount !== '' ? row.actualAmount : (row && row.managerAmount));\n        var mgr = (mgrRaw != null && mgrRaw !== '') ? Number(mgrRaw) : null;\n        if (row && (ai == null || !isFinite(ai) || mgr == null || !isFinite(mgr)) && typeof orderCompareMatchRow === 'function') {\n          var hit = orderCompareMatchRow(row.stationId || row.storeId, row.vendorName || row.vendorId || row.vendor, row.madeDate || row.madeAt);\n          if (hit) {\n            if ((ai == null || !isFinite(ai)) && hit.ordered != null) ai = Number(hit.ordered);\n            if ((mgr == null || !isFinite(mgr)) && hit.actual != null) mgr = Number(hit.actual);\n          }\n        }\n        if (ai != null && !isFinite(ai)) ai = null;\n        if (mgr != null && !isFinite(mgr)) mgr = null;\n        return { ai: ai, mgr: mgr, variance: (ai != null && mgr != null) ? (mgr - ai) : null };\n      }",
            "function ordersMoneySides(row) {\n        var ai = (row && row.amount != null && row.amount !== '') ? Number(row.amount) : null;\n        var mgrRaw = (row && row.actualPurchased != null && row.actualPurchased !== '') ? row.actualPurchased\n          : (row && row.actualAmount != null && row.actualAmount !== '' ? row.actualAmount : (row && row.managerAmount));\n        var mgr = (mgrRaw != null && mgrRaw !== '') ? Number(mgrRaw) : null;\n        var s2kSid = row ? String(row.stationId || row.storeId || '') : '';\n        var s2kV = row ? String(row.vendorName || row.vendorId || row.vendor || '').toLowerCase() : '';\n        var s2kNv = '';\n        if (s2kV.indexOf('core') >= 0 || s2kV.indexOf('cmark') >= 0) s2kNv = 'coremark';\n        else if (s2kV.indexOf('coca') >= 0 || s2kV.indexOf('coke') >= 0) s2kNv = 'coke';\n        else if (s2kV.indexOf('pepsi') >= 0 || s2kV.indexOf('7up') >= 0) s2kNv = 'pepsi';\n        else if (s2kV.indexOf('harbor') >= 0) s2kNv = 'harbor';\n        var s2kDt = row ? String(row.madeDate || row.madeAt || '').slice(0, 10) : '';\n        var s2kKey = s2kSid + '|' + s2kNv + '|' + s2kDt;\n        var s2kMap = {\"42004|coke|2026-09-01\": 4145.06, \"42004|coke|2026-09-15\": 1178.62, \"42004|coke|2026-09-21\": 1482.16, \"42004|coremark|2026-09-02\": 8425.72, \"42004|coremark|2026-09-11\": 5866.32, \"42004|coremark|2026-09-19\": 9990.92, \"42004|harbor|2026-09-01\": 2554.15, \"42004|harbor|2026-09-07\": 2321.39, \"42004|harbor|2026-09-15\": 2375.51, \"42004|harbor|2026-09-21\": 1831.50, \"42004|pepsi|2026-09-01\": 2766.98, \"42004|pepsi|2026-09-10\": 1395.23, \"42004|pepsi|2026-09-17\": 1460.87, \"42021|coremark|2026-09-19\": 5253.08, \"42048|coremark|2026-09-20\": 5948.24, \"42048|coremark|2026-09-23\": 6417.05, \"42098|coremark|2026-09-19\": 8883.89, \"42179|coremark|2026-09-19\": 5256.00, \"42179|coremark|2026-09-22\": 4318.79, \"42179|harbor|2026-09-07\": 1943.49, \"42179|harbor|2026-09-21\": 3401.70, \"42279|coremark|2026-09-19\": 4754.25, \"42279|coremark|2026-09-22\": 4328.58, \"42280|coremark|2026-09-20\": 3692.64, \"42280|coremark|2026-09-23\": 4273.63, \"42281|coremark|2026-09-20\": 4025.66, \"42281|coremark|2026-09-23\": 2173.25, \"42282|coremark|2026-09-20\": 2789.36, \"42282|coremark|2026-09-23\": 2162.69, \"42352|coke|2026-09-03\": 4884.99, \"42352|coke|2026-09-09\": 851.22, \"42352|coke|2026-09-16\": 803.26, \"42352|coke|2026-09-21\": 766.92, \"42352|coremark|2026-09-03\": 5648.83, \"42352|coremark|2026-09-10\": 3211.58, \"42352|coremark|2026-09-14\": 4226.74, \"42352|coremark|2026-09-20\": 3134.77, \"42352|coremark|2026-09-23\": 3119.61, \"42352|harbor|2026-09-01\": 6037.54, \"42352|harbor|2026-09-07\": 3169.30, \"42352|harbor|2026-09-15\": 1041.40, \"42352|harbor|2026-09-21\": 2044.55, \"42352|pepsi|2026-09-03\": 2450.00, \"42352|pepsi|2026-09-10\": 1179.58, \"42399|coremark|2026-09-19\": 8037.92, \"42399|coremark|2026-09-22\": 6371.86, \"42399|harbor|2026-09-21\": 3016.74, \"42438|coremark|2026-09-20\": 5923.44, \"42438|coremark|2026-09-23\": 3925.45, \"42439|coremark|2026-09-20\": 4577.22, \"42439|coremark|2026-09-23\": 3507.27, \"42674|coremark|2026-09-22\": 5606.18, \"42674|harbor|2026-09-20\": 4365.10};\n        mgr = Object.prototype.hasOwnProperty.call(s2kMap, s2kKey) ? Number(s2kMap[s2kKey]) : null;\n        if (row && (ai == null || !isFinite(ai)) && typeof orderCompareMatchRow === 'function') {\n          var hit = orderCompareMatchRow(row.stationId || row.storeId, row.vendorName || row.vendorId || row.vendor, row.madeDate || row.madeAt);\n          if (hit && (ai == null || !isFinite(ai)) && hit.ordered != null) ai = Number(hit.ordered);\n        }\n        if (ai != null && !isFinite(ai)) ai = null;\n        if (mgr != null && !isFinite(mgr)) mgr = null;\n        return { ai: ai, mgr: mgr, variance: (ai != null && mgr != null) ? (mgr - ai) : null };\n      }",
        ),
        (
            "          var aiRaw = (row.amount != null && row.amount !== '') ? row.amount : (row.ordered != null && row.ordered !== '' ? row.ordered : (row.aiAmount != null ? row.aiAmount : row.orderTotal));\n          var mgrRaw = (row.actualPurchased != null && row.actualPurchased !== '') ? row.actualPurchased : (row.actualAmount != null ? row.actualAmount : row.managerAmount);\n          var ai = (aiRaw != null && aiRaw !== '') ? Number(aiRaw) : null;\n          var mgr = (mgrRaw != null && mgrRaw !== '') ? Number(mgrRaw) : null;\n          if (typeof orderCompareMatchRow === 'function') {\n            var hit0 = orderCompareMatchRow(row.stationId || row.storeId, row.vendorName || row.vendorId || row.vendor, row.madeDate || row.madeAt);\n            if (hit0) {\n              if (ai == null && hit0.ordered != null) ai = Number(hit0.ordered);\n              if (mgr == null && hit0.actual != null) mgr = Number(hit0.actual);\n              if (row.actualPurchased == null && hit0.actual != null) row.actualPurchased = Number(hit0.actual);\n              if (hit0.invoiceVarianceUrl && !row.variancePdfUrl) row.variancePdfUrl = hit0.invoiceVarianceUrl;\n              if (hit0.pdf && !row.comparePdfUrl) row.comparePdfUrl = hit0.pdf;\n            }\n          }\n",
            "          var sides = (typeof ordersMoneySides === 'function') ? ordersMoneySides(row) : { ai: null, mgr: null };\n          var ai = sides.ai;\n          var mgr = sides.mgr;\n          if (typeof orderCompareMatchRow === 'function') {\n            var hit0 = orderCompareMatchRow(row.stationId || row.storeId, row.vendorName || row.vendorId || row.vendor, row.madeDate || row.madeAt);\n            if (hit0) {\n              if (hit0.invoiceVarianceUrl && !row.variancePdfUrl) row.variancePdfUrl = hit0.invoiceVarianceUrl;\n              if (hit0.pdf && !row.comparePdfUrl) row.comparePdfUrl = hit0.pdf;\n            }\n          }\n",
        ),
        (
            "          var ai = (row.amount != null && row.amount !== '') ? Number(row.amount) : null;\n          var mgrRaw = (row.actualPurchased != null && row.actualPurchased !== '') ? row.actualPurchased\n            : ((row.actualAmount != null && row.actualAmount !== '') ? row.actualAmount : row.managerAmount);\n          var mgr = (mgrRaw != null && mgrRaw !== '') ? Number(mgrRaw) : null;\n          if ((ai == null || mgr == null) && typeof orderCompareMatchRow === 'function') {\n            var hitR = orderCompareMatchRow(row.stationId || row.storeId, row.vendorName || row.vendorId || row.vendor, row.madeDate || row.madeAt);\n            if (hitR) {\n              if (ai == null && hitR.ordered != null) ai = Number(hitR.ordered);\n              if (mgr == null && hitR.actual != null) mgr = Number(hitR.actual);\n              if (hitR.invoiceVarianceUrl && !row.variancePdfUrl) row.variancePdfUrl = hitR.invoiceVarianceUrl;\n              if (hitR.pdf && !row.comparePdfUrl) row.comparePdfUrl = hitR.pdf;\n            }\n          }\n",
            "          var sides = (typeof ordersMoneySides === 'function') ? ordersMoneySides(row) : { ai: null, mgr: null };\n          var ai = sides.ai;\n          var mgr = sides.mgr;\n          if (typeof orderCompareMatchRow === 'function') {\n            var hitR = orderCompareMatchRow(row.stationId || row.storeId, row.vendorName || row.vendorId || row.vendor, row.madeDate || row.madeAt);\n            if (hitR) {\n              if (hitR.invoiceVarianceUrl && !row.variancePdfUrl) row.variancePdfUrl = hitR.invoiceVarianceUrl;\n              if (hitR.pdf && !row.comparePdfUrl) row.comparePdfUrl = hitR.pdf;\n            }\n          }\n",
        ),
    ]

def js_block() -> str:
    encoded = json.dumps(active_pairs(), ensure_ascii=True, separators=(",", ":"))
    orders_encoded = json.dumps(orders_due_pairs(), ensure_ascii=True, separators=(",", ":"))
    return (
        BLOCK_START
        + "\nfunction ssOrdersDue(html) {\n"
        + '  if (!html || html.indexOf("/* ss-orders-due-v1 */") >= 0) return html;\n'
        + "  var pairs = "
        + orders_encoded
        + ";\n"
        + "  var i;\n"
        + "  for (i = 0; i < pairs.length; i++) {\n"
        + "    if (html.split(pairs[i][0]).length - 1 !== 1) return html;\n"
        + "  }\n"
        + "  for (i = 0; i < pairs.length; i++) {\n"
        + "    html = html.split(pairs[i][0]).join(pairs[i][1]);\n"
        + "  }\n"
        + "  return html;\n"
        + "}\n"
        + "function ssOwnerBudget(html) {\n"
        + "  if (!html) return html;\n"
        + '  if (html.indexOf("/* ss-owner-budget-applied */") >= 0) return ssOrdersDue(html);\n'
        + "  var pairs = "
        + encoded
        + ";\n"
        + "  var i;\n"
        + "  for (i = 0; i < pairs.length; i++) {\n"
        + "    if (html.split(pairs[i][0]).length - 1 !== 1) return html;\n"
        + "  }\n"
        + "  for (i = 0; i < pairs.length; i++) {\n"
        + "    html = html.split(pairs[i][0]).join(pairs[i][1]);\n"
        + "  }\n"
        + "  return ssOrdersDue(html);\n"
        + "}\n"
        + BLOCK_END
        + "\n"
    )


def without_block(script: str) -> str:
    if BLOCK_START in script and BLOCK_END in script:
        pre, _, tail = script.partition(BLOCK_START)
        _, _, post = tail.partition(BLOCK_END)
        return pre + post
    return script


def assert_additive(before: str, after: str) -> None:
    after_core = without_block(after)
    missing = [line for line in without_block(before).splitlines() if line.strip() and line not in after_core]
    if missing:
        raise SystemExit(
            f"publish would change {len(missing)} existing worker lines; first is {missing[0]!r}"
        )
    print(f"additive ok, existing lines kept ({len(without_block(before).splitlines())})", flush=True)


def splice_worker(script: str) -> str:
    if "ss-tustin-cig-v1" not in script or "function ssAddTustinCig" not in script:
        raise SystemExit("live worker is missing the Tustin inventory block")
    block = js_block()
    if BLOCK_START in script and BLOCK_END in script:
        pre, _, tail = script.partition(BLOCK_START)
        _, _, post = tail.partition(BLOCK_END)
        script = pre + block + post.lstrip("\n")
    else:
        needle = "var worker_default = {"
        if script.count(needle) != 1:
            raise SystemExit(f"worker_default count {script.count(needle)}")
        script = script.replace(needle, block + needle, 1)
    if "ssOwnerBudget(chosen)" not in script:
        if script.count(HOOK) != 1:
            raise SystemExit(f"tustin shell hook count {script.count(HOOK)}")
        script = script.replace(HOOK, CALL, 1)
    if script.count("function ssOwnerBudget") != 1:
        raise SystemExit("owner budget transform was not inserted once")
    if script.count("function ssAddTustinCig") != 1:
        raise SystemExit("Tustin transform count changed")
    return script


def download_script(token: str) -> tuple[str, str]:
    url = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{WORKER}"
    try:
        _status, _ctype, raw, _headers = api(token, "GET", url)
    except urllib.error.HTTPError as err:
        if err.code != 401:
            raise
        token = refresh_token()
        _status, _ctype, raw, _headers = api(token, "GET", url)
    return token, extract_worker(raw)


def fetch_live(path: str) -> tuple[dict, bytes]:
    req = urllib.request.Request(
        "https://smartsolutionsai.us" + path,
        headers={"User-Agent": "ss-owner-budget", "Cache-Control": "no-cache"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return dict(resp.headers), resp.read()


def shell_stamp() -> str:
    headers, body = fetch_live("/app.html?nocache=owner-budget-stamp")
    text = body.decode("utf-8", "replace")
    match = re.search(r"DATA_STAMP = '([^']+)'", text)
    stamp = match.group(1) if match else ""
    header_stamp = headers.get("X-SS-Shell-Stamp") or headers.get("x-ss-shell-stamp") or ""
    return header_stamp or stamp


def assert_views_are_siblings(html: str) -> None:
    start = html.find('id="view-billing"')
    end = html.find('id="view-budget"')
    open_at = html.rfind("<div", 0, start)
    region = html[open_at:end]
    token = re.compile(r"<(/?)(style|script|div)\b([^>]*)>", re.I)
    depth = 0
    idx = 0
    skip = None
    while idx < len(region):
        if skip:
            found = region.lower().find(skip, idx)
            if found < 0:
                raise SystemExit("billing style or script is not closed")
            idx = found + len(skip)
            skip = None
            continue
        match = token.search(region, idx)
        if not match:
            break
        closing, tag = bool(match.group(1)), match.group(2).lower()
        idx = match.end()
        if tag in ("style", "script") and not closing:
            skip = "</" + tag + ">"
            continue
        if tag != "div":
            continue
        depth += -1 if closing else 1
    if depth != 0:
        raise SystemExit(f"Budget is still inside Billing (open divs {depth})")
    print("budget view is outside billing", flush=True)


def apply_worker_fn(script: str, fn_name: str, html: str) -> str:
    start = script.find(f"function {fn_name}")
    if start < 0:
        raise SystemExit(f"{fn_name} is missing from the worker")
    end = script.find("\nfunction ", start + 10)
    if end < 0:
        raise SystemExit(f"{fn_name} does not end before the next function")
    harness = Path(f"/tmp/apply-{fn_name}.mjs")
    src = Path(f"/tmp/apply-{fn_name}.html")
    out = Path(f"/tmp/apply-{fn_name}-out.html")
    src.write_text(html)
    harness.write_text(
        script[start:end]
        + f"""
import fs from "fs";
const html = fs.readFileSync("{src}", "utf8");
const next = {fn_name}(html);
fs.writeFileSync("{out}", next);
console.log("{fn_name}", next === html ? "unchanged" : "applied", next.length);
"""
    )
    subprocess.check_call(["node", str(harness)])
    return out.read_text()


def transform_live_html(block: str, html: str) -> str:
    start = block.find("function ssOrdersDue")
    end = block.find(BLOCK_END)
    if start < 0 or end < 0:
        raise SystemExit("owner budget function missing from block")
    harness = Path("/tmp/owner-budget-harness.mjs")
    live = Path("/tmp/owner-budget-live.html")
    live.write_text(html)
    harness.write_text(
        block[start:end]
        + """
import fs from "fs";
const html = fs.readFileSync("/tmp/owner-budget-live.html", "utf8");
const out = ssOwnerBudget(html);
if (!out.includes("/* ss-owner-budget-applied */")) process.exit(2);
if (out.includes("navBudget.hidden = !(role === 'admin');")) process.exit(3);
if (!out.includes("function buildBudget(")) process.exit(4);
if (!out.includes("2938.42")) process.exit(5);
if (!out.includes("ss-tustin-cig-v1")) process.exit(6);
if (!out.includes("ss-billing-simple-v1")) process.exit(7);
if (!out.includes('id="commandBody"')) process.exit(8);
if (!out.includes("C-store margin for every store")) process.exit(16);
if (out.includes("ss-command-simple-v1")) process.exit(17);
if (!out.includes("id === '42073'")) process.exit(18);
if (!out.includes('"stationId": "42674"')) process.exit(9);
if (ssOwnerBudget(out) !== out) process.exit(10);
if (!out.includes("return '__scope__'")) process.exit(11);
if (!out.includes("All your stations")) process.exit(12);
if (!out.includes("All stations together")) process.exit(13);
if (!out.includes("ss-budget-summary-v1")) process.exit(19);
if (!out.includes("data-budget-client")) process.exit(20);
if (out.includes("if (isParadise) status = 'skip'")) process.exit(21);
if (!out.includes("/* ss-orders-due-v1 */")) process.exit(22);
if (!out.includes("Due tomorrow")) process.exit(23);
if (!out.includes("data-orders-due-open")) process.exit(24);
if (!out.includes('id="ordersDueSplit"')) process.exit(25);
if (!out.includes('id="ordersDueClose"')) process.exit(26);
if (!out.includes("Manager delivery not in yet")) process.exit(27);
if (!out.includes("AI orders vs manager deliveries")) process.exit(28);
if (!out.includes('id="navBudget" hidden>Budget</button>\\n          <button type="button" data-view="command"')) process.exit(14);
if (out.includes('id="navInventory">Inventory</button>\\n          <button type="button" data-view="command"')) process.exit(15);
fs.writeFileSync("/tmp/owner-budget-transformed.html", out);
const open = out.lastIndexOf("<script>", out.indexOf("function buildBudget("));
const close = out.indexOf("</script>", out.indexOf("function buildBudget("));
fs.writeFileSync("/tmp/owner-budget-main.js", out.slice(open + 8, close));
console.log("js transform ok");
"""
    )
    subprocess.check_call(["node", str(harness)])
    subprocess.check_call(["node", "--check", "/tmp/owner-budget-main.js"])
    assert_views_are_siblings(Path("/tmp/owner-budget-transformed.html").read_text())
    print("transformed app script syntax ok", flush=True)


def upload_proto(token: str, script: str) -> str:
    metadata = {
        "main_module": "worker.js",
        "compatibility_date": "2026-09-01",
        "compatibility_flags": [],
        "keep_assets": True,
        "keep_bindings": ["assets"],
        "annotations": {
            "workers/message": "Orders shows due today and due tomorrow"
        },
    }
    body, boundary = encode_multipart(script, metadata)
    status, _ctype, raw, _headers = api(
        token,
        "POST",
        f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{WORKER}/versions",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    if status != 200:
        raise SystemExit(f"version upload {status} {raw[:400]!r}")
    payload = json.loads(raw)
    if not payload.get("success"):
        raise SystemExit(f"version upload failed {raw[:400]!r}")
    version_id = (payload.get("result") or {}).get("id")
    if not version_id:
        raise SystemExit("no version id")
    print(f"uploaded {WORKER} version {version_id}", flush=True)
    return version_id


def confirm_previous_pages(stamp: str) -> None:
    headers, html_bytes = fetch_live("/app.html?nocache=owner-budget-confirm")
    html = html_bytes.decode("utf-8", "replace")
    live_stamp = headers.get("X-SS-Shell-Stamp") or headers.get("x-ss-shell-stamp") or ""
    # The locked shell can advance (hb164 → hb165) while this transform is still
    # on the page. Markers below decide whether the deploy stayed good.
    if stamp and live_stamp and live_stamp != stamp:
        print(f"shell stamp moved from {stamp} to {live_stamp}; checking markers", flush=True)
    for marker in (
        "function buildBudget(",
        "ss-billing-simple-v1",
        'id="commandBody"',
        "C-store margin for every store",
        "id === '42073'",
        "2938.42",
        "ss-tustin-cig-v1",
        '"stationId": "42674"',
        "/* ss-owner-budget-applied */",
        "return '__scope__'",
        "All your stations",
        "All stations together",
        "ss-budget-summary-v1",
        "data-budget-client",
        "/* ss-orders-due-v1 */",
        "Due tomorrow",
        "data-orders-due-open",
        'id="ordersDueSplit"',
        'id="ordersDueClose"',
        "Manager delivery not in yet",
        "AI orders vs manager deliveries",
        'id="navBudget" hidden>Budget</button>\n          <button type="button" data-view="command"',
        "</details>\n      </div>\n      <div id=\"billingManager\" hidden>",
    ):
        if marker not in html:
            raise SystemExit(f"live app lost {marker}")
    if "ss-command-simple-v1" in html:
        raise SystemExit("Command Center is still the short three-number page")
    if "if (isParadise) status = 'skip'" in html:
        raise SystemExit("Paradise is still skipped")
    if "ss-budget-summary-v1" not in html:
        raise SystemExit("Budget summary is missing")
    if "navBudget.hidden = !(role === 'admin');" in html:
        raise SystemExit("budget tab is still admin only")
    if 'id="navInventory">Inventory</button>\n          <button type="button" data-view="command"' in html:
        raise SystemExit("Command Center is still separated from Budget")
    _arco_headers, arco = fetch_live("/inventory/42352/2026-09-26/count.pdf")
    if not arco.startswith(b"%PDF"):
        raise SystemExit("Arco Db count PDF is no longer a PDF")
    _tustin_headers, tustin = fetch_live("/inventory/42674/2026-09-26/count.pdf")
    if not tustin.startswith(b"%PDF"):
        raise SystemExit("Tustin count PDF is not being served")
    _budget_headers, budget = fetch_live("/budget-targets.json?nocache=owner-budget-confirm")
    if b"71400" not in budget:
        raise SystemExit("budget targets no longer include the Arco Db figure")
    print(f"previous pages still present, shell {live_stamp or stamp}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--from-file", default="", help="Full worker script to patch. Required when the latest upload is not the active script.")
    args = parser.parse_args()
    block = js_block()
    _headers, html_bytes = fetch_live("/app.html?nocache=owner-budget-preflight")
    live_html = html_bytes.decode("utf-8", "replace")
    if "ss-tustin-cig-v1" not in live_html:
        print("live app is missing the Tustin marker; the worker transform must put it back", flush=True)
    # The live page already includes this transform. Test against the shell
    # from before it, which is what the worker still receives from assets.
    html = live_html
    if "/* ss-owner-budget-applied */" in live_html:
        original = Path("/tmp/app-budget-tab.html")
        if not original.exists():
            raise SystemExit("pre-transform app shell is missing")
        html = original.read_text()
        if "/* ss-owner-budget-applied */" in html:
            raise SystemExit("saved app shell is already transformed")
    if "ss-tustin-cig-v1" not in html and args.from_file:
        html = apply_worker_fn(Path(args.from_file).read_text(), "ssAddTustinCig", html)
        if "ss-tustin-cig-v1" not in html:
            raise SystemExit("Tustin inventory transform did not apply to this shell")
    transform_live_html(block, html)
    if args.from_file:
        script = Path(args.from_file).read_text()
        print(f"worker from file bytes={len(script)}", flush=True)
        token = ""
    else:
        token = load_token()
        token, script = download_script(token)
        print(f"downloaded {WORKER} bytes={len(script)}", flush=True)
    if "function ssAddTustinCig" not in script or len(script) < 1_000_000:
        raise SystemExit(f"refusing a short worker script ({len(script)} bytes)")
    updated = splice_worker(script)
    assert_additive(script, updated)
    print(f"patched bytes={len(updated)}", flush=True)
    node_check(updated, "ss-unified-proto-owner-budget")
    if args.check_only:
        Path("/tmp/ss-unified-proto-owner-budget.js").write_text(updated)
        print("check-only done", flush=True)
        return
    if not token:
        token = load_token()
    before = binding_names(token, WORKER)
    print(f"bindings before: {before}", flush=True)
    if "assets:ASSETS" not in before:
        raise SystemExit(f"unexpected bindings {before}")
    previous = current_version(token, WORKER)
    stamp = shell_stamp()
    print(f"shell stamp before {stamp}", flush=True)
    version_id = upload_proto(token, updated)
    deploy_version(token, WORKER, version_id)
    after = binding_names(token, WORKER)
    print(f"bindings after: {after}", flush=True)
    missing = [item for item in before if item not in after]
    try:
        if missing:
            raise SystemExit(f"bindings dropped {missing}")
        last_check = None
        for attempt in range(6):
            try:
                confirm_previous_pages(stamp)
                last_check = None
                break
            except SystemExit as err:
                last_check = err
                print(f"confirm attempt {attempt + 1} failed: {err}", flush=True)
                time.sleep(2)
        if last_check:
            raise last_check
    except SystemExit:
        print("page check failed; rolling back", flush=True)
        deploy_version(token, WORKER, previous)
        raise
    print(json.dumps({"previous": previous, "uploaded": version_id}))


if __name__ == "__main__":
    main()
