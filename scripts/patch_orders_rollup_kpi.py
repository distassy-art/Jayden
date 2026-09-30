#!/usr/bin/env python3
"""Deploy Orders L1 KPI fix on ss-unified-proto (Cloudflare worker transform).

Orders "AI orders" KPI was frozen on paired S2K rows (~$134k). Synced
orders.json orderedTotal rollups did not affect that screen.

Injects ssOrdersRollupKpi(html) like ssOwnerBudget — additive worker patch only.

Run: python3 scripts/patch_orders_rollup_kpi.py
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
from pathlib import Path

# Reuse Cloudflare helpers from publish_owner_budget where possible.
import publish_owner_budget as pob

BLOCK_START = "/* ss-orders-rollup-kpi-v1 */"
BLOCK_END = "/* ss-orders-rollup-kpi-v1-end */"
HOOK = "  chosen = ssOwnerBudget(chosen);\n"
CALL = "  chosen = ssOwnerBudget(chosen);\n  chosen = ssOrdersRollupKpi(chosen);\n"

PAIRS: list[list[str]] = [
    [
        "        mgr = Object.prototype.hasOwnProperty.call(s2kMap, s2kKey) ? Number(s2kMap[s2kKey]) : null;",
        """        try {
          if (DATA && DATA.ordersS2kDeliveries) Object.assign(s2kMap, DATA.ordersS2kDeliveries);
        } catch (eS2kMerge) {}
        if (Object.prototype.hasOwnProperty.call(s2kMap, s2kKey)) mgr = Number(s2kMap[s2kKey]);
        else if (row && row.actualPurchased != null && row.actualPurchased !== '') mgr = Number(row.actualPurchased);
        else {
          var _mgrHit = (typeof orderCompareMatchRow === 'function') ? orderCompareMatchRow(s2kSid, row.vendorName || row.vendorId || row.vendor, s2kDt) : null;
          if (_mgrHit && _mgrHit.actual != null) mgr = Number(_mgrHit.actual);
        }""",
    ],
    [
        "          fetchJson('/command-category-yoy.json' + q).catch(function () { return fetchJson('/data/command-category-yoy.json' + q); }).catch(function () { return null; })",
        "          fetchJson('/command-category-yoy.json' + q).catch(function () { return fetchJson('/data/command-category-yoy.json' + q); }).catch(function () { return null; }),\n          fetchJson('/data/orders-s2k-deliveries.json' + q).catch(function () { return null; })",
    ],
    [
        "          DATA.commandCategoryYoy = pack[18] || null;",
        "          DATA.commandCategoryYoy = pack[18] || null;\n          DATA.ordersS2kDeliveries = (pack[19] && pack[19].deliveries) ? pack[19].deliveries : null;",
    ],
    [
        """              kpis.innerHTML =
                '<div class="card kpi"><div class="kpi-label">AI orders</div><div class="kpi-value">' + orderMoney(totAi) + '</div><div class="kpi-context">' + monthKey + ' · filled deliveries only</div></div>' +
                '<div class="card kpi"><div class="kpi-label">Manager deliveries</div><div class="kpi-value">' + orderMoney(totMgr) + '</div><div class="kpi-context">S2K deliveries</div></div>' +
                '<div class="card kpi"><div class="kpi-label">Variance</div><div class="kpi-value">' + orderMoney(totMgr - totAi) + '</div><div class="kpi-context">Deliveries − AI orders</div></div>' +""",
        """              var rollupAi = 0;
              (allClients || []).forEach(function (c) { rollupAi += Number(c.orderedTotal || 0); });
              var kpiTotalAi = rollupAi > 0 ? rollupAi : totAiAll;
              kpis.innerHTML =
                '<div class="card kpi"><div class="kpi-label">AI orders · MTD</div><div class="kpi-value">' + orderMoney(kpiTotalAi) + '</div><div class="kpi-context">' + monthKey + ' · all built orders</div></div>' +
                '<div class="card kpi"><div class="kpi-label">Manager deliveries</div><div class="kpi-value">' + orderMoney(totMgr) + '</div><div class="kpi-context">' + monthKey + ' · paired S2K only</div></div>' +
                '<div class="card kpi"><div class="kpi-label">Compare variance</div><div class="kpi-value">' + orderMoney(totMgr - totAi) + '</div><div class="kpi-context">Paired only · AI ' + orderMoney(totAi) + '</div></div>' +""",
    ],
    [
        """              map[sid] = {
                stationId: sid,
                storeName: s.storeName || sid,
                client: (meta && meta.client) || c.client || c.owner || '',
                owner: ownerName,
                clients: [Object.assign({}, c, { stores: [s] })],
                monthRows: [],
                dueToday: 0,
                pdfReady: 0,
                stuckPdf: 0
              };""",
        """              map[sid] = {
                stationId: sid,
                storeName: s.storeName || sid,
                client: (meta && meta.client) || c.client || c.owner || '',
                owner: ownerName,
                clientOrderedTotal: Number(s.orderedTotal != null ? s.orderedTotal : (c.orderedTotal || 0)),
                clients: [Object.assign({}, c, { stores: [s] })],
                monthRows: [],
                dueToday: 0,
                pdfReady: 0,
                stuckPdf: 0
              };""",
    ],
    [
        """            } else {
              map[sid].clients.push(Object.assign({}, c, { stores: [s] }));
            }""",
        """            } else {
              map[sid].clients.push(Object.assign({}, c, { stores: [s] }));
              map[sid].clientOrderedTotal = Number(s.orderedTotal != null ? s.orderedTotal : (c.orderedTotal || 0));
            }""",
    ],
    [
        """          o.aiOrdersOnly = (o.aiOrdersOnly || 0) + Number(st.aiTotalAll != null ? st.aiTotalAll : 0);
          o.aiOrderCount = (o.aiOrderCount || 0) + Number(st.aiCountAll || 0);""",
        """          o.aiRollup = (o.aiRollup || 0) + Number(e.clientOrderedTotal || 0);
          o.aiOrdersOnly = (o.aiOrdersOnly || 0) + Number(st.aiTotalAll != null ? st.aiTotalAll : 0);
          o.aiOrderCount = (o.aiOrderCount || 0) + Number(st.aiCountAll || 0);""",
    ],
    [
        """          var aiSoFar = Number(o.aiTotal || 0);
          variance = (aiSoFar || Number(o.mgrTotal || 0)) ? (Number(o.mgrTotal || 0) - aiSoFar) : variance;
          pct = (aiSoFar && variance != null && Math.abs(aiSoFar) > 0.005) ? ((variance / aiSoFar) * 100) : null;
          pctTxt = (pct == null || !isFinite(pct)) ? '—' : ((pct >= 0 ? '+' : '') + pct.toFixed(1) + '%');
          varCls = (typeof ordersVarianceClass === 'function') ? ordersVarianceClass(variance, pct) : '';""",
        """          var aiPaired = Number(o.aiTotal || 0);
          var aiSoFar = Number(o.aiRollup || o.aiOrdersOnly || aiPaired || 0);
          variance = (aiPaired || Number(o.mgrTotal || 0)) ? (Number(o.mgrTotal || 0) - aiPaired) : variance;
          pct = (aiPaired && variance != null && Math.abs(aiPaired) > 0.005) ? ((variance / aiPaired) * 100) : null;
          pctTxt = (pct == null || !isFinite(pct)) ? '—' : ((pct >= 0 ? '+' : '') + pct.toFixed(1) + '%');
          varCls = (typeof ordersVarianceClass === 'function') ? ordersVarianceClass(variance, pct) : '';""",
    ],
    [
        """          '<th>Owner</th><th class="num">Due today</th><th class="num">AI orders</th><th class="num">Deliveries</th><th class="num">Variance</th><th class="num">%</th><th class="num">Cut</th><th class="num">Add</th><th class="num">PDF</th>' +""",
        """          '<th>Owner</th><th class="num">Due today</th><th class="num">AI · MTD</th><th class="num">Deliveries</th><th class="num">Variance</th><th class="num">%</th><th class="num">Cut</th><th class="num">Add</th><th class="num">PDF</th>' +""",
    ],
]


def js_block() -> str:
    encoded = json.dumps(PAIRS, ensure_ascii=True, separators=(",", ":"))
    return (
        BLOCK_START
        + "\nfunction ssOrdersRollupKpi(html) {\n"
        + '  if (!html || html.indexOf("ss-orders-rollup-kpi-applied") >= 0) return html;\n'
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
        + '  html = html.replace("function buildOrders(", "/* ss-orders-rollup-kpi-applied */ function buildOrders(", 1);\n'
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


def splice_worker(script: str) -> str:
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
    if "ssOrdersRollupKpi(chosen)" not in script:
        if script.count(HOOK) != 1:
            raise SystemExit(f"owner budget hook count {script.count(HOOK)}")
        script = script.replace(HOOK, CALL, 1)
    if script.count("function ssOrdersRollupKpi") != 1:
        raise SystemExit("orders rollup transform not inserted once")
    return script


def transform_check(html: str) -> str:
    block = js_block()
    start = block.find("function ssOrdersRollupKpi")
    end = block.find(BLOCK_END)
    harness = Path("/tmp/orders-rollup-harness.mjs")
    harness.write_text(
        block[start:end]
        + """
import fs from 'fs';
const html = fs.readFileSync('/tmp/orders-rollup-live.html','utf8');
const out = ssOrdersRollupKpi(html);
if (!out.includes('rollupAi')) { console.error('no rollupAi'); process.exit(2); }
if (!out.includes('ordersS2kDeliveries')) { console.error('no fetch'); process.exit(3); }
if (!out.includes('all built orders')) { console.error('no total label'); process.exit(4); }
if (!out.includes('kpiTotalAi')) { console.error('no kpiTotalAi'); process.exit(5); }
if (out.includes('filled deliveries only')) { console.error('old kpi label'); process.exit(6); }
if (ssOrdersRollupKpi(out) !== out) { console.error('not idempotent'); process.exit(7); }
fs.writeFileSync('/tmp/orders-rollup-out.html', out);
console.log('transform ok');
"""
    )
    Path("/tmp/orders-rollup-live.html").write_text(html)
    subprocess.check_call(["node", str(harness)])
    return Path("/tmp/orders-rollup-out.html").read_text()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()

    _headers, html_bytes = pob.fetch_live("/app.html?nocache=orders-rollup-preflight")
    live_html = html_bytes.decode("utf-8", "replace")
    if "function buildOrders(" not in live_html:
        raise SystemExit("live app missing buildOrders")
    transform_check(live_html)

    if args.check_only:
        print("html transform check ok (worker not downloaded)", flush=True)
        return

    token = pob.load_token()
    token, script = pob.download_script(token)
    updated = splice_worker(script)
    pob.assert_additive(script, updated)
    pob.node_check(updated, "ss-unified-proto-orders-rollup")

    before = pob.binding_names(token, pob.WORKER)
    previous = pob.current_version(token, pob.WORKER)
    stamp = pob.shell_stamp()
    version_id = pob.upload_proto(token, updated)
    pob.deploy_version(token, pob.WORKER, version_id)
    after = pob.binding_names(token, pob.WORKER)
    missing = [item for item in before if item not in after]
    try:
        if missing:
            raise SystemExit(f"bindings dropped {missing}")
        for attempt in range(8):
            _h, body = pob.fetch_live("/app.html?nocache=orders-rollup-confirm")
            text = body.decode("utf-8", "replace")
            if "rollupAi" in text and "ss-orders-rollup-kpi-applied" in text:
                print("live app has Orders rollup KPI patch", flush=True)
                break
            time.sleep(2)
        else:
            raise SystemExit("live app never showed rollupAi after deploy")
    except SystemExit:
        print("rolling back worker", flush=True)
        pob.deploy_version(token, pob.WORKER, previous)
        raise
    print(json.dumps({"previous": previous, "uploaded": version_id, "stamp_before": stamp}))


if __name__ == "__main__":
    main()
