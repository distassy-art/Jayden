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

async function ssServeSiteBooks(request, env, pathname) {
  if (!request || (request.method !== "GET" && request.method !== "HEAD")) return null;
  var base = await ssReadAssetJson(env, request, pathname);
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
  } else if (pathname === "/data/manager.json" || pathname === "/manager.json") {
    out = ssRefreshManager(base, totals, daily.through);
  } else {
    return null;
  }
  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers: ssJsonResponse(out, "books-overlay").headers });
  }
  return ssJsonResponse(out, "books-overlay");
}
/* ss-daily-refresh-v1-end */
