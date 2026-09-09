/*
 * Who you are looking at, and over what period.
 *
 * The old site had no answer to "show me this client's fuel margin" — stores
 * were a flat list of seventeen and the owner behind them was invisible. Here
 * every page reads the same two controls:
 *
 *   scope      all stores -> one owner -> one store
 *   period     day | week | month | year, for bucketing the day feed
 *   timeframe  year to date, a finished year, or a single month
 *
 * `period` and `timeframe` are not the same control and do not read the same
 * data. `period` buckets the day feed, which runs about two months; `timeframe`
 * selects from the monthly history, which runs two years. Performance pages
 * want the second, the daily close wants the first.
 *
 * All three live in the URL so any view is linkable, and all three are mirrored
 * into session storage so plain nav links keep your place.
 */

import { esc, icon, monthLabel } from "./ui.js";
import { resolveTimeframe, timeframes } from "./analytics.js";

/* -------------------------------------------------------------------------
   Owners
   ------------------------------------------------------------------------- */

/*
 * The house accounts own every store, so treating them as owner groups would
 * add a "Smart Solutions AI" tier that duplicates "all stores".
 */
const HOUSE_ACCOUNTS = new Set(["smartsolutionsai", "admin"]);

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "owner";
}

function localPart(value) {
  const text = String(value || "").trim().toLowerCase();
  const at = text.indexOf("@");
  return at === -1 ? text : text.slice(0, at);
}

/**
 * Client groups, derived from the account directory rather than the overlay's
 * own `profit.group`, which is missing on two stores and files Farsai's and
 * Placentia's stores under "Independent".
 *
 * Slugs come from the client name because the emails collide: `owner@bigdaddy`
 * and `owner@farsai` share the local part "owner".
 */
export function buildOwners(accounts, model) {
  const seen = new Map();

  (accounts || []).forEach((account) => {
    if (HOUSE_ACCOUNTS.has(localPart(account.email))) return;

    const stations = (account.stores || [])
      .map((id) => model.byId.get(String(id)))
      .filter(Boolean);
    if (!stations.length) return;

    const id = slug(account.client || account.email);
    // One client can hold several logins; fold them into a single group.
    const existing = seen.get(id);
    if (existing) {
      stations.forEach((station) => {
        if (!existing.stations.some((s) => s.id === station.id)) existing.stations.push(station);
      });
      existing.emails.push(String(account.email || ""));
      return;
    }

    seen.set(id, {
      id,
      client: account.client || account.email,
      emails: [String(account.email || "")],
      stations,
    });
  });

  const owners = [...seen.values()];
  owners.forEach((owner) => {
    owner.stations.sort((a, b) => a.name.localeCompare(b.name));
    owner.stationIds = owner.stations.map((s) => s.id);
  });

  return owners.sort((a, b) => b.stations.length - a.stations.length
    || a.client.localeCompare(b.client));
}

/** The owner a store belongs to, or null when the directory does not say. */
export function ownerOf(owners, stationId) {
  return owners.find((owner) => owner.stationIds.includes(String(stationId))) || null;
}

/* -------------------------------------------------------------------------
   Scope
   ------------------------------------------------------------------------- */

const SCOPE_KEY = "ssv2_scope";

function remembered() {
  try {
    return JSON.parse(sessionStorage.getItem(SCOPE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function remember(scope) {
  try {
    sessionStorage.setItem(SCOPE_KEY, JSON.stringify({
      owner: scope.owner?.id || "",
      store: scope.station?.id || "",
      period: scope.period,
      time: scope.timeframe?.id || "",
    }));
  } catch { /* private browsing; the URL still carries it */ }
}

export const PERIODS = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

/**
 * Resolve the active scope from the URL, falling back to what was last used.
 *
 * A store always wins over an owner: if both are in the URL the owner is only
 * used to draw the trail above the store.
 */
export function resolveScope(model, query, { owners = model.owners || [] } = {}) {
  const saved = remembered();

  const storeId = query.has("store") ? query.get("store") : (saved.store || "");
  const station = storeId ? model.byId.get(String(storeId)) || null : null;

  const ownerId = query.has("owner") ? query.get("owner") : (saved.owner || "");
  const owner = station
    ? ownerOf(owners, station.id)
    : (owners.find((o) => o.id === ownerId) || null);

  const periodId = query.get("period") || saved.period || "month";
  const period = PERIODS.some((p) => p.id === periodId) ? periodId : "month";

  // Which months the performance pages are looking at. Unlike `period`, which
  // buckets the day feed, this selects from the monthly history.
  const timeframe = resolveTimeframe(model, query.get("t") || saved.time || "ytd");

  const stationIds = station ? [station.id] : (owner ? owner.stationIds.slice() : null);

  const scope = {
    owners,
    owner,
    station,
    period,
    timeframe,
    // `null` means the whole portfolio; views pass it straight to the analytics.
    stationIds,
    level: station ? "store" : owner ? "owner" : "all",
    count: station ? 1 : (owner ? owner.stations.length : model.stations.length),
  };
  scope.label = station ? station.name
    : owner ? owner.client
    : `All ${storeCount(model.stations.length)}`;

  remember(scope);
  return scope;
}

/** "1 store", "13 stores" — a client with one site is not "1 stores". */
function storeCount(n) {
  return `${n} store${n === 1 ? "" : "s"}`;
}

/** Rewrite a hash link so it keeps the current scope and period. */
export function withScope(href, scope) {
  const [path, search = ""] = String(href).replace(/^#/, "").split("?");
  const params = new URLSearchParams(search);
  if (scope.station) params.set("store", scope.station.id);
  else params.delete("store");
  if (scope.owner && !scope.station) params.set("owner", scope.owner.id);
  else if (!scope.station) params.delete("owner");
  if (scope.period && scope.period !== "month") params.set("period", scope.period);
  else params.delete("period");
  if (scope.timeframe && scope.timeframe.id !== "ytd") params.set("t", scope.timeframe.id);
  else params.delete("t");
  const qs = params.toString();
  return `#${path}${qs ? `?${qs}` : ""}`;
}

/* -------------------------------------------------------------------------
   Filtering the side feeds
   -------------------------------------------------------------------------
   The invoice, order, pricing and billing feeds arrive whole. They have to be
   narrowed twice: to the stores the signed-in account may see at all, and then
   to whatever the scope control is pointing at. Skipping the first would show a
   store manager another client's invoices.
   ------------------------------------------------------------------------- */

/** Store ids currently in view: the scope if one is set, else all visible. */
export function scopedStoreIds(model, scope) {
  return new Set(scope?.stationIds || model.stations.map((station) => station.id));
}

/**
 * Keep the rows belonging to stores in view.
 *
 * `storeOf` may return one id or several — a billing invoice covers a whole
 * client and carries its stores on its line items.
 */
export function inScope(model, scope, rows, storeOf = (row) => row.store) {
  const allowed = scopedStoreIds(model, scope);
  return (rows || []).filter((row) => {
    const ids = storeOf(row);
    const list = (Array.isArray(ids) ? ids : [ids])
      .map((id) => (id == null ? "" : String(id)))
      .filter(Boolean);
    // A row with no store on it cannot be attributed, so it is only shown when
    // nothing is being narrowed. Hiding it outright would lose real work.
    if (!list.length) return allowed.size === model.stations.length;
    return list.some((id) => allowed.has(id));
  });
}

/** The stores named on a billing invoice's line items. */
export function invoiceStores(invoice) {
  const ids = (invoice?.lines || []).map((line) => line?.store).filter(Boolean);
  return ids.length ? [...new Set(ids.map(String))] : [];
}

/* -------------------------------------------------------------------------
   The control
   ------------------------------------------------------------------------- */

function option(value, label, selected) {
  return `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(label)}</option>`;
}

/**
 * The scope bar: an owner picker, a store picker narrowed to that owner, and
 * the period tabs. Rendered identically at the top of every page so there is
 * one place to answer "what am I looking at".
 */
export function scopeBar(model, scope, { period = true, csv = true, time = false } = {}) {
  const owners = scope.owners || [];

  /*
   * Grouped so a two-year history does not present as one flat list of
   * twenty-six entries with the years buried among the months.
   */
  const timePicker = time ? (() => {
    const options = timeframes(model);
    const groups = [...new Set(options.map((o) => o.group))].map((group) => `
      <optgroup label="${esc(group)}">
        ${options.filter((o) => o.group === group)
          .map((o) => option(o.id, o.label, o.id === scope.timeframe?.id)).join("")}
      </optgroup>`).join("");
    return `<div class="field field-inline">
      <label for="timePick">Showing</label>
      <select class="select" id="timePick">${groups}</select>
    </div>`;
  })() : "";

  /*
   * A store manager holds one store. Showing them an owner picker and a store
   * picker with a single entry is noise, so the bar collapses to the period
   * control — and disappears entirely when the page has no period either.
   */
  if (model.stations.length < 2) {
    if (!period && !csv && !time) return "";
    return `<div class="scopebar is-slim" data-scopebar>
      <div class="scope-picks">
        <span class="scope-single">${icon("stores")}${esc(model.stations[0]?.name || "No store")}</span>
        ${timePicker}
        ${period ? `<div class="segmented" data-period>
          ${PERIODS.map((p) => `<button class="${p.id === scope.period ? "is-active" : ""}"
            data-period-set="${esc(p.id)}">${esc(p.label)}</button>`).join("")}
        </div>` : ""}
        <span class="spacer"></span>
        ${csv ? `<button class="btn btn-sm" data-csv>${icon("download")}CSV</button>` : ""}
      </div>
    </div>`;
  }

  const ownerOptions = owners
    .map((owner) => option(owner.id, `${owner.client} · ${storeCount(owner.stations.length)}`,
      scope.owner?.id === owner.id))
    .join("");

  // Narrowing the store list to the chosen owner is the point of the hierarchy:
  // pick Big Daddy and you are choosing between their thirteen, not seventeen.
  const storePool = scope.owner ? scope.owner.stations : model.stations;
  const storeOptions = storePool
    .map((station) => option(station.id, `${station.name} (${station.id})`,
      scope.station?.id === station.id))
    .join("");

  const trail = [
    `<button class="trail-step${scope.level === "all" ? " is-active" : ""}" data-scope-all>
      ${icon("stores")}All stores</button>`,
    scope.owner
      ? `<span class="trail-sep">${icon("chevron")}</span>
         <button class="trail-step${scope.level === "owner" ? " is-active" : ""}"
           data-scope-owner="${esc(scope.owner.id)}">${esc(scope.owner.client)}</button>`
      : "",
    scope.station
      ? `<span class="trail-sep">${icon("chevron")}</span>
         <span class="trail-step is-active">${esc(scope.station.name)}</span>`
      : "",
  ].join("");

  return `<div class="scopebar" data-scopebar>
    <div class="scope-trail">${trail}</div>
    <div class="scope-picks">
      <div class="field field-inline">
        <label for="ownerPick">Owner</label>
        <select class="select" id="ownerPick">
          ${option("", `All ${storeCount(model.stations.length)}`, !scope.owner)}${ownerOptions}
        </select>
      </div>
      <div class="field field-inline">
        <label for="storePick">Store</label>
        <select class="select" id="storePick">
          ${option("", scope.owner ? `All ${storeCount(scope.owner.stations.length)}` : "All stores", !scope.station)}${storeOptions}
        </select>
      </div>
      ${timePicker}
      ${period ? `<div class="field field-inline">
        <label>Period</label>
        <div class="segmented" data-period>
          ${PERIODS.map((p) => `<button class="${p.id === scope.period ? "is-active" : ""}"
            data-period-set="${esc(p.id)}">${esc(p.label)}</button>`).join("")}
        </div>
      </div>` : ""}
      <span class="spacer"></span>
      ${csv ? `<button class="btn btn-sm" data-csv>${icon("download")}CSV</button>` : ""}
    </div>
  </div>`;
}

/**
 * Wire the scope bar. Changing the owner clears the store, because a store from
 * the previous owner is not in the new owner's list and would silently keep the
 * page showing figures the header says you are not looking at.
 */
export function bindScopeBar(root, ctx) {
  const bar = root.querySelector("[data-scopebar]");
  if (!bar) return;

  const go = (mutate) => {
    const params = new URLSearchParams(ctx.query);
    mutate(params);
    const qs = params.toString();
    ctx.navigate(`#${ctx.pathname}${qs ? `?${qs}` : ""}`);
  };

  /*
   * Resets are written explicitly ("" for all stores, "ytd" for the timeframe)
   * rather than by dropping the param. `resolveScope` falls back to the last
   * remembered scope whenever a dimension is absent, so a deleted param reads as
   * "keep what you had" and the reset appears to do nothing — which is why
   * switching back to "to date" or "All stores" looked broken. An empty value is
   * present in the URL, so it wins over the remembered one. `period` already
   * works this way; these now match it.
   */
  bar.querySelector("#ownerPick")?.addEventListener("change", (event) => go((params) => {
    params.set("store", "");
    params.set("owner", event.target.value);
  }));

  bar.querySelector("#storePick")?.addEventListener("change", (event) => go((params) => {
    params.set("store", event.target.value);
  }));

  bar.querySelector("[data-scope-all]")?.addEventListener("click", () => go((params) => {
    params.set("store", "");
    params.set("owner", "");
  }));

  bar.querySelector("[data-scope-owner]")?.addEventListener("click", (event) => go((params) => {
    params.set("store", "");
    params.set("owner", event.currentTarget.dataset.scopeOwner);
  }));

  bar.querySelector("#timePick")?.addEventListener("change", (event) => go((params) => {
    params.set("t", event.target.value || "ytd");
  }));

  bar.querySelectorAll("[data-period-set]").forEach((button) => {
    button.addEventListener("click", () => go((params) => {
      params.set("period", button.dataset.periodSet);
    }));
  });

  const csv = bar.querySelector("[data-csv]");
  if (csv && ctx.csv) csv.addEventListener("click", () => ctx.csv());
}

/* -------------------------------------------------------------------------
   Periods
   ------------------------------------------------------------------------- */

const MONTH_MS = 86400000;

function isoOf(date) {
  return date.toISOString().slice(0, 10);
}

/** Monday-start week key, as an ISO date for the Monday. */
export function weekStart(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  const shift = (date.getUTCDay() + 6) % 7;
  return isoOf(new Date(date.getTime() - shift * MONTH_MS));
}

/**
 * Bucket day records into the active period.
 *
 * Day-grain data is the only place week makes sense — the monthly overlay
 * cannot be split back into weeks — so week and day both read the day feed
 * while month and year read the month feed.
 */
export function bucketDays(days, period) {
  const buckets = new Map();
  days.forEach((day) => {
    const iso = String(day.date);
    const key = period === "day" ? iso
      : period === "week" ? weekStart(iso)
      : period === "month" ? iso.slice(0, 7)
      : iso.slice(0, 4);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(day);
  });
  return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** Human label for a bucket key at the given period. */
export function periodLabel(key, period) {
  if (!key) return "—";
  if (period === "year") return key;
  if (period === "month") return monthLabel(key);
  if (period === "week") {
    const end = new Date(new Date(`${key}T00:00:00Z`).getTime() + 6 * MONTH_MS);
    return `Week of ${new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`
      + ` – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
  }
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}
