/*
 * The top of the hierarchy: the clients Smart Solutions files for.
 *
 * The old console jumped straight from "the portfolio" to a flat list of
 * seventeen stores, so there was no way to answer "how is Big Daddy doing" —
 * the question you actually have before a client call. These two pages put the
 * owner in between, and every other page can be scoped to one from here.
 */

import {
  barList, change, deltaBadge, downloadCsv, emptyState, esc, icon, isNum,
  lineChart, money, moneyShort, monthLabel, num, pct, perGallon, sparkline,
} from "../ui.js";
import {
  MONTH_ABBR, marginSeries, scopeTotals, yearSeries,
} from "../analytics.js";
import { withScope } from "../scope.js";

const CYAN = "var(--cyan-500)";
const NAVY = "var(--navy-600)";

/** Year-to-date and prior-year roll-up for one owner group. */
function ownerRow(model, owner) {
  const year = Number(model.currentYear);
  const ytd = scopeTotals(model, year, owner.stationIds);
  const prior = scopeTotals(model, year - 1, owner.stationIds);
  return {
    owner,
    ytd,
    prior,
    profitDelta: change(ytd.total_profit, prior.total_profit),
    // Not every store files every month; saying so is better than a silent gap.
    behind: owner.stations.filter((s) => s.monthKeys.length && !s.months[model.latestMonth]),
    trend: model.closedMonths.slice(-12).map((key) => {
      let total = null;
      owner.stations.forEach((station) => {
        const entry = station.months[key];
        if (entry && isNum(entry.total_profit)) total = (total || 0) + Number(entry.total_profit);
      });
      return total;
    }),
  };
}

/* -------------------------------------------------------------------------
   All owners
   ------------------------------------------------------------------------- */

export function renderOwners(ctx) {
  const { model } = ctx;
  const owners = model.owners || [];

  if (!owners.length) {
    return `<div class="page-head"><h2>Owners</h2></div>
      <section class="card"><div class="card-body">
        ${emptyState("No client accounts found", "The account directory could not be read, so stores cannot be grouped by owner.")}
      </div></section>`;
  }

  const rows = owners.map((owner) => ownerRow(model, owner))
    .sort((a, b) => Number(b.ytd.total_profit || 0) - Number(a.ytd.total_profit || 0));

  const year = Number(model.currentYear);
  const all = scopeTotals(model, year);
  const allPrior = scopeTotals(model, year - 1);
  const growing = rows.filter((row) => isNum(row.profitDelta) && row.profitDelta > 0).length;

  const table = rows.map((row) => `<tr class="is-clickable" data-href="#/owner/${esc(row.owner.id)}">
    <td>
      <div class="cell-main">
        <span class="avatar avatar-sm">${esc(row.owner.client.slice(0, 1).toUpperCase())}</span>
        <span>
          <b>${esc(row.owner.client)}</b>
          <span class="cell-sub">${esc(row.owner.stations.length)} store${row.owner.stations.length === 1 ? "" : "s"}${
            row.behind.length ? ` · ${esc(row.behind.length)} not closed` : ""}</span>
        </span>
      </div>
    </td>
    <td class="num strong">${esc(money(row.ytd.total_profit))}</td>
    <td class="num">${deltaBadge(row.profitDelta)}</td>
    <td class="num">${esc(money(row.ytd.fuel_profit))}</td>
    <td class="num${Number(row.ytd.store_profit) < 0 ? " neg-text" : ""}">${esc(money(row.ytd.store_profit))}</td>
    <td class="num">${esc(pct(row.ytd.store_margin))}</td>
    <td class="num">${esc(num(row.ytd.gas_vol))}</td>
    <td class="num">${esc(perGallon(row.ytd.gas_margin))}</td>
    <td class="spark">${sparkline(row.trend)}</td>
  </tr>`).join("");

  return `
    <div class="page-head">
      <h2>Owners</h2>
      <p>The ${esc(owners.length)} clients Smart Solutions files for, rolled up across every store they own.
        Open one to scope the whole console to that client.</p>
    </div>

    <div class="grid cols-4" style="margin-bottom:16px">
      <div class="stat">
        <div class="stat-label">Clients</div>
        <div class="stat-value">${esc(num(owners.length))}</div>
        <div class="stat-foot"><span class="muted">${esc(model.stations.length)} stores between them</span></div>
      </div>
      <div class="stat">
        <div class="stat-label">Total profit</div>
        <div class="stat-value">${esc(money(all.total_profit))}</div>
        <div class="stat-foot">${deltaBadge(change(all.total_profit, allPrior.total_profit))}
          <span>${esc(model.currentYear)} to ${esc(monthLabel(model.latestMonth, true))}</span></div>
      </div>
      <div class="stat">
        <div class="stat-label">Growing on last year</div>
        <div class="stat-value">${esc(growing)} of ${esc(rows.length)}</div>
        <div class="stat-foot"><span class="muted">${rows.length - growing
          ? `${esc(rows.length - growing)} behind last year` : "Every client ahead"}</span></div>
      </div>
      <div class="stat">
        <div class="stat-label">Largest client</div>
        <div class="stat-value" style="font-size:22px">${esc(rows[0]?.owner.client || "—")}</div>
        <div class="stat-foot"><span class="muted">${rows[0]
          ? `${esc(pct((rows[0].ytd.total_profit || 0) / (all.total_profit || 1), { digits: 0 }))} of portfolio profit`
          : ""}</span></div>
      </div>
    </div>

    <section class="card" style="margin-bottom:16px">
      <div class="card-head"><h3>Profit by client</h3>
        <span class="hint">${esc(model.currentYear)} year to date</span></div>
      <div class="card-body">${barList(rows.map((row) => ({
        label: row.owner.client,
        value: row.ytd.total_profit,
        href: `#/owner/${row.owner.id}`,
      })))}</div>
    </section>

    <section class="card">
      <div class="card-head"><h3>All clients</h3>
        <span class="hint">Year to date, against the same months last year</span></div>
      <div class="table-wrap"><table class="table">
        <thead><tr>
          <th>Client</th><th class="num">Total profit</th><th class="num">vs LY</th>
          <th class="num">Fuel</th><th class="num">Store</th><th class="num">Margin</th>
          <th class="num">Gallons</th><th class="num">$/gal</th><th>12 months</th>
        </tr></thead>
        <tbody>${table}</tbody>
        <tfoot><tr>
          <td>${esc(model.stations.length)} stores</td>
          <td class="num">${esc(money(all.total_profit))}</td>
          <td class="num">${deltaBadge(change(all.total_profit, allPrior.total_profit))}</td>
          <td class="num">${esc(money(all.fuel_profit))}</td>
          <td class="num">${esc(money(all.store_profit))}</td>
          <td class="num">${esc(pct(all.store_margin))}</td>
          <td class="num">${esc(num(all.gas_vol))}</td>
          <td class="num">${esc(perGallon(all.gas_margin))}</td>
          <td></td>
        </tr></tfoot>
      </table></div>
    </section>`;
}

/* -------------------------------------------------------------------------
   One owner
   ------------------------------------------------------------------------- */

export function renderOwner(ctx) {
  const { model, params, scope } = ctx;
  const owner = (model.owners || []).find((o) => o.id === String(params.id));

  if (!owner) {
    return `<div class="page-head"><h2>Owner not found</h2></div>
      <section class="card"><div class="card-body">
        ${emptyState("No such client", "It may have been renamed, or this account cannot see it.")}
        <a class="btn btn-sm" href="#/owners" style="margin-top:12px">${icon("back")}All owners</a>
      </div></section>`;
  }

  const year = Number(model.currentYear);
  const row = ownerRow(model, owner);
  const { ytd, prior } = row;

  const total6 = yearSeries(model, year, "total_profit", owner.stationIds);
  const total5 = yearSeries(model, year - 1, "total_profit", owner.stationIds);
  const fuel6 = yearSeries(model, year, "fuel_profit", owner.stationIds);
  const store6 = yearSeries(model, year, "store_profit", owner.stationIds);

  const stores = owner.stations.map((station) => {
    const s6 = scopeTotals(model, year, [station.id]);
    const s5 = scopeTotals(model, year - 1, [station.id]);
    return { station, s6, s5, delta: change(s6.total_profit, s5.total_profit) };
  }).sort((a, b) => Number(b.s6.total_profit || 0) - Number(a.s6.total_profit || 0));

  // Deep links that carry this owner into the analysis pages.
  const scoped = (path, label, iconName) =>
    `<a class="btn btn-sm" href="${esc(withScope(path, { ...scope, owner, station: null }))}">${icon(iconName)}${esc(label)}</a>`;

  return `
    <div class="page-head">
      <a class="back-link" href="#/owners">${icon("back")}All owners</a>
      <h2>${esc(owner.client)}</h2>
      <p>${esc(owner.stations.length)} store${owner.stations.length === 1 ? "" : "s"} ·
        signs in as ${owner.emails.map((e) => `<code>${esc(e)}</code>`).join(", ")} ·
        ${esc(model.currentYear)} through ${esc(monthLabel(model.latestMonth, true))}</p>
    </div>

    <div class="analysis-bar" style="margin-bottom:16px">
      ${scoped("/profit", "Profit", "profit")}
      ${scoped("/fuel", "Fuel", "fuel")}
      ${scoped("/purchases", "Purchases", "orders")}
      ${scoped("/departments", "Departments", "departments")}
      <span class="spacer"></span>
      <button class="btn btn-sm" data-owner-csv="${esc(owner.id)}">${icon("download")}CSV</button>
    </div>

    ${row.behind.length ? `<div class="warn-box" style="margin-bottom:16px">${icon("alert")}<div>
      <b>${esc(row.behind.length)} store${row.behind.length === 1 ? " has" : "s have"} not closed ${esc(monthLabel(model.latestMonth, true))}</b>
      <div>${esc(row.behind.map((s) => s.name).join(", "))} — the figures below exclude them for that month.</div>
    </div></div>` : ""}

    <div class="grid cols-4" style="margin-bottom:16px">
      <div class="stat">
        <div class="stat-label">Total profit</div>
        <div class="stat-value">${esc(money(ytd.total_profit))}</div>
        <div class="stat-foot">${deltaBadge(row.profitDelta)}<span>from ${esc(moneyShort(prior.total_profit))}</span></div>
      </div>
      <div class="stat">
        <div class="stat-label">Fuel profit</div>
        <div class="stat-value">${esc(money(ytd.fuel_profit))}</div>
        <div class="stat-foot">${deltaBadge(change(ytd.fuel_profit, prior.fuel_profit))}
          <span>${esc(perGallon(ytd.gas_margin))} on ${esc(num(ytd.gas_vol))} gal</span></div>
      </div>
      <div class="stat">
        <div class="stat-label">Store profit</div>
        <div class="stat-value${Number(ytd.store_profit) < 0 ? " neg-text" : ""}">${esc(money(ytd.store_profit))}</div>
        <div class="stat-foot">${deltaBadge(change(ytd.store_profit, prior.store_profit))}
          <span>${esc(pct(ytd.store_margin))} of sales</span></div>
      </div>
      <div class="stat">
        <div class="stat-label">Bought</div>
        <div class="stat-value">${esc(money(ytd.purchases))}</div>
        <div class="stat-foot">${deltaBadge(change(ytd.purchases, prior.purchases), { higherIsBetter: false })}
          <span>${esc(pct(ytd.sales ? ytd.purchases / ytd.sales : null))} of sales</span></div>
      </div>
    </div>

    <div class="grid split" style="margin-bottom:16px">
      <section class="card">
        <div class="card-head"><h3>Total profit by month</h3>
          <span class="hint">${esc(year)} against ${esc(year - 1)}</span></div>
        <div class="card-body">${lineChart(MONTH_ABBR, [
          { name: String(year), color: CYAN, values: total6 },
          { name: String(year - 1), color: NAVY, values: total5 },
        ], { height: 240 })}</div>
      </section>
      <section class="card">
        <div class="card-head"><h3>Fuel against store</h3>
          <span class="hint">Where the profit comes from</span></div>
        <div class="card-body">${lineChart(MONTH_ABBR, [
          { name: "Fuel", color: CYAN, values: fuel6 },
          { name: "Store", color: NAVY, values: store6 },
        ], { height: 240 })}</div>
      </section>
    </div>

    <section class="card">
      <div class="card-head"><h3>Stores</h3><span class="hint">Year to date</span></div>
      <div class="table-wrap"><table class="table">
        <thead><tr>
          <th>Store</th><th class="num">Total profit</th><th class="num">vs LY</th>
          <th class="num">Fuel</th><th class="num">Store</th><th class="num">Margin</th>
          <th class="num">Gallons</th><th class="num">$/gal</th>
        </tr></thead>
        <tbody>${stores.map((row_) => `<tr class="is-clickable" data-href="#/store/${esc(row_.station.id)}">
          <td><div class="cell-main"><span class="store-tag">${esc(row_.station.id)}</span>
            <span class="strong">${esc(row_.station.name)}</span></div></td>
          <td class="num strong">${esc(money(row_.s6.total_profit))}</td>
          <td class="num">${deltaBadge(row_.delta)}</td>
          <td class="num">${esc(money(row_.s6.fuel_profit))}</td>
          <td class="num${Number(row_.s6.store_profit) < 0 ? " neg-text" : ""}">${esc(money(row_.s6.store_profit))}</td>
          <td class="num">${esc(pct(row_.s6.store_margin))}</td>
          <td class="num">${esc(num(row_.s6.gas_vol))}</td>
          <td class="num">${esc(perGallon(row_.s6.gas_margin))}</td>
        </tr>`).join("")}</tbody>
        <tfoot><tr>
          <td>${esc(owner.stations.length)} stores</td>
          <td class="num">${esc(money(ytd.total_profit))}</td>
          <td class="num">${deltaBadge(row.profitDelta)}</td>
          <td class="num">${esc(money(ytd.fuel_profit))}</td>
          <td class="num">${esc(money(ytd.store_profit))}</td>
          <td class="num">${esc(pct(ytd.store_margin))}</td>
          <td class="num">${esc(num(ytd.gas_vol))}</td>
          <td class="num">${esc(perGallon(ytd.gas_margin))}</td>
        </tr></tfoot>
      </table></div>
    </section>`;
}

export function bindOwners(root, ctx) {
  root.querySelector("[data-owner-csv]")?.addEventListener("click", (event) => {
    const { model } = ctx;
    const owner = (model.owners || []).find((o) => o.id === event.currentTarget.dataset.ownerCsv);
    if (!owner) return;
    const year = Number(model.currentYear);
    downloadCsv(`${owner.id}-${year}-ytd.csv`,
      ["Store", "Name", "Total profit", "Fuel profit", "Store profit", "Store sales",
        "Purchases", "Gallons", "Store margin", "$/gal"],
      owner.stations.map((station) => {
        const t = scopeTotals(model, year, [station.id]);
        return [station.id, station.name, t.total_profit ?? "", t.fuel_profit ?? "",
          t.store_profit ?? "", t.sales ?? "", t.purchases ?? "", t.gas_vol ?? "",
          t.store_margin ?? "", t.gas_margin ?? ""];
      }));
  });
}
