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
        "          budgetLead.textContent = 'All stations together. Pick one station to see that budget.';\n"
        "        } else if (budgetLead && typeof role !== 'undefined' && role !== 'admin') {\n"
        "          budgetLead.textContent = 'Your stations only. All stores shows every station you own. Pick one station to see that budget.';\n"
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
    return out


def js_block() -> str:
    encoded = json.dumps(active_pairs(), ensure_ascii=True, separators=(",", ":"))
    return (
        BLOCK_START
        + "\nfunction ssOwnerBudget(html) {\n"
        + '  if (!html || html.indexOf("/* ss-owner-budget-applied */") >= 0) return html;\n'
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
        + "  return html;\n"
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


def transform_live_html(block: str, html: str) -> str:
    start = block.find("function ssOwnerBudget")
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
if (!out.includes("ss-command-simple-v1")) process.exit(8);
if (!out.includes('"stationId": "42674"')) process.exit(9);
if (ssOwnerBudget(out) !== out) process.exit(10);
if (!out.includes("return '__scope__'")) process.exit(11);
if (!out.includes("All your stations")) process.exit(12);
if (!out.includes("All stations together")) process.exit(13);
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
    print("transformed app script syntax ok", flush=True)


def upload_proto(token: str, script: str) -> str:
    metadata = {
        "main_module": "worker.js",
        "compatibility_date": "2026-09-01",
        "compatibility_flags": [],
        "keep_assets": True,
        "keep_bindings": ["assets"],
        "annotations": {
            "workers/message": "Show Budget and Command Center for each owner and station"
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
    if stamp and live_stamp != stamp:
        raise SystemExit(f"shell stamp changed from {stamp} to {live_stamp}")
    for marker in (
        "function buildBudget(",
        "ss-billing-simple-v1",
        "ss-command-simple-v1",
        "2938.42",
        "ss-tustin-cig-v1",
        '"stationId": "42674"',
        "/* ss-owner-budget-applied */",
        "return '__scope__'",
        "All your stations",
        "All stations together",
        'id="navBudget" hidden>Budget</button>\n          <button type="button" data-view="command"',
    ):
        if marker not in html:
            raise SystemExit(f"live app lost {marker}")
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
    args = parser.parse_args()
    block = js_block()
    _headers, html_bytes = fetch_live("/app.html?nocache=owner-budget-preflight")
    live_html = html_bytes.decode("utf-8", "replace")
    if "ss-tustin-cig-v1" not in live_html:
        raise SystemExit("live app is missing the Tustin inventory page")
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
    transform_live_html(block, html)
    token = load_token()
    token, script = download_script(token)
    print(f"downloaded {WORKER} bytes={len(script)}", flush=True)
    updated = splice_worker(script)
    assert_additive(script, updated)
    print(f"patched bytes={len(updated)}", flush=True)
    node_check(updated, "ss-unified-proto-owner-budget")
    if args.check_only:
        Path("/tmp/ss-unified-proto-owner-budget.js").write_text(updated)
        print("check-only done", flush=True)
        return
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
