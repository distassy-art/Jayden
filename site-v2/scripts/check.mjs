#!/usr/bin/env node
/*
 * Render every view against real production data and assert the output is sane.
 *
 * The views are pure `state -> HTML string` functions, so they can be exercised
 * in Node without a browser. That catches the failures that actually happen —
 * a missing field formatted as "undefined", a bad number, an unescaped value —
 * before anything is deployed.
 *
 *   node scripts/check.mjs [--base http://localhost:8787]
 */

import { buildModel } from "../public/assets/analytics.js";
import { renderDashboard } from "../public/assets/views/dashboard.js";
import { renderStore, renderStores } from "../public/assets/views/stores.js";
import { renderInvoices, renderOrders, renderPricing } from "../public/assets/views/operations.js";
import { renderBilling, renderHealth, renderTickets } from "../public/assets/views/finance.js";

const args = process.argv.slice(2);
const baseFlag = args.indexOf("--base");
const BASE = baseFlag !== -1 ? args[baseFlag + 1] : "http://localhost:8787";

const HEADERS = { "x-ss-email": "smartsolutionsai", "x-ss-role": "owner" };

let failures = 0;
let checks = 0;

function assert(condition, message) {
  checks += 1;
  if (!condition) {
    failures += 1;
    process.stdout.write(`  FAIL  ${message}\n`);
  }
}

async function get(path) {
  const response = await fetch(`${BASE}${path}`, { headers: HEADERS });
  if (!response.ok) throw new Error(`${path} -> ${response.status}`);
  return response.json();
}

/** Values that mean a formatting path was missed somewhere. */
const LEAKS = [
  ["undefined", /(^|[>\s"$])undefined([<\s"]|$)/],
  ["NaN", /(^|[>\s"$])NaN([<\s"%]|$)/],
  ["[object Object]", /\[object Object\]/],
  ["null", /(^|[>\s"$])null([<\s"]|$)/],
];

function inspect(name, markup) {
  // Error notices are legitimately short; anything below this is a broken render.
  assert(typeof markup === "string" && markup.length > 250,
    `${name}: rendered ${typeof markup === "string" ? `${markup.length} chars` : typeof markup}, expected real markup`);

  for (const [label, pattern] of LEAKS) {
    const match = markup.match(pattern);
    assert(!match, `${name}: leaked ${label} — "${markup.slice(Math.max(0, (match?.index || 0) - 60), (match?.index || 0) + 60).replace(/\s+/g, " ")}"`);
  }

  // Every tag that opens must close; a blunt check, but it catches truncation.
  const opens = (markup.match(/<(div|section|table|tbody|thead|tr|td|th|svg)\b/g) || []).length;
  const closes = (markup.match(/<\/(div|section|table|tbody|thead|tr|td|th|svg)>/g) || []).length;
  assert(opens === closes, `${name}: ${opens} opening tags vs ${closes} closing tags`);

  process.stdout.write(`  ok    ${name} (${(markup.length / 1024).toFixed(1)} KB)\n`);
}

async function main() {
  process.stdout.write(`Checking against ${BASE}\n\n`);

  const [overlay, billing, tickets, days, s2k, orders, pricing] = await Promise.all([
    get("/api/books-overlay"),
    get("/api/billing").catch(() => null),
    get("/api/mgr-tickets").catch(() => null),
    get("/api/mgr-days").catch(() => null),
    get("/api/data/s2k-invoices.json").catch(() => null),
    get("/api/data/vendor-orders.json").catch(() => null),
    get("/api/data/pricing.json").catch(() => null),
  ]);

  const data = { overlay, billing, tickets, days, s2k, orders, pricing, errors: {} };
  const model = buildModel(overlay);

  process.stdout.write("Model\n");
  assert(model.stations.length > 0, "model: no stations parsed");
  assert(Boolean(model.latestMonth), "model: no latest month resolved");
  assert(model.ytdKeys.length > 0, "model: no year-to-date months");

  // A month one store has filed ahead of the rest is a part-month. Letting it
  // into a trend makes the whole portfolio look like it collapsed.
  const ahead = model.closedMonths.filter((key) => key > model.latestMonth);
  assert(ahead.length === 0, `model: closedMonths runs past ${model.latestMonth} (${ahead.join(", ")})`);
  assert(model.ytdKeys.every((key) => key <= model.latestMonth),
    "model: year-to-date includes months beyond the latest closed month");

  // The latest closed month must be one most stores actually filed.
  const filed = model.stations.filter((s) => s.months[model.latestMonth]).length;
  assert(filed >= model.stations.length / 2,
    `model: only ${filed}/${model.stations.length} stations filed ${model.latestMonth}`);

  process.stdout.write(`  ok    ${model.stations.length} stations, latest ${model.latestMonth} `
    + `(${filed} filed), ${model.closedMonths.length} closed months, ${model.ytdKeys.length} YTD\n\n`);

  const ctx = (query = "", params = {}) => ({
    model,
    data,
    query: new URLSearchParams(query),
    params,
    navigate() {},
  });

  process.stdout.write("Views\n");
  inspect("dashboard", renderDashboard(ctx()));
  inspect("stores", renderStores(ctx()));
  inspect("stores?period=ytd", renderStores(ctx("period=ytd")));
  inspect("stores?sort=margin&dir=asc", renderStores(ctx("sort=margin&dir=asc")));
  inspect("invoices (missing)", renderInvoices(ctx("tab=missing")));
  inspect("invoices (entered)", renderInvoices(ctx("tab=entered")));
  inspect("orders", renderOrders(ctx()));
  inspect("orders (schedule)", renderOrders(ctx("tab=schedule")));
  inspect("pricing", renderPricing(ctx()));
  inspect("billing", renderBilling(ctx()));
  inspect("billing?status=unpaid", renderBilling(ctx("status=unpaid")));
  inspect("tickets", renderTickets(ctx()));
  inspect("health", renderHealth(ctx()));

  process.stdout.write("\nStore detail (every station)\n");
  for (const station of model.stations) {
    inspect(`store/${station.id} ${station.name}`, renderStore(ctx("", { id: station.id })));
  }

  process.stdout.write("\nDegraded feeds\n");
  const bare = {
    overlay,
    billing: null, tickets: null, days: null, s2k: null, orders: null, pricing: null,
    errors: { billing: "boom", s2k: "boom", orders: "boom", pricing: "boom" },
  };
  const bareCtx = { model, data: bare, query: new URLSearchParams(), params: {}, navigate() {} };
  inspect("dashboard (no side feeds)", renderDashboard(bareCtx));
  inspect("invoices (feed down)", renderInvoices(bareCtx));
  inspect("orders (feed down)", renderOrders(bareCtx));
  inspect("billing (feed down)", renderBilling(bareCtx));
  inspect("health (feeds down)", renderHealth(bareCtx));

  process.stdout.write(`\n${checks - failures}/${checks} checks passed\n`);
  if (failures) {
    process.stdout.write(`${failures} failed\n`);
    process.exitCode = 1;
  }
}

main().catch((failure) => {
  process.stdout.write(`\nCheck run failed: ${failure.message}\n`);
  process.exitCode = 1;
});
