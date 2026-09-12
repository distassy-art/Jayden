/* Portfolio table across every store, and the single-store drill-down. */

import {
  barList, change, dateLabel, deltaBadge, downloadCsv, emptyState, esc, icon,
  isNum, lineChart, money, moneyShort, monthLabel, num, pct, sparkline,
} from "../ui.js";
import { seriesFor, stationScorecards, sumMonths } from "../analytics.js";

const COLUMNS = [
  { key: "name", label: "Store", align: "left" },
  { key: "totalProfit", label: "Total profit", align: "right" },
  { key: "profitDelta", label: "vs LY", align: "right" },
  { key: "fuelProfit", label: "Fuel profit", align: "right" },
  { key: "sales", label: "Store sales", align: "right" },
  { key: "storeProfit", label: "Store profit", align: "right" },
  { key: "margin", label: "Margin", align: "right" },
  { key: "gasVol", label: "Gallons", align: "right" },
];

function scoreValue(card, key) {
  const month = card.month || {};
  switch (key) {
    case "name": return card.station.name.toLowerCase();
    case "totalProfit": return num_(month.total_profit);
    case "profitDelta": return num_(card.totalProfitDelta);
    case "fuelProfit": return num_(month.fuel_profit ?? month.gas_profit);
    case "sales": return num_(month.sales);
    case "storeProfit": return num_(month.store_profit);
    case "margin": return num_(month.store_margin);
    case "gasVol": return num_(month.gas_vol);
    default: return 0;
  }
}

function num_(value) {
  return isNum(value) ? Number(value) : Number.NEGATIVE_INFINITY;
}

export function renderStores(ctx) {
  const { model, query } = ctx;
  const sortKey = query.get("sort") || "totalProfit";
  const dir = query.get("dir") === "asc" ? "asc" : "desc";
  const search = (query.get("q") || "").trim().toLowerCase();
  const period = query.get("period") === "ytd" ? "ytd" : "month";

  let cards = stationScorecards(model);
  if (search) {
    cards = cards.filter((card) => `${card.station.name} ${card.station.id}`.toLowerCase().includes(search));
  }

  // In year-to-date mode the same table reads from the YTD roll-up instead.
  const view = cards.map((card) => (period === "ytd"
    ? { ...card, month: card.ytd, prior: card.priorYtd, totalProfitDelta: card.ytdProfitDelta }
    : card));

  view.sort((a, b) => {
    const delta = scoreValue(a, sortKey) > scoreValue(b, sortKey) ? 1
      : scoreValue(a, sortKey) < scoreValue(b, sortKey) ? -1 : 0;
    return dir === "asc" ? delta : -delta;
  });

  const periodLabel = period === "ytd"
    ? `${model.currentYear} year to date`
    : monthLabel(model.latestMonth);

  const totals = view.reduce((acc, card) => {
    ["total_profit", "fuel_profit", "sales", "store_profit", "gas_vol"].forEach((key) => {
      if (isNum(card.month?.[key])) acc[key] = (acc[key] || 0) + Number(card.month[key]);
    });
    return acc;
  }, {});
  totals.margin = totals.sales ? totals.store_profit / totals.sales : null;

  const head = COLUMNS.map((col) => {
    const active = col.key === sortKey;
    const nextDir = active && dir === "desc" ? "asc" : "desc";
    const params = new URLSearchParams(query);
    params.set("sort", col.key);
    params.set("dir", nextDir);
    return `<th class="sortable${active ? " is-sorted" : ""}${col.align === "right" ? " num" : ""}"
      data-sort-href="#/stores?${esc(params.toString())}">${esc(col.label)}
      <span class="sort-ind">${active ? (dir === "desc" ? "↓" : "↑") : "↕"}</span></th>`;
  }).join("");

  const rows = view.map((card) => {
    const month = card.month || {};
    const filed = period === "ytd" ? isNum(month.total_profit) : card.filed;
    if (!filed) {
      return `<tr class="is-clickable" data-href="#/store/${esc(card.station.id)}">
        <td><div class="cell-main"><span class="store-tag">${esc(card.station.id)}</span>
          <span class="strong">${esc(card.station.name)}</span></div></td>
        <td colspan="7" class="muted">Has not closed ${esc(monthLabel(model.latestMonth, true))}</td>
      </tr>`;
    }
    return `<tr class="is-clickable" data-href="#/store/${esc(card.station.id)}">
      <td><div class="cell-main"><span class="store-tag">${esc(card.station.id)}</span>
        <span class="strong">${esc(card.station.name)}</span></div></td>
      <td class="num strong">${esc(money(month.total_profit))}</td>
      <td class="num">${deltaBadge(card.totalProfitDelta)}</td>
      <td class="num">${esc(money(month.fuel_profit ?? month.gas_profit))}</td>
      <td class="num">${esc(money(month.sales))}</td>
      <td class="num${Number(month.store_profit) < 0 ? " neg-text strong" : ""}">${esc(money(month.store_profit))}</td>
      <td class="num">${esc(pct(month.store_margin))}</td>
      <td class="num muted">${esc(num(month.gas_vol))}</td>
    </tr>`;
  }).join("");

  return `
    <div class="page-head">
      <h2>Stores</h2>
      <p>Every store in the portfolio for <b>${esc(periodLabel)}</b>. Select a row for the full history.</p>
    </div>

    <section class="card">
      <div class="card-head">
        <div class="segmented" data-period>
          <button class="${period === "month" ? "is-active" : ""}" data-period-value="month">${esc(monthLabel(model.latestMonth, true))}</button>
          <button class="${period === "ytd" ? "is-active" : ""}" data-period-value="ytd">Year to date</button>
        </div>
        <span class="spacer"></span>
        <div class="search">
          ${icon("search")}
          <input class="input" id="storeSearch" type="search" placeholder="Filter stores…"
            value="${esc(query.get("q") || "")}" aria-label="Filter stores">
        </div>
        <button class="btn btn-sm" id="storesCsv">${icon("download")}CSV</button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr>${head}</tr></thead>
          <tbody>${rows || `<tr><td colspan="8">${emptyState("No stores match that filter")}</td></tr>`}</tbody>
          <tfoot><tr>
            <td>${esc(view.length)} store${view.length === 1 ? "" : "s"}</td>
            <td class="num">${esc(money(totals.total_profit))}</td>
            <td></td>
            <td class="num">${esc(money(totals.fuel_profit))}</td>
            <td class="num">${esc(money(totals.sales))}</td>
            <td class="num">${esc(money(totals.store_profit))}</td>
            <td class="num">${esc(pct(totals.margin))}</td>
            <td class="num">${esc(num(totals.gas_vol))}</td>
          </tr></tfoot>
        </table>
      </div>
    </section>
  `;
}

export function bindStores(root, ctx) {
  const { navigate, query, model } = ctx;

  root.querySelectorAll("[data-sort-href]").forEach((th) => {
    th.addEventListener("click", () => navigate(th.dataset.sortHref));
  });

  root.querySelectorAll("[data-period-value]").forEach((button) => {
    button.addEventListener("click", () => {
      const params = new URLSearchParams(query);
      params.set("period", button.dataset.periodValue);
      navigate(`#/stores?${params.toString()}`);
    });
  });

  const search = root.querySelector("#storeSearch");
  if (search) {
    let timer;
    search.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const params = new URLSearchParams(query);
        if (search.value.trim()) params.set("q", search.value.trim());
        else params.delete("q");
        navigate(`#/stores?${params.toString()}`, { keepFocus: "#storeSearch" });
      }, 220);
    });
  }

  const csv = root.querySelector("#storesCsv");
  if (csv) {
    csv.addEventListener("click", () => {
      const cards = stationScorecards(model);
      downloadCsv(
        `smart-solutions-stores-${model.latestMonth || "latest"}.csv`,
        ["Store", "Name", "Month", "Total profit", "Fuel profit", "Store sales", "Store profit", "Margin", "Gallons"],
        cards.map((card) => [
          card.station.id, card.station.name, model.latestMonth || "",
          card.month?.total_profit ?? "", card.month?.fuel_profit ?? "",
          card.month?.sales ?? "", card.month?.store_profit ?? "",
          card.month?.store_margin ?? "", card.month?.gas_vol ?? "",
        ]),
      );
    });
  }
}

/* -------------------------------------------------------------------------
   Single store
   ------------------------------------------------------------------------- */

export function renderStore(ctx) {
  const { model, params } = ctx;
  const station = model.byId.get(String(params.id));
  if (!station) {
    return `<div class="page-head"><h2>Store not found</h2>
      <p>No store with id <b>${esc(params.id)}</b> is present in the books feed.</p></div>
      <a class="btn" href="#/stores">${icon("back")}Back to stores</a>`;
  }

  const keys = model.closedMonths.filter((key) => station.months[key]);
  const latest = station.lastMonth ? station.months[station.lastMonth] : null;
  const yearAgoKey = station.lastMonth
    ? `${Number(station.lastMonth.slice(0, 4)) - 1}-${station.lastMonth.slice(5)}`
    : null;
  const yearAgo = yearAgoKey ? station.months[yearAgoKey] : null;

  const ytd = sumMonths(station, model.ytdKeys);
  const priorYtd = sumMonths(station, model.priorYtdKeys);

  const trendKeys = model.closedMonths.slice(-24);
  const trend = lineChart(
    trendKeys.map((key) => monthLabel(key, true)),
    [
      { name: "Fuel profit", color: "var(--cyan-500)", values: seriesFor(station, trendKeys, "fuel_profit") },
      { name: "Store profit", color: "var(--navy-600)", values: seriesFor(station, trendKeys, "store_profit") },
    ],
    { height: 260 },
  );

  const buyVsSell = lineChart(
    trendKeys.map((key) => monthLabel(key, true)),
    [
      { name: "Store sales", color: "var(--cyan-500)", values: seriesFor(station, trendKeys, "sales") },
      { name: "Purchases", color: "var(--warn-line)", values: seriesFor(station, trendKeys, "purchases") },
    ],
    { height: 220 },
  );

  const recentDays = station.days.slice(-31).reverse();
  const dayRows = recentDays.map((day) => `<tr>
    <td class="nowrap">${esc(dateLabel(day.date, { weekday: true }))}</td>
    <td class="num">${esc(num(day.gas_vol))}</td>
    <td class="num">${esc(money(day.gas_profit))}</td>
    <td class="num">${esc(money(day.sales))}</td>
    <td class="num">${esc(money(day.purch))}</td>
    <td class="num${Number(day.store_profit) < 0 ? " neg-text strong" : ""}">${esc(money(day.store_profit))}</td>
    <td class="num">${esc(pct(day.margin))}</td>
    <td class="num strong">${esc(money(day.total_profit))}</td>
  </tr>`).join("");

  const departments = station.departments.slice()
    .sort((a, b) => Number(b.y2026?.profit || 0) - Number(a.y2026?.profit || 0));

  const deptRows = departments.map((dept) => {
    const now = dept.y2026 || {};
    const before = dept.y2025 || {};
    return `<tr>
      <td class="strong">${esc(dept.name)}</td>
      <td class="num">${esc(money(now.sales))}</td>
      <td class="num">${esc(money(now.purchases))}</td>
      <td class="num${Number(now.profit) < 0 ? " neg-text strong" : ""}">${esc(money(now.profit))}</td>
      <td class="num">${esc(pct(now.margin))}</td>
      <td class="num muted">${esc(pct(before.margin))}</td>
      <td class="num">${deltaBadge(isNum(now.margin) && isNum(before.margin)
        ? (Number(now.margin) - Number(before.margin)) * 100 : null, { suffix: " pts" })}</td>
    </tr>`;
  }).join("");

  const deptRanking = departments.slice(0, 10).map((dept) => ({
    label: dept.name,
    value: Number(dept.y2026?.profit || 0),
  }));

  return `
    <div class="page-head">
      <a class="btn btn-sm btn-ghost" href="#/stores" style="margin-bottom:10px">${icon("back")}All stores</a>
      <h2>${esc(station.name)} <span class="store-tag" style="font-size:13px;vertical-align:3px">${esc(station.id)}</span></h2>
      <p>${esc(keys.length)} closed month${keys.length === 1 ? "" : "s"} on file${station.lastMonth ? `, latest <b>${esc(monthLabel(station.lastMonth))}</b>` : ""}.
      ${station.lastDay ? `Daily figures through ${esc(dateLabel(station.lastDay))}.` : ""}</p>
    </div>

    <div class="grid cols-4" style="margin-bottom:16px">
      ${storeStat("Total profit", latest?.total_profit, yearAgo?.total_profit, seriesFor(station, trendKeys, "total_profit"))}
      ${storeStat("Fuel profit", latest?.fuel_profit ?? latest?.gas_profit, yearAgo?.fuel_profit ?? yearAgo?.gas_profit, seriesFor(station, trendKeys, "fuel_profit"))}
      ${storeStat("Store sales", latest?.sales, yearAgo?.sales, seriesFor(station, trendKeys, "sales"))}
      ${storeStat("Store profit", latest?.store_profit, yearAgo?.store_profit, seriesFor(station, trendKeys, "store_profit"))}
    </div>

    <div class="grid split" style="margin-bottom:16px">
      <section class="card">
        <div class="card-head"><h3>Profit history</h3><span class="hint">Last ${trendKeys.length} months</span></div>
        <div class="card-body">${trend}</div>
      </section>
      <section class="card">
        <div class="card-head"><h3>Year to date</h3><span class="hint">${esc(model.currentYear)} vs prior year</span></div>
        <div class="card-body stack">
          ${ytdLine("Total profit", ytd.total_profit, priorYtd.total_profit)}
          ${ytdLine("Fuel profit", ytd.fuel_profit, priorYtd.fuel_profit)}
          ${ytdLine("Store sales", ytd.sales, priorYtd.sales)}
          ${ytdLine("Purchases", ytd.purchases, priorYtd.purchases, false)}
          ${ytdLine("Store profit", ytd.store_profit, priorYtd.store_profit)}
          ${ytdLine("Gallons", ytd.gas_vol, priorYtd.gas_vol, true, num)}
        </div>
      </section>
    </div>

    <section class="card" style="margin-bottom:16px">
      <div class="card-head">
        <h3>Buying against selling</h3>
        <span class="hint">Purchases tracking store sales is the whole game — a gap that opens up is margin walking out</span>
      </div>
      <div class="card-body">${buyVsSell}</div>
    </section>

    ${departments.length ? `
    <div class="grid split" style="margin-bottom:16px">
      <section class="card">
        <div class="card-head">
          <h3>Departments</h3>
          <span class="hint">${esc(station.deptPeriods.y2026)} against ${esc(station.deptPeriods.y2025)}</span>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr>
              <th>Department</th><th class="num">Sales</th><th class="num">Purchases</th>
              <th class="num">Profit</th><th class="num">Margin</th><th class="num">Prior</th><th class="num">Change</th>
            </tr></thead>
            <tbody>${deptRows}</tbody>
          </table>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h3>Profit by department</h3><span class="hint">${esc(station.deptPeriods.y2026)}</span></div>
        <div class="card-body">${barList(deptRanking)}</div>
      </section>
    </div>` : ""}

    <section class="card">
      <div class="card-head">
        <h3>Recent days</h3>
        <span class="hint">Most recent ${esc(recentDays.length)} days on file</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr>
            <th>Date</th><th class="num">Gallons</th><th class="num">Fuel profit</th>
            <th class="num">Sales</th><th class="num">Purchases</th><th class="num">Store profit</th>
            <th class="num">Margin</th><th class="num">Total</th>
          </tr></thead>
          <tbody>${dayRows || `<tr><td colspan="8">${emptyState("No daily figures on file")}</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;
}

function storeStat(label, value, prior, series) {
  return `<div class="stat">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value${Number(value) < 0 ? " neg-text" : ""}">${esc(money(value))}</div>
    <div class="stat-foot">${deltaBadge(change(value, prior))}<span>vs same month last year</span></div>
    ${sparkline(series)}
  </div>`;
}

function ytdLine(label, current, prior, higherIsBetter = true, format = money) {
  return `<div class="row" style="justify-content:space-between;gap:8px">
    <span class="tiny muted">${esc(label)}</span>
    <span class="row" style="gap:8px">
      <b class="num">${esc(format(current))}</b>
      ${deltaBadge(change(current, prior), { higherIsBetter })}
    </span>
  </div>`;
}
