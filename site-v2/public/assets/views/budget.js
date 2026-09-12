/*
 * The buy: what the month allows, what it has spent, and what is left.
 *
 * This is the page the whole service is built around. Every other page reports
 * on a month that is finished; this one is about the month you can still
 * change, so it leads with headroom rather than with history.
 */

import {
  deltaBadge, downloadCsv, emptyState, esc, icon, isNum, money, num, pct,
} from "../ui.js";
import {
  currentStores, partitionByPeriod, rollupDepartments, rollupDeptBudget,
  rollupLastYear, rollupMtd, rollupProjection, rollupWeeks,
} from "../current.js";
import { bindScopeBar, scopeBar } from "../scope.js";

/** Headroom shades from calm to alarmed as a budget is used up. */
function usedTone(used) {
  if (!isNum(used)) return "";
  if (used > 1) return "neg";
  if (used > 0.9) return "warn";
  return "pos";
}

function meter(used) {
  if (!isNum(used)) return "";
  const width = Math.max(0, Math.min(1, Number(used))) * 100;
  return `<span class="meter meter-${usedTone(used)}" role="img"
      aria-label="${esc(pct(used, { digits: 0 }))} of budget used">
    <span style="width:${width.toFixed(1)}%"></span>
  </span>`;
}

function missing(scopeLabel, what, why) {
  return `<section class="card"><div class="card-body">
    ${emptyState(`No ${what} for ${scopeLabel}`, why)}
  </div></section>`;
}

/* -------------------------------------------------------------------------
   Page
   ------------------------------------------------------------------------- */

export function renderBudget(ctx) {
  const { model, scope, current } = ctx;
  const bar = scopeBar(model, scope, { period: false });

  const head = (body) => `
    <div class="page-head">
      <h2>The buy</h2>
      <p>What <b>${esc(scope.label)}</b> is allowed to spend this month, what it has spent,
        and what is left. Figures run to the last complete day.</p>
    </div>${bar}${body}`;

  if (!current) {
    return head(missing(scope.label, "open month", "The manager feed is unavailable."));
  }

  const inScope = currentStores(current, scope);
  if (!inScope.length) {
    return head(missing(scope.label, "stores in this scope", ""));
  }

  /*
   * Only stores that have filed into the open month are summed. A store still
   * sitting on August reports a full month's trading, which would swamp stores
   * that have filed a week of September and make every total meaningless.
   */
  const { filed: stores, behind } = partitionByPeriod(inScope);

  const behindNote = behind.length ? `<div class="warn-box" style="margin-bottom:16px">
    ${icon("alert")}<div>
      <b>${esc(num(behind.length))} of ${esc(num(inScope.length))}
        store${inScope.length === 1 ? "" : "s"} ${behind.length === 1 ? "has" : "have"}
        filed nothing for ${esc(current.label.replace(/ month to date$/i, ""))}.</b>
      <div>${esc(behind.map((store) => `${store.name} (last filed ${store.month || "—"})`).join(", "))}
        — left out of everything below, because their last month cannot be added
        to this one.</div>
    </div>
  </div>` : "";

  if (!stores.length) {
    return head(behindNote + missing(scope.label, "figures for the open month",
      "No store in this scope has filed into the current month yet."));
  }

  const mtd = rollupMtd(stores);
  const projection = rollupProjection(stores);
  const lastYear = rollupLastYear(stores);
  const weeks = rollupWeeks(stores);
  const budget = rollupDeptBudget(stores);
  const departments = rollupDepartments(stores);

  const estimated = stores.filter((store) => store.estimates.budget);

  /* ---- headline ---------------------------------------------------------- */

  const spent = budget.reduce((sum, row) => sum + row.spent, 0);
  const allowed = budget.reduce((sum, row) => sum + (row.budget || 0), 0);
  // Most of the headline is portfolio-wide, but headroom only means anything
  // for stores that actually carry a budget. Saying how many stops the two
  // figures being read as covering the same set of stores.
  const budgeted = stores.filter((store) =>
    store.deptBudget.some((row) => Number(row.budget) > 0)).length;
  const coverage = budgeted < stores.length
    ? `across ${num(budgeted)} of ${num(stores.length)} stores`
    : "";
  // No budget at all is a different thing from a budget with nothing left, and
  // showing "$0" for both would read as the alarming one.
  const hasBudget = allowed > 0;
  const left = hasBudget ? allowed - spent : null;
  const used = hasBudget ? spent / allowed : null;

  const liveWeek = weeks.filter((row) => row.started).slice(-1)[0] || null;

  const stats = `<div class="grid cols-4" style="margin-bottom:16px">
    <div class="stat">
      <div class="stat-label">Left to spend this month</div>
      <div class="stat-value${isNum(left) && left < 0 ? " neg-text" : ""}" style="font-size:23px">
        ${esc(hasBudget ? money(left) : "—")}</div>
      <div class="stat-foot">
        <span>${hasBudget
          ? `${esc(money(spent))} of ${esc(money(allowed))} used`
          : `no budget loaded · ${esc(money(spent))} bought`}</span>
      </div>
    </div>
    <div class="stat">
      <div class="stat-label">Budget used${coverage ? ` ${esc(coverage)}` : ""}</div>
      <div class="stat-value" style="font-size:23px">${esc(pct(used, { digits: 0 }))}</div>
      <div class="stat-foot">${meter(used) || "<span>not budgeted</span>"}</div>
    </div>
    <div class="stat">
      <div class="stat-label">This week against its ceiling</div>
      <div class="stat-value${liveWeek && liveWeek.over > 0 ? " neg-text" : ""}" style="font-size:23px">
        ${esc(liveWeek ? money(Math.abs(liveWeek.over)) : "—")}</div>
      <div class="stat-foot"><span>${liveWeek
        ? `${esc(liveWeek.over > 0 ? "over" : "under")} on ${esc(liveWeek.label)}`
        : "no weekly ceiling set"}</span></div>
    </div>
    <div class="stat">
      <div class="stat-label">Bought against sold</div>
      <div class="stat-value" style="font-size:23px">${esc(pct(mtd?.buy_ratio))}</div>
      <div class="stat-foot"><span>${esc(money(mtd?.purchases))} bought on
        ${esc(money(mtd?.sales))} of sales</span></div>
    </div>
  </div>`;

  /* ---- department budget ------------------------------------------------- */

  const budgetRows = budget.map((row) => `<tr>
    <td class="strong">${esc(row.name)}
      ${row.estimated ? '<span class="pill">estimated</span>' : ""}
      ${scope.stationIds && scope.stationIds.length > 1 && row.stores > 1
        ? `<div class="cell-sub">${esc(num(row.stores))} stores</div>` : ""}</td>
    <td class="num">${esc(money(row.spent))}</td>
    <td class="num muted">${row.budget ? esc(money(row.budget)) : "—"}</td>
    <td style="min-width:120px">${meter(row.used)}</td>
    <td class="num">${esc(pct(row.used, { digits: 0 }))}</td>
    <td class="num strong${isNum(row.left) && row.left < 0 ? " neg-text" : ""}">
      ${row.budget ? esc(money(row.left)) : '<span class="muted">not budgeted</span>'}</td>
  </tr>`).join("");

  const budgetCard = budget.length ? `<section class="card">
    <div class="card-head">
      <h3>What each department may still buy</h3>
      <span class="hint">Ordered by how much of the budget is gone</span>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr>
        <th>Department</th>
        <th class="num">Bought</th>
        <th class="num">Budget</th>
        <th>Used</th>
        <th class="num">%</th>
        <th class="num">Left to spend</th>
      </tr></thead>
      <tbody>${budgetRows}</tbody>
      <tfoot><tr>
        <th scope="row">All departments</th>
        <td class="num strong">${esc(money(spent))}</td>
        <td class="num">${esc(hasBudget ? money(allowed) : "—")}</td>
        <td>${meter(used)}</td>
        <td class="num">${esc(pct(used, { digits: 0 }))}</td>
        <td class="num strong${isNum(left) && left < 0 ? " neg-text" : ""}">
          ${esc(hasBudget ? money(left) : "—")}</td>
      </tr></tfoot>
    </table></div>
    ${estimated.length ? `<div class="card-foot">
      <div class="warn-box">${icon("alert")}
        <div><b>${esc(num(estimated.length))} ${estimated.length === 1 ? "store has" : "stores have"}
          a budget we worked out rather than one we were given.</b>
          Where a store has no budget table of its own, we derive it from that department's own
          sales and target margin. Treat those lines as a guide until the real budget is loaded.</div>
      </div>
    </div>` : ""}
  </section>` : missing(scope.label, "department budgets",
    "No store in this scope has a purchase budget loaded yet.");

  /* ---- weekly ceilings --------------------------------------------------- */

  const weekRows = weeks.map((row) => {
    const state = !row.started ? "upcoming" : row.over > 0 ? "over" : "under";
    return `<tr${state === "upcoming" ? ' class="is-quiet"' : ""}>
      <td class="strong">${esc(row.label)}</td>
      <td class="num muted">${esc(money(row.maximum))}</td>
      <td class="num">${row.started ? esc(money(row.actual)) : "—"}</td>
      <td>${row.started ? meter(row.maximum ? row.actual / row.maximum : null) : ""}</td>
      <td class="num strong${state === "over" ? " neg-text" : ""}">
        ${row.started ? `${esc(state)} ${esc(money(Math.abs(row.over)))}` : "not started"}</td>
    </tr>`;
  }).join("");

  // Not every store carries weekly ceilings, so the totals here can cover fewer
  // stores than the department budget above. Say so rather than let the two be
  // read as the same population.
  const ceilinged = Math.max(0, ...weeks.map((week) => week.stores));
  const mixedWeeks = weeks.some((week) => week.mixedWeeks);
  const weekCard = weeks.length ? `<section class="card">
    <div class="card-head">
      <h3>The month, week by week</h3>
      <span class="hint">${ceilinged < stores.length
        ? `${esc(num(ceilinged))} of ${esc(num(stores.length))} stores carry a weekly ceiling`
        : "A ceiling per week, so the month cannot be spent in its first ten days"}</span>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr>
        <th>Week</th>
        <th class="num">Ceiling</th>
        <th class="num">Bought</th>
        <th>Against ceiling</th>
        <th class="num">Standing</th>
      </tr></thead>
      <tbody>${weekRows}</tbody>
    </table></div>
    ${mixedWeeks ? `<div class="card-foot"><div class="warn-box">${icon("alert")}
      <div><b>Stores do not all cut the week on the same day.</b>
        These rows are summed by position in the month, so a week's total can span
        two slightly different date ranges. Open a single store for its own dates.</div>
    </div></div>` : ""}
  </section>` : "";

  /* ---- departments against target ---------------------------------------- */

  const offTarget = departments.filter((row) => isNum(row.short) && row.short < 0);

  const deptRows = departments.map((row) => `<tr>
    <td class="strong">${esc(row.name)}
      ${row.reported ? "" : '<div class="cell-sub">no profit reported</div>'}</td>
    <td class="num">${esc(money(row.sales))}</td>
    <td class="num">${esc(money(row.purchases))}</td>
    <td class="num${isNum(row.profit) && row.profit < 0 ? " neg-text strong" : ""}">${esc(money(row.profit))}</td>
    <td class="num">${esc(pct(row.margin))}</td>
    <td class="num muted">${esc(pct(row.target))}</td>
    <td class="num">${isNum(row.short)
      ? `<span class="${row.short < 0 ? "neg-text strong" : "pos-text"}">${esc(pct(row.short, { digits: 1 }))}</span>`
      : "—"}</td>
  </tr>`).join("");

  const deptCard = departments.length ? `<section class="card">
    <div class="card-head">
      <h3>Departments against their target margin</h3>
      <span class="hint">${offTarget.length
        ? `${esc(num(offTarget.length))} below target, worst first`
        : "all at or above target"}</span>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr>
        <th>Department</th>
        <th class="num">Sales</th>
        <th class="num">Bought</th>
        <th class="num">Profit</th>
        <th class="num">Margin</th>
        <th class="num">Target</th>
        <th class="num">Gap</th>
      </tr></thead>
      <tbody>${deptRows}</tbody>
    </table></div>
  </section>` : "";

  /* ---- where the month is heading ---------------------------------------- */

  // Stores are not all filed to the same day, so say the range rather than
  // implying every store has reached the longest run.
  const dayRuns = stores.map((store) => store.mtd?.days).filter(isNum);
  const shortest = dayRuns.length ? Math.min(...dayRuns) : null;
  const filedLabel = isNum(shortest) && shortest !== mtd?.days
    ? `${num(shortest)}–${num(mtd.days)}`
    : num(mtd?.days);

  const paceCard = mtd && projection ? `<section class="card">
    <div class="card-head">
      <h3>Where the month is heading</h3>
      <span class="hint">${esc(filedLabel)} of ${esc(num(projection.daysInMonth))} days filed</span>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr>
        <th>Line</th>
        <th class="num">So far</th>
        <th class="num">At this pace</th>
        ${lastYear ? `<th class="num">${esc(lastYear.label)}</th><th class="num">Pace vs last year</th>` : ""}
      </tr></thead>
      <tbody>
        ${[
          // Store profit is sales minus purchases, and an open month's purchases
          // are only the invoices keyed so far — so it is left out of both the
          // "so far" and the pace columns rather than crediting unkeyed cost as
          // margin. What has been bought is a fact and is shown; pacing it would
          // carry a store with nothing keyed yet to month end at no cost at all.
          ["Store sales", "sales", { paced: true }],
          ["Bought so far", "purchases", { paced: false }],
          ["Store profit", "store_profit", { open: false }],
          ["Fuel profit", "gas_profit", { paced: true }],
        ].map(([label, key, opts]) => {
          const settled = opts.open !== false;
          const ly = lastYear ? lastYear[key] : null;
          const pace = settled && opts.paced ? projection[key] : null;
          const delta = isNum(ly) && isNum(pace) && Number(ly) !== 0
            ? ((pace - ly) / Math.abs(ly)) * 100 : null;
          const dash = `<span class="muted" title="Settles when the books close">—</span>`;
          return `<tr>
            <th scope="row">${esc(label)}</th>
            <td class="num">${settled ? esc(money(mtd[key])) : dash}</td>
            <td class="num strong">${isNum(pace) ? esc(money(pace)) : dash}</td>
            ${lastYear ? `<td class="num muted">${esc(money(ly))}</td>
              <td class="num">${isNum(delta)
                ? deltaBadge(delta, { higherIsBetter: key !== "purchases" }) : "—"}</td>` : ""}
          </tr>`;
        }).join("")}
      </tbody>
    </table></div>
    <div class="card-foot">
      <div class="warn-box">${icon("alert")}
        <div><b>“At this pace” is arithmetic, not a forecast.</b>
          It assumes the rest of the month trades like the days already filed. The comparison
          runs against last year's full month, so it is only meaningful against the pace column —
          never against “so far”. Store profit is blank until the books close: purchase invoices
          are keyed later than sales, so subtracting them now would read as margin.</div>
      </div>
    </div>
  </section>` : "";

  /* ---- store breakdown --------------------------------------------------- */

  /*
   * Two different populations sit side by side here, so they are separated
   * rather than blended: sold, bought and the ratio between them cover the
   * whole store, while the budget and its headroom cover only the departments
   * that carry one. Putting budgeted spend under a column called "bought"
   * next to a whole-store ratio made the two look like they should divide.
   */
  const perStore = stores.length > 1 ? `<section class="card">
    <div class="card-head"><h3>By store</h3>
      <span class="hint">Least headroom first</span></div>
    <div class="table-wrap"><table class="table">
      <thead>
        <tr>
          <th rowspan="2">Store</th>
          <th class="num" colspan="3">The whole store</th>
          <th class="num" colspan="2">Budgeted departments</th>
        </tr>
        <tr>
          <th class="num">Sold</th>
          <th class="num">Bought</th>
          <th class="num">Bought / sold</th>
          <th class="num">Budget</th>
          <th class="num">Left to spend</th>
        </tr>
      </thead>
      <tbody>${stores.map((store) => {
        const spentHere = store.deptBudget.reduce((sum, row) => sum + row.spent, 0);
        const allowedHere = store.deptBudget.reduce((sum, row) => sum + (row.budget || 0), 0);
        return { store, budget: allowedHere, left: allowedHere ? allowedHere - spentHere : null };
      }).sort((a, b) => (a.left ?? Infinity) - (b.left ?? Infinity))
        .map(({ store, budget: b, left: l }) => `<tr>
        <td class="strong"><a href="#/store/${esc(store.id)}">${esc(store.name)}</a>
          <div class="cell-sub">${esc(store.id)} · ${esc(num(store.mtd?.days))} days filed</div></td>
        <td class="num">${esc(money(store.mtd?.sales))}</td>
        <td class="num">${esc(money(store.mtd?.purchases))}</td>
        <td class="num">${esc(pct(store.mtd?.buy_ratio))}</td>
        <td class="num muted">${b ? esc(money(b)) : "—"}</td>
        <td class="num strong${isNum(l) && l < 0 ? " neg-text" : ""}">
          ${isNum(l) ? esc(money(l)) : '<span class="muted">not budgeted</span>'}</td>
      </tr>`).join("")}</tbody>
    </table></div>
  </section>` : "";

  /* ---- the store's own weekly note --------------------------------------- */

  const alerts = stores.filter((store) => store.alert);
  const alertCard = alerts.length === 1 ? `<section class="card">
    <div class="card-head"><h3>This week's note to the store</h3>
      ${alerts[0].alert.estimated ? '<span class="pill">generated</span>' : ""}</div>
    <div class="card-body">
      <ul class="timeline">
        ${alerts[0].alert.notes.map((note) => `<li>
          <span class="timeline-what"><div>${esc(note)}</div></span>
        </li>`).join("")}
      </ul>
    </div>
  </section>` : "";

  return head(`
    ${behindNote}
    ${stats}
    ${budgetCard}
    ${weekCard}
    ${deptCard}
    ${paceCard}
    ${alertCard}
    ${perStore}`);
}

export function bindBudget(root, ctx) {
  ctx.csv = () => {
    const stores = currentStores(ctx.current, ctx.scope);
    const rows = rollupDeptBudget(stores);
    const name = ctx.scope.station?.id || ctx.scope.owner?.id || "all";
    downloadCsv(`buy-${name}.csv`,
      ["Department", "Bought", "Budget", "Left to spend", "Used"],
      rows.map((row) => [row.name, row.spent, row.budget ?? "", row.left ?? "", row.used ?? ""]));
  };
  bindScopeBar(root, ctx);
}
