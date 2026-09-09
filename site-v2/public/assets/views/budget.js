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
  currentStores, rollupDepartments, rollupDeptBudget, rollupLastYear, rollupMtd,
  rollupProjection, rollupWeeks,
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
  const tone = usedTone(used);
  const width = Math.max(0, Math.min(1, Number(used) || 0)) * 100;
  return `<span class="meter meter-${tone || "pos"}" role="img"
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

  const stores = currentStores(current, scope);
  if (!stores.length) {
    return head(missing(scope.label, "stores in this scope", ""));
  }

  const mtd = rollupMtd(stores);
  const projection = rollupProjection(stores);
  const lastYear = rollupLastYear(stores);
  const weeks = rollupWeeks(stores);
  const budget = rollupDeptBudget(stores);
  const departments = rollupDepartments(stores);

  const estimated = stores.filter((store) => store.estimates.budget);
  const idle = stores.filter((store) => store.estimates.noOperatingDays);

  /* ---- headline ---------------------------------------------------------- */

  const spent = budget.reduce((sum, row) => sum + row.spent, 0);
  const allowed = budget.reduce((sum, row) => sum + (row.budget || 0), 0);
  const left = allowed - spent;
  const used = allowed ? spent / allowed : null;

  const liveWeek = weeks.filter((row) => row.started).slice(-1)[0] || null;

  const stats = `<div class="grid cols-4" style="margin-bottom:16px">
    <div class="stat">
      <div class="stat-label">Left to spend this month</div>
      <div class="stat-value${left < 0 ? " neg-text" : ""}" style="font-size:23px">${esc(money(left))}</div>
      <div class="stat-foot">
        <span>${esc(money(spent))} of ${esc(money(allowed))} used</span>
      </div>
    </div>
    <div class="stat">
      <div class="stat-label">Budget used</div>
      <div class="stat-value" style="font-size:23px">${esc(pct(used, { digits: 0 }))}</div>
      <div class="stat-foot">${meter(used)}</div>
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
    <td class="num muted">${esc(money(row.budget))}</td>
    <td style="min-width:120px">${meter(row.used)}</td>
    <td class="num">${esc(pct(row.used, { digits: 0 }))}</td>
    <td class="num strong${row.left < 0 ? " neg-text" : ""}">${esc(money(row.left))}</td>
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
        <td class="num">${esc(money(allowed))}</td>
        <td>${meter(used)}</td>
        <td class="num">${esc(pct(used, { digits: 0 }))}</td>
        <td class="num strong${left < 0 ? " neg-text" : ""}">${esc(money(left))}</td>
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
      <td class="strong">${esc(row.label)}
        ${row.mixedWeeks ? '<div class="cell-sub">stores cut this week on different days</div>' : ""}</td>
      <td class="num muted">${esc(money(row.maximum))}</td>
      <td class="num">${row.started ? esc(money(row.actual)) : "—"}</td>
      <td>${row.started ? meter(row.maximum ? row.actual / row.maximum : null) : ""}</td>
      <td class="num strong${state === "over" ? " neg-text" : ""}">
        ${row.started ? `${esc(state)} ${esc(money(Math.abs(row.over)))}` : "not started"}</td>
    </tr>`;
  }).join("");

  const weekCard = weeks.length ? `<section class="card">
    <div class="card-head">
      <h3>The month, week by week</h3>
      <span class="hint">A ceiling per week, so the month cannot be spent in its first ten days</span>
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
  </section>` : "";

  /* ---- departments against target ---------------------------------------- */

  const offTarget = departments.filter((row) => isNum(row.short) && row.short < 0);

  const deptRows = departments.map((row) => `<tr>
    <td class="strong">${esc(row.name)}</td>
    <td class="num">${esc(money(row.sales))}</td>
    <td class="num">${esc(money(row.purchases))}</td>
    <td class="num${Number(row.profit) < 0 ? " neg-text strong" : ""}">${esc(money(row.profit))}</td>
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

  const paceCard = mtd && projection ? `<section class="card">
    <div class="card-head">
      <h3>Where the month is heading</h3>
      <span class="hint">${esc(num(mtd.days))} of ${esc(num(projection.daysInMonth))} days filed</span>
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
          ["Store sales", "sales"],
          ["Bought", "purchases"],
          ["Store profit", "store_profit"],
          ["Fuel profit", "gas_profit"],
        ].map(([label, key]) => {
          const ly = lastYear ? lastYear[key] : null;
          const pace = projection[key];
          const delta = isNum(ly) && isNum(pace) && Number(ly) !== 0
            ? ((pace - ly) / Math.abs(ly)) * 100 : null;
          return `<tr>
            <th scope="row">${esc(label)}</th>
            <td class="num">${esc(money(mtd[key]))}</td>
            <td class="num strong">${esc(money(pace))}</td>
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
          never against “so far”.</div>
      </div>
    </div>
  </section>` : "";

  /* ---- store breakdown --------------------------------------------------- */

  const perStore = stores.length > 1 ? `<section class="card">
    <div class="card-head"><h3>By store</h3>
      <span class="hint">Least headroom first</span></div>
    <div class="table-wrap"><table class="table">
      <thead><tr>
        <th>Store</th>
        <th class="num">Bought</th>
        <th class="num">Budget</th>
        <th class="num">Left</th>
        <th class="num">Sold</th>
        <th class="num">Bought / sold</th>
      </tr></thead>
      <tbody>${stores.map((store) => {
        const rows = store.deptBudget;
        const s = rows.reduce((sum, row) => sum + row.spent, 0);
        const b = rows.reduce((sum, row) => sum + (row.budget || 0), 0);
        return { store, spent: s, budget: b, left: b ? b - s : null };
      }).sort((a, b) => (a.left ?? Infinity) - (b.left ?? Infinity)).map(({ store, spent: s, budget: b, left: l }) => `<tr>
        <td class="strong"><a href="#/store/${esc(store.id)}">${esc(store.name)}</a>
          <div class="cell-sub">${esc(store.id)}${store.estimates.noOperatingDays
            ? " · no days filed this month" : ""}</div></td>
        <td class="num">${esc(money(s))}</td>
        <td class="num muted">${b ? esc(money(b)) : "—"}</td>
        <td class="num strong${isNum(l) && l < 0 ? " neg-text" : ""}">${isNum(l) ? esc(money(l)) : "—"}</td>
        <td class="num">${esc(money(store.mtd?.sales))}</td>
        <td class="num">${esc(pct(store.mtd?.buy_ratio))}</td>
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

  const idleNote = idle.length ? `<div class="warn-box" style="margin-bottom:16px">${icon("alert")}
    <div><b>${esc(num(idle.length))} ${idle.length === 1 ? "store has" : "stores have"} filed no
      operating days this month.</b> Their figures come from the last daily file we hold, so the
      budget headroom shown for them is stale.</div>
  </div>` : "";

  return head(`
    ${idleNote}
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
