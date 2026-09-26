/* ss-daily-refresh-v1
 * One daily book (books overlay) feeds every open-month calculation.
 * Home, the daily table, weekly actuals, September monthly, the yearly
 * open month, and Command Center margins read /data/daily_september.json.
 * Budget, weekly purchase caps, and Command Center spend read
 * budget-targets.json, vendor-mix.json, and manager.json — those are
 * rewritten from the same book on each request.
 * La Mesa (42642) stays off the daily book.
 * Paradise (42359) and ExtraMile stay blank on the purchase-budget path.
 */
var SS_OPEN_MONTH = "2026-09";
var SS_SKIP_DAILY = { "42642": true };
var SS_BUDGET_BLANK = { "42359": true, extramile: true };
var SS_MONTH_NAMES = {
  1: "January",
  2: "February",
  3: "March",
  4: "April",
  5: "May",
  6: "June",
  7: "July",
  8: "August",
  9: "September",
  10: "October",
  11: "November",
  12: "December"
};

function ssNum(v) {
  if (v == null || v === "") return null;
  var n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ssRound2(n) {
  var v = ssNum(n);
  if (v == null) return 0;
  return Math.round(v * 100) / 100;
}

function ssMoney(n) {
  var v = ssRound2(n);
  var sign = v < 0 ? "-" : "";
  var abs = Math.abs(v).toFixed(2).split(".");
  abs[0] = abs[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return sign + abs[0] + "." + abs[1];
}

function ssDaysInMonth(month) {
  var parts = String(month || SS_OPEN_MONTH).split("-");
  var year = Number(parts[0]);
  var mo = Number(parts[1]);
  return new Date(Date.UTC(year, mo, 0)).getUTCDate();
}

function ssStationKey(sid) {
  return /^\d+$/.test(String(sid)) ? [0, Number(sid)] : [1, String(sid)];
}

function ssJsonResponse(obj, source) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "CDN-Cache-Control": "no-store",
      "Cloudflare-CDN-Cache-Control": "no-store",
      "X-SS-Data-Source": source || "books-overlay",
      "X-SS-Daily-Refresh": "1"
    }
  });
}

function ssBuildDailySeptember(overlay, month) {
  var ym = month || SS_OPEN_MONTH;
  var parts = ym.split("-").map(Number);
  var label = SS_MONTH_NAMES[parts[1]] + " " + parts[0] + " month to date";
  var stationsObj = (overlay && overlay.stations) || {};
  var ids = Object.keys(stationsObj).sort(function (a, b) {
    var ka = ssStationKey(a);
    var kb = ssStationKey(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] < kb[1]) return -1;
    if (ka[1] > kb[1]) return 1;
    return 0;
  });
  var outStations = [];
  var salesDates = [];
  var dayKeys = ["gas_vol", "gas_profit", "sales", "purch", "store_profit", "margin", "total_profit"];
  for (var i = 0; i < ids.length; i++) {
    var sid = ids[i];
    if (SS_SKIP_DAILY[sid]) continue;
    var st = stationsObj[sid] || {};
    var days = [];
    var rawDays = st.days || [];
    for (var d = 0; d < rawDays.length; d++) {
      var raw = rawDays[d];
      if (!raw || typeof raw !== "object") continue;
      var date = String(raw.date || "");
      if (date.indexOf(ym) !== 0) continue;
      var row = { date: date };
      for (var k = 0; k < dayKeys.length; k++) {
        var key = dayKeys[k];
        if (Object.prototype.hasOwnProperty.call(raw, key)) row[key] = ssNum(raw[key]);
      }
      days.push(row);
      if (ssNum(row.sales) != null) salesDates.push(date);
    }
    days.sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date));
    });
    outStations.push({ id: sid, name: st.name || sid, days: days });
  }
  salesDates.sort();
  return {
    month: ym,
    label: label,
    through: salesDates.length ? salesDates[salesDates.length - 1] : null,
    closed: false,
    stations: outStations,
    source: "books-overlay",
    updated_at: (overlay && overlay.updated_at) || null
  };
}

function ssDailyTotals(daily) {
  var byId = {};
  var stations = (daily && daily.stations) || [];
  for (var i = 0; i < stations.length; i++) {
    var st = stations[i];
    if (!st) continue;
    var sales = 0;
    var purch = 0;
    var profit = 0;
    var gasVol = 0;
    var gasProfit = 0;
    var lastSales = "";
    var any = false;
    var days = st.days || [];
    for (var d = 0; d < days.length; d++) {
      var day = days[d] || {};
      var date = String(day.date || "");
      var daySales = ssNum(day.sales);
      var dayPurch = ssNum(day.purch);
      if (dayPurch == null) dayPurch = ssNum(day.purchases);
      var dayProfit = ssNum(day.store_profit);
      var dayGas = ssNum(day.gas_vol);
      var dayGasProfit = ssNum(day.gas_profit);
      if (daySales != null) sales += daySales;
      if (dayPurch != null) purch += dayPurch;
      if (dayProfit != null) profit += dayProfit;
      if (dayGas != null) gasVol += dayGas;
      if (dayGasProfit != null) gasProfit += dayGasProfit;
      if (daySales != null && date > lastSales) lastSales = date;
      any = true;
    }
    if (!any) continue;
    byId[String(st.id)] = {
      id: String(st.id),
      name: st.name || String(st.id),
      sales: ssRound2(sales),
      purch: ssRound2(purch),
      profit: ssRound2(profit),
      gasVol: ssRound2(gasVol),
      gasProfit: ssRound2(gasProfit),
      lastSales: lastSales,
      elapsed: lastSales ? Number(lastSales.slice(8, 10)) : 0
    };
  }
  return byId;
}

function ssBudgetBasis(tot, dim, eom) {
  return (
    "60% of $" +
    ssMoney(eom) +
    " EOM (= MTD store sales $" +
    ssMoney(tot.sales) +
    " × " +
    dim +
    "/" +
    tot.elapsed +
    ")"
  );
}

function ssEomBudget(tot, dim) {
  if (!tot || !(tot.elapsed > 0) || !(tot.sales > 0)) return null;
  var eom = tot.sales * dim / tot.elapsed;
  return {
    eom: ssRound2(eom),
    budget: ssRound2(eom * 0.6),
    basis: ssBudgetBasis(tot, dim, eom)
  };
}

function ssRefreshBudgetRow(row, tot, dim) {
  if (!row) return false;
  var id = String(row.store_id != null ? row.store_id : row.id || "");
  if (SS_BUDGET_BLANK[id]) return false;
  var calc = ssEomBudget(tot, dim);
  if (!calc) return false;
  row.eom_sales_estimate = calc.eom;
  row.month_purchase_budget = calc.budget;
  row.purchase_budget_basis = calc.basis;
  return true;
}

function ssRefreshBudgetTargets(doc, totals, daily) {
  var out = JSON.parse(JSON.stringify(doc || {}));
  var dim = ssDaysInMonth((daily && daily.month) || SS_OPEN_MONTH);
  var stores = out.stores;
  if (stores && !Array.isArray(stores) && typeof stores === "object") {
    Object.keys(stores).forEach(function (key) {
      var row = stores[key];
      if (!row || typeof row !== "object") return;
      var id = String(row.store_id != null ? row.store_id : key);
      ssRefreshBudgetRow(row, totals[id], dim);
    });
  } else if (Array.isArray(stores)) {
    stores.forEach(function (row) {
      if (!row) return;
      ssRefreshBudgetRow(row, totals[String(row.store_id != null ? row.store_id : row.id)], dim);
    });
  }
  if (Array.isArray(out.clients)) {
    out.clients.forEach(function (row) {
      if (!row) return;
      ssRefreshBudgetRow(row, totals[String(row.store_id != null ? row.store_id : row.id)], dim);
    });
  }
  out.meta = out.meta && typeof out.meta === "object" ? out.meta : {};
  out.meta.daily_refresh_at = (daily && daily.updated_at) || null;
  out.meta.daily_refresh_through = (daily && daily.through) || null;
  out.meta.daily_refresh_rule =
    "Month purchase budget = 60% of EOM store sales. EOM = MTD store sales × days in the month / last posted sales day. Paradise and ExtraMile stay blank.";
  return out;
}

function ssPartsToTotal(weights, total) {
  var old = 0;
  for (var i = 0; i < weights.length; i++) old += weights[i];
  if (!(old > 0) || !weights.length) return null;
  var out = [];
  var running = 0;
  for (var j = 0; j < weights.length; j++) {
    if (j === weights.length - 1) {
      out.push(ssRound2(total - running));
    } else {
      var part = ssRound2(total * (weights[j] / old));
      running += part;
      out.push(part);
    }
  }
  return out;
}

function ssRefreshVendorMix(doc, totals, daily) {
  var out = JSON.parse(JSON.stringify(doc || {}));
  var dim = ssDaysInMonth((daily && daily.month) || SS_OPEN_MONTH);
  var stores = out.stores && typeof out.stores === "object" ? out.stores : {};
  Object.keys(stores).forEach(function (key) {
    var st = stores[key];
    if (!st || typeof st !== "object") return;
    var id = String(st.store_id != null ? st.store_id : key);
    if (SS_BUDGET_BLANK[id]) return;
    var tot = totals[id];
    var calc = ssEomBudget(tot, dim);
    if (!calc || !tot) return;
    st.eom_sales_estimate = calc.eom;
    st.month_purchase_budget = calc.budget;
    st.purchase_budget_basis = calc.basis;
    st.annual_purchase_budget = ssRound2(calc.budget * 12);
    st.mtd_month = (daily && daily.month) || SS_OPEN_MONTH;
    st.mtd_spend = tot.purch;
    st.mtd_total = tot.purch;
    st.excel_net_purchases_mtd = tot.purch;
    st.excel_read_at = (daily && daily.updated_at) || null;
    st.remaining_month = ssRound2(calc.budget - tot.purch);
    st.month_remaining_total = st.remaining_month;
    st.spend_pin = tot.lastSales || st.spend_pin;
    st.spend_source = "Daily book net purchases through " + (tot.lastSales || "the posted days");
    var vendors = Array.isArray(st.vendors_ranked) ? st.vendors_ranked : [];
    var mixWeights = vendors.map(function (v) { return ssNum(v.mix_pct) || 0; });
    var budgets = ssPartsToTotal(mixWeights, calc.budget);
    var spentWeights = vendors.map(function (v) { return ssNum(v.spent_mtd) || 0; });
    var spents = ssPartsToTotal(spentWeights, tot.purch);
    if (!spents) spents = ssPartsToTotal(mixWeights, tot.purch);
    var annualWeights = mixWeights;
    var annuals = ssPartsToTotal(annualWeights, st.annual_purchase_budget);
    var requiredMonth = {};
    var requiredAnnual = {};
    for (var i = 0; i < vendors.length; i++) {
      var vendor = vendors[i];
      var sameActual = Math.abs((ssNum(vendor.actual_spent) || 0) - (ssNum(vendor.spent_mtd) || 0)) < 0.02;
      if (budgets) vendor.budget_month = budgets[i];
      if (spents) vendor.spent_mtd = spents[i];
      if (spents && sameActual) vendor.actual_spent = spents[i];
      vendor.remaining = ssRound2((ssNum(vendor.budget_month) || 0) - (ssNum(vendor.spent_mtd) || 0));
      var name = String(vendor.vendor || "");
      if (name) {
        requiredMonth[name] = vendor.budget_month;
        if (annuals) requiredAnnual[name] = annuals[i];
      }
    }
    if (Object.keys(requiredMonth).length) st.required_spend_month = requiredMonth;
    if (Object.keys(requiredAnnual).length) st.required_spend_annual = requiredAnnual;
  });
  out.meta = out.meta && typeof out.meta === "object" ? out.meta : {};
  out.meta.daily_refresh_at = (daily && daily.updated_at) || null;
  out.meta.daily_refresh_through = (daily && daily.through) || null;
  out.meta.current_mtd_month = (daily && daily.month) || out.meta.current_mtd_month;
  out.meta.formula = out.meta.formula && typeof out.meta.formula === "object" ? out.meta.formula : {};
  out.meta.formula.month_purchase_budget =
    "60% of EOM store sales; EOM = MTD store sales × days in month / last posted sales day";
  out.meta.formula.spent = "Daily book net purchases (same total as Home purchases)";
  return out;
}

function ssRefreshManager(doc, totals, through) {
  var out = JSON.parse(JSON.stringify(doc || {}));
  var stations = Array.isArray(out.stations) ? out.stations : [];
  stations.forEach(function (st) {
    if (!st) return;
    var tot = totals[String(st.id)];
    if (!tot) return;
    var mtd = st.mtd && typeof st.mtd === "object" ? st.mtd : {};
    mtd.days = tot.elapsed || mtd.days || 0;
    mtd.through = tot.lastSales || mtd.through || null;
    mtd.sales = tot.sales;
    mtd.purchases = tot.purch;
    mtd.store_profit = tot.profit;
    mtd.gas_vol = tot.gasVol;
    mtd.gas_profit = tot.gasProfit;
    mtd.total_profit = ssRound2(tot.profit + tot.gasProfit);
    mtd.margin = tot.sales > 0 ? Math.round((tot.profit / tot.sales) * 10000) / 10000 : null;
    mtd.sales_source = "books_overlay_fresh";
    st.mtd = mtd;
  });
  if (through) out.as_of = through;
  out.daily_refresh = "books-overlay";
  out.daily_refresh_through = through || null;
  return out;
}

async function ssReadBooksOverlay(env) {
  try {
    if (env && env.SS_BOOKS && typeof env.SS_BOOKS.get === "function") {
      var raw = await env.SS_BOOKS.get("overlay");
      if (raw) {
        var data = JSON.parse(raw);
        if (data && data.stations) return data;
      }
    }
  } catch (e) {}
  var urls = [
    "https://ss-api.smartsolutionsai.workers.dev/.netlify/functions/books-overlay",
    "https://smartsolutionsai.us/.netlify/functions/books-overlay"
  ];
  for (var i = 0; i < urls.length; i++) {
    try {
      var res = await fetch(urls[i], {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": "ss-daily-refresh" }
      });
      if (!res.ok) continue;
      var payload = await res.json();
      var overlay = (payload && payload.overlay) || payload;
      if (overlay && overlay.stations) return overlay;
    } catch (e2) {}
  }
  return null;
}

async function ssReadAssetJson(env, request, pathname) {
  if (!env || !env.ASSETS || !request) return null;
  try {
    var u = new URL(request.url);
    u.pathname = pathname;
    u.search = "";
    u.hash = "";
    var res = await env.ASSETS.fetch(new Request(u.toString(), {
      method: "GET",
      headers: { Accept: "application/json" }
    }));
    var ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!res.ok || ct.indexOf("json") < 0 || ct.indexOf("html") >= 0) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function ssServeDailySeptember(request, env) {
  if (!request || (request.method !== "GET" && request.method !== "HEAD")) return null;
  var overlay = await ssReadBooksOverlay(env);
  if (!overlay || !overlay.stations) return null;
  var daily = ssBuildDailySeptember(overlay, SS_OPEN_MONTH);
  if (!daily.stations || !daily.stations.length) return null;
  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers: ssJsonResponse(daily, "books-overlay").headers });
  }
  return ssJsonResponse(daily, "books-overlay");
}

function ssPointManagerAtLiveBook(html) {
  if (!html || html.indexOf("/site-manager.json") >= 0) return html;
  return String(html)
    .split("fetchJson('/data/manager.json' + q)").join("fetchJson('/site-manager.json' + q)")
    .split('fetchJson("/data/manager.json" + q)').join('fetchJson("/site-manager.json" + q)');
}

async function ssServeSiteBooks(request, env, pathname) {
  if (!request || (request.method !== "GET" && request.method !== "HEAD")) return null;
  var assetPath = pathname === "/site-manager.json" ? "/data/manager.json" : pathname;
  var base = await ssReadAssetJson(env, request, assetPath);
  if (!base) return null;
  var overlay = await ssReadBooksOverlay(env);
  if (!overlay || !overlay.stations) return null;
  var daily = ssBuildDailySeptember(overlay, SS_OPEN_MONTH);
  if (!daily.stations || !daily.stations.length) return null;
  var totals = ssDailyTotals(daily);
  var out = null;
  if (pathname === "/budget-targets.json" || pathname === "/data/budget-targets.json") {
    out = ssRefreshBudgetTargets(base, totals, daily);
  } else if (pathname === "/vendor-mix.json" || pathname === "/data/vendor-mix.json") {
    out = ssRefreshVendorMix(base, totals, daily);
  } else if (pathname === "/data/manager.json" || pathname === "/manager.json" || pathname === "/site-manager.json") {
    out = ssRefreshManager(base, totals, daily.through);
  } else {
    return null;
  }
  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers: ssJsonResponse(out, "books-overlay").headers });
  }
  return ssJsonResponse(out, "books-overlay");
}

var SS_COMMAND_VIEW_HTML = [
  '<style id="ss-command-simple-v1">',
  ".cc-easy-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 16px}",
  ".cc-easy-kpis .val{font-size:1.55rem}",
  ".cc-easy-lead{margin:0 0 8px}",
  ".cc-easy-situation{margin:0 0 16px;font-size:15px;line-height:1.45;color:var(--navy,#0b1f33)}",
  ".cc-easy-h{margin:0 0 8px;font-size:1.02rem;color:var(--navy,#0b1f33);font-weight:750}",
  ".cc-easy-table-wrap{overflow:auto;border:1px solid var(--line,#d7e1ea);border-radius:12px;background:#fff}",
  ".cc-easy-table{width:100%;border-collapse:collapse;font-size:14px}",
  ".cc-easy-table th{text-align:left;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted,#6b7c8f);padding:10px 12px;border-bottom:1px solid var(--line,#d7e1ea);background:#fafcfe}",
  ".cc-easy-table td{padding:11px 12px;border-bottom:1px solid #eef2f6;vertical-align:middle}",
  ".cc-easy-table th.num,.cc-easy-table td.num{text-align:right;font-variant-numeric:tabular-nums}",
  ".cc-easy-table tr[data-cc-client]{cursor:pointer}",
  ".cc-easy-table tr[data-cc-client]:hover td{background:#f4f8fc}",
  ".cc-easy-bad{color:#b42318;font-weight:750}",
  ".cc-easy-warn{color:#ad6b05;font-weight:750}",
  ".cc-easy-ok{color:#11875c;font-weight:750}",
  ".cc-easy-sentence{font-size:1.08rem;line-height:1.5;color:var(--navy,#0b1f33);margin:0 0 14px}",
  ".cc-easy-back{margin:0 0 12px}",
  "@media(max-width:800px){.cc-easy-kpis{grid-template-columns:1fr}}",
  "</style>",
  '<p class="lead cc-easy-lead" id="commandLead">Month to date, in three numbers. Money is sales and store profit. Spending is what the store bought against its purchase budget. Margin is store profit divided by sales. The target margin is 40%.</p>',
  '<p class="cc-easy-situation" id="commandSituation">Loading…</p>',
  '<div class="cc-easy-kpis" id="commandSimpleKpis">',
  '<div class="cc-kpi" id="ccMoneyCard"><span class="lbl">Money</span><span class="val" id="ccMoneyVal">—</span><span class="sub" id="ccMoneySub">Store profit on sales</span></div>',
  '<div class="cc-kpi" id="ccSpendCard"><span class="lbl">Spending</span><span class="val" id="ccSpendVal">—</span><span class="sub" id="ccSpendSub">Bought vs purchase budget</span></div>',
  '<div class="cc-kpi" id="ccMarginCard"><span class="lbl">Margin</span><span class="val" id="ccMarginVal">—</span><span class="sub" id="ccMarginSub">Store profit ÷ sales · target 40%</span></div>',
  "</div>",
  '<div id="commandAllWrap">',
  '<h3 class="cc-easy-h">All clients</h3>',
  '<div class="cc-easy-table-wrap" id="commandAllTable"><p class="cc-empty">Loading…</p></div>',
  '<p class="hint" id="commandHint">Click a client to see that store only. Dollars are rounded. Paradise and ExtraMile have no purchase budget.</p>',
  "</div>",
  '<div id="commandClientWrap" hidden>',
  '<button type="button" class="btn ghost cc-easy-back" id="commandBackAll">All clients</button>',
  '<h3 class="cc-easy-h" id="commandClientTitle">Client</h3>',
  '<p class="cc-easy-sentence" id="commandClientSentence"></p>',
  "</div>"
].join("");

function ssPageBuildCommandCenter() {
  var host = document.getElementById("commandAllTable");
  var situation = document.getElementById("commandSituation");
  if (!host) {
    if (typeof buildCommandCenterLegacy === "function") return buildCommandCenterLegacy();
    return;
  }
  if (typeof role !== "undefined" && role !== "admin") {
    host.innerHTML = '<p class="cc-empty">Admin only.</p>';
    if (situation) situation.textContent = "Command Center is for the admin view.";
    return;
  }
  if (!DATA || !DATA.ready) {
    host.innerHTML = '<p class="cc-empty">Loading…</p>';
    if (situation) situation.textContent = "Loading the daily book…";
    return;
  }

  function gasFor(id) {
    var stations = (DATA.daily && DATA.daily.stations) || [];
    var gas = 0;
    var found = false;
    stations.forEach(function (st) {
      if (id && String(st.id) !== String(id)) return;
      (st.days || []).forEach(function (d) {
        if (d && d.gas_profit != null && Number.isFinite(Number(d.gas_profit))) {
          gas += Number(d.gas_profit);
          found = true;
        }
      });
    });
    return found ? gas : 0;
  }

  function dailyPurch(id) {
    var stations = (DATA.daily && DATA.daily.stations) || [];
    var sum = 0;
    var found = false;
    stations.forEach(function (st) {
      if (String(st.id) !== String(id)) return;
      found = true;
      (st.days || []).forEach(function (d) {
        if (d && d.purch != null && Number.isFinite(Number(d.purch))) sum += Number(d.purch);
      });
    });
    return found ? sum : null;
  }

  function clients() {
    var filterIds = (typeof commandFilterStoreIds === "function") ? commandFilterStoreIds() : null;
    var margins = (typeof commandCstoreMarginRows === "function") ? commandCstoreMarginRows(filterIds) : [];
    var spendRows = (typeof commandStoreRows === "function") ? commandStoreRows(filterIds) : [];
    var spendBy = {};
    spendRows.forEach(function (r) { if (r && r.id) spendBy[String(r.id)] = r; });
    var dailyIds = null;
    if (DATA.daily && Array.isArray(DATA.daily.stations) && DATA.daily.stations.length) {
      dailyIds = {};
      DATA.daily.stations.forEach(function (st) { if (st && st.id) dailyIds[String(st.id)] = true; });
    }
    var out = [];
    margins.forEach(function (m) {
      if (!m || !m.id) return;
      var id = String(m.id);
      if (id === "42642") return;
      if (dailyIds && !dailyIds[id]) return;
      var s = spendBy[id] || {};
      var sales = m.sales != null ? Number(m.sales) : 0;
      var profit = m.profit != null ? Number(m.profit) : 0;
      var fromBook = dailyPurch(id);
      var bought = fromBook != null ? fromBook : (s.spent != null && Number.isFinite(Number(s.spent)) ? Number(s.spent) : 0);
      var budget = (s.budget != null && Number(s.budget) > 0) ? Number(s.budget) : null;
      var left = budget != null ? (budget - bought) : null;
      var margin = sales > 0 ? (profit / sales) : null;
      if (!(sales > 0) && !(bought > 0)) return;
      out.push({
        id: id,
        name: m.name || s.name || id,
        sales: sales,
        profit: profit,
        bought: bought,
        budget: budget,
        left: left,
        margin: margin,
        gas: gasFor(id)
      });
    });
    out.sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" });
    });
    return out;
  }

  function marginClass(margin) {
    if (margin == null) return "";
    if (margin < 0) return "cc-easy-bad";
    if (margin < 0.4) return "cc-easy-warn";
    return "cc-easy-ok";
  }

  function marginText(margin) {
    if (margin == null || !Number.isFinite(margin)) return "—";
    return (margin * 100).toFixed(1) + "%";
  }

  function note(c) {
    var moneyPart = "Margin OK";
    if (c.margin == null) moneyPart = "No sales";
    else if (c.margin < 0) moneyPart = "Losing money";
    else if (c.margin < 0.4) moneyPart = "Below 40%";
    var spendPart = "no purchase budget";
    if (c.budget != null) spendPart = c.left < 0 ? "over budget" : "within budget";
    return moneyPart + " · " + spendPart;
  }

  function paintCards(sales, profit, bought, budget, margin, below, total, gas) {
    var moneyVal = document.getElementById("ccMoneyVal");
    var moneySub = document.getElementById("ccMoneySub");
    var spendVal = document.getElementById("ccSpendVal");
    var spendSub = document.getElementById("ccSpendSub");
    var marginVal = document.getElementById("ccMarginVal");
    var marginSub = document.getElementById("ccMarginSub");
    if (moneyVal) moneyVal.textContent = money(profit);
    if (moneySub) {
      var totalProfit = profit + (gas || 0);
      moneySub.textContent = "Store profit on " + money(sales) + " sales · total profit " + money(totalProfit) + " with gas";
    }
    if (spendVal) spendVal.textContent = money(bought);
    if (spendSub) {
      if (budget != null) {
        var gap = budget - bought;
        spendSub.textContent = (gap < 0 ? (money(Math.abs(gap)) + " over") : (money(gap) + " left")) + " on a " + money(budget) + " purchase budget";
      } else {
        spendSub.textContent = "No purchase budget for this view";
      }
    }
    if (marginVal) {
      marginVal.textContent = marginText(margin);
      marginVal.className = "val " + marginClass(margin);
    }
    if (marginSub) {
      if (below != null && total != null) {
        marginSub.textContent = below + " of " + total + " clients below the 40% target";
      } else if (margin != null && margin >= 0.4) {
        marginSub.textContent = "At or above the 40% target";
      } else if (margin != null) {
        marginSub.textContent = "Below the 40% target";
      } else {
        marginSub.textContent = "Target is 40%";
      }
    }
  }

  function sentence(c) {
    var marginBit = "Margin is not available.";
    if (c.margin != null && c.margin < 0) marginBit = "Margin is " + marginText(c.margin) + ", so the store is losing money on c-store sales. The target is 40%.";
    else if (c.margin != null && c.margin < 0.4) marginBit = "Margin is " + marginText(c.margin) + ", below the 40% target.";
    else if (c.margin != null) marginBit = "Margin is " + marginText(c.margin) + ", at or above the 40% target.";
    var spendBit = "Bought " + money(c.bought) + ". No purchase budget is set.";
    if (c.budget != null && c.left < 0) spendBit = "Bought " + money(c.bought) + " of a " + money(c.budget) + " purchase budget, " + money(Math.abs(c.left)) + " over.";
    else if (c.budget != null) spendBit = "Bought " + money(c.bought) + " of a " + money(c.budget) + " purchase budget, " + money(c.left) + " left.";
    var totalProfit = c.profit + (c.gas || 0);
    return c.name + " made " + money(c.profit) + " store profit on " + money(c.sales) + " sales. " + marginBit + " " + spendBit + " Total profit with gas is " + money(totalProfit) + ".";
  }

  var rows = clients();
  var filterIds = (typeof commandFilterStoreIds === "function") ? commandFilterStoreIds() : null;
  var single = filterIds && filterIds.length === 1 ? String(filterIds[0]) : null;
  var selected = single;
  if (!selected && typeof _ccSelectedStoreId !== "undefined" && _ccSelectedStoreId) {
    if (rows.some(function (r) { return r.id === String(_ccSelectedStoreId); })) selected = String(_ccSelectedStoreId);
  }
  var through = (typeof booksThrough === "function") ? booksThrough() : "";
  var meta = document.getElementById("commandMeta");
  var allWrap = document.getElementById("commandAllWrap");
  var clientWrap = document.getElementById("commandClientWrap");
  var chosen = selected ? rows.filter(function (r) { return r.id === selected; })[0] : null;

  if (selected && !chosen) selected = null;

  if (!selected) {
    var sales = 0, profit = 0, bought = 0, budget = 0, hasBudget = false, gas = 0, below = 0;
    rows.forEach(function (r) {
      sales += r.sales;
      profit += r.profit;
      bought += r.bought;
      gas += r.gas || 0;
      if (r.budget != null) { budget += r.budget; hasBudget = true; }
      if (r.margin == null || r.margin < 0.4) below += 1;
    });
    var margin = sales > 0 ? profit / sales : null;
    paintCards(sales, profit, bought, hasBudget ? budget : null, margin, below, rows.length, gas);
    if (situation) {
      var spendWords = hasBudget
        ? ("Bought " + money(bought) + ". Purchase budget " + money(budget) + ", " + (budget - bought < 0 ? (money(Math.abs(budget - bought)) + " over.") : (money(budget - bought) + " left.")))
        : ("Bought " + money(bought) + ".");
      situation.textContent = rows.length + " clients through " + (through || "the latest posted day") + ". Store profit " + money(profit) + " on sales " + money(sales) + ". Margin " + marginText(margin) + ". " + spendWords;
    }
    if (meta) meta.textContent = "All clients · through " + (through || "latest posted day");
    if (allWrap) allWrap.hidden = false;
    if (clientWrap) clientWrap.hidden = true;
    if (!rows.length) {
      host.innerHTML = '<p class="cc-empty">No clients in this view.</p>';
      return;
    }
    var body = rows.map(function (r) {
      var leftTxt = r.budget == null ? "—" : (r.left < 0 ? money(r.left) : money(r.left));
      var leftCls = r.budget != null && r.left < 0 ? " cc-easy-bad" : "";
      return '<tr data-cc-client="' + r.id + '">' +
        '<td><strong>' + r.name + '</strong></td>' +
        '<td class="num">' + money(r.sales) + '</td>' +
        '<td class="num">' + money(r.profit) + '</td>' +
        '<td class="num ' + marginClass(r.margin) + '">' + marginText(r.margin) + '</td>' +
        '<td class="num">' + money(r.bought) + '</td>' +
        '<td class="num">' + (r.budget != null ? money(r.budget) : "—") + '</td>' +
        '<td class="num' + leftCls + '">' + leftTxt + '</td>' +
        '<td>' + note(r) + '</td>' +
        '</tr>';
    }).join("");
    host.innerHTML = '<table class="cc-easy-table" aria-label="All clients month to date"><thead><tr>' +
      '<th>Client</th><th class="num">Sales</th><th class="num">Store profit</th><th class="num">Margin</th>' +
      '<th class="num">Bought</th><th class="num">Budget</th><th class="num">Left</th><th>Situation</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table>';
    host.querySelectorAll("[data-cc-client]").forEach(function (tr) {
      tr.addEventListener("click", function () {
        _ccSelectedStoreId = String(tr.getAttribute("data-cc-client") || "");
        buildCommandCenter();
        try {
          var view = document.getElementById("view-command");
          if (view) view.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (e) {}
      });
    });
    return;
  }

  paintCards(chosen.sales, chosen.profit, chosen.bought, chosen.budget, chosen.margin, null, null, chosen.gas);
  if (situation) situation.textContent = "";
  if (meta) meta.textContent = chosen.name + " · through " + (through || "latest posted day");
  if (allWrap) allWrap.hidden = true;
  if (clientWrap) clientWrap.hidden = false;
  var title = document.getElementById("commandClientTitle");
  var line = document.getElementById("commandClientSentence");
  if (title) title.textContent = chosen.name;
  if (line) line.textContent = sentence(chosen);
  var back = document.getElementById("commandBackAll");
  if (back) {
    back.hidden = !!single;
    back.onclick = function () {
      _ccSelectedStoreId = null;
      buildCommandCenter();
    };
  }
}

function ssSimplifyCommandCenter(html) {
  if (!html || html.indexOf("ss-command-simple-v1") >= 0) return html;
  var lead = '<p class="lead" id="commandLead">';
  var hint = '<p class="hint" id="commandHint">';
  var fn = "function buildCommandCenter()";
  var a = html.indexOf(lead);
  var b = html.indexOf(hint);
  var c = html.indexOf(fn);
  if (a < 0 || b < a || c < 0) return html;
  var bend = html.indexOf("</p>", b);
  if (bend < 0) return html;
  html = html.replace(
    'data-title="Command Center" data-sub="Category risk — budget, buy vs sell, margin. Admin only."',
    'data-title="Command Center" data-sub="All clients, then one client: money, spending, and margin."'
  );
  a = html.indexOf(lead);
  b = html.indexOf(hint);
  bend = html.indexOf("</p>", b);
  if (a < 0 || b < a || bend < 0) return html;
  bend += 4;
  html = html.slice(0, a) + SS_COMMAND_VIEW_HTML + html.slice(bend);
  c = html.indexOf(fn);
  if (c < 0) return html;
  var src = ssPageBuildCommandCenter.toString().replace(
    "function ssPageBuildCommandCenter",
    "function buildCommandCenter"
  );
  return html.slice(0, c) + src + "\n      function buildCommandCenterLegacy()" + html.slice(c + fn.length);
}
/* ss-daily-refresh-v1-end */
