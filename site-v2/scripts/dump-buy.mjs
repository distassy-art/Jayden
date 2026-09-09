#!/usr/bin/env node
/*
 * Dump the open month exactly as the console derives it, as JSON.
 *
 * Paired with scripts/verify-buy.py, which recomputes the same figures from the
 * raw feed in Python. Run both whenever the buy page changes.
 *
 *   node scripts/dump-buy.mjs > /tmp/buy.json
 */

import {
  buildCurrent, rollupDepartments, rollupDeptBudget, rollupLastYear, rollupMtd,
  rollupProjection, rollupWeeks,
} from "../public/assets/current.js";

const args = process.argv.slice(2);
const baseFlag = args.indexOf("--base");
const BASE = baseFlag !== -1 ? args[baseFlag + 1] : "http://localhost:8787";

const response = await fetch(`${BASE}/api/data/manager.json`, {
  headers: { "x-ss-email": "smartsolutionsai", "x-ss-role": "owner" },
});
if (!response.ok) throw new Error(`manager.json -> ${response.status}`);

const current = buildCurrent(await response.json());
const stores = current.stores;

process.stdout.write(JSON.stringify({
  asOf: current.asOf,
  label: current.label,
  stores: stores.map((store) => ({
    id: store.id,
    name: store.name,
    mtd: store.mtd,
    projection: store.projection,
    lastYear: store.lastYear,
    weeks: store.weeks,
    deptBudget: store.deptBudget,
    departments: store.departments,
    gaps: store.gaps,
  })),
  rollup: {
    mtd: rollupMtd(stores),
    projection: rollupProjection(stores),
    lastYear: rollupLastYear(stores),
    weeks: rollupWeeks(stores),
    deptBudget: rollupDeptBudget(stores),
    departments: rollupDepartments(stores),
  },
}, null, 2));
