/*
 * Admin console shell: routing, chrome, sign-in and the command palette.
 *
 * Views are pure `render(ctx) -> html` functions plus an optional `bind` that
 * attaches listeners once the markup is live. Data is loaded once per session
 * and shared across views, so moving between pages is instant.
 */

import { icon, initials, esc, timeAgo, toast, monthLabel } from "./ui.js";
import { buildModel } from "./analytics.js";
import { buildCurrent } from "./current.js";
import { buildVendors } from "./vendors.js";
import { invalidate, isAdmin, loadWorkspace, session, signIn } from "./data.js";
import { buildOwners, resolveScope, withScope } from "./scope.js";
import { renderDashboard } from "./views/dashboard.js";
import { bindStores, renderStore, renderStores } from "./views/stores.js";
import { bindOwners, renderOwner, renderOwners } from "./views/owners.js";
import {
  bindInvoices, bindOrders, renderInvoices, renderOrders, renderPricing,
} from "./views/operations.js";
import {
  bindBilling, renderBilling, renderHealth, renderTickets,
} from "./views/finance.js";
import {
  bindDepartments, bindRankings, bindScope, renderDepartments, renderFuel,
  renderProfit, renderPurchases, renderRankings,
} from "./views/analysis.js";
import { bindDaily, renderDaily } from "./views/periods.js";
import { bindBudget, renderBudget } from "./views/budget.js";
import { bindCalendar, renderCalendar, renderSchedule } from "./views/planning.js";
import { bindVendors, renderVendors } from "./views/vendors.js";
import { bindTrends, renderTrends } from "./views/trends.js";
import { bindLeaks, renderLeaks } from "./views/leaks.js";
import {
  appRole, ensureGeofence,
  bindAppClock, bindAppMe, bindAppSchedule, bindAppTasks, bindAppTeam,
  renderAppClock, renderAppHome, renderAppMe, renderAppSchedule, renderAppTasks,
  renderAppTeam,
} from "./views/app.js";
import { activeEmployeeId } from "./appstore.js";
import { PUBLIC_ROUTES, renderLogin } from "./views/site.js";

/* -------------------------------------------------------------------------
   Routes
   -------------------------------------------------------------------------
   `roles` lists who may reach a page; omitting it means everyone signed in.
   Nothing is hidden behind a "more" disclosure — if a role can open a page, it
   is in that role's rail.
   ------------------------------------------------------------------------- */

const ROUTES = [
  { path: "/", title: "Command centre", icon: "dashboard", group: "Overview", render: renderDashboard, bind: bindDashboardExtras },
  { path: "/owners", title: "Owners", icon: "owners", group: "Overview", render: renderOwners, bind: bindOwners, roles: ["admin"] },
  // A manager holds one store, so a store list is a list of one.
  { path: "/stores", title: "Stores", icon: "stores", group: "Overview", render: renderStores, bind: bindStores, roles: ["admin", "owner"] },
  { path: "/owner/:id", title: "Owner", hidden: true, render: renderOwner, bind: bindOwners, roles: ["admin"] },
  { path: "/store/:id", title: "Store", hidden: true, render: renderStore },

  { path: "/trends", title: "Trends", icon: "chart", group: "Performance", render: renderTrends, bind: bindTrends },
  { path: "/profit", title: "Profit", icon: "profit", group: "Performance", render: renderProfit, bind: bindScope },
  { path: "/fuel", title: "Fuel", icon: "fuel", group: "Performance", render: renderFuel, bind: bindScope },
  { path: "/purchases", title: "Purchases", icon: "orders", group: "Performance", render: renderPurchases, bind: bindScope },
  { path: "/departments", title: "Departments", icon: "departments", group: "Performance", render: renderDepartments, bind: bindDepartments },
  { path: "/leaks", title: "Leaks", icon: "alert", group: "Performance", render: renderLeaks, bind: bindLeaks },
  { path: "/rankings", title: "Rankings", icon: "rankings", group: "Performance", render: renderRankings, bind: bindRankings, roles: ["admin", "owner"] },

  { path: "/buy", title: "The buy", icon: "pricing", group: "Operations", render: renderBudget, bind: bindBudget },
  { path: "/daily", title: "Daily close", icon: "calendar", group: "Operations", render: renderDaily, bind: bindDaily },
  { path: "/invoices", title: "S2K invoices", icon: "invoice", group: "Operations", render: renderInvoices, bind: bindInvoices },
  { path: "/orders", title: "Vendor orders", icon: "orders", group: "Operations", render: renderOrders, bind: bindOrders },
  { path: "/vendors", title: "Vendors", icon: "orders", group: "Operations", render: renderVendors, bind: bindVendors },
  { path: "/calendar", title: "Delivery calendar", icon: "calendar", group: "Operations", render: renderCalendar, bind: bindCalendar },
  { path: "/pricing", title: "Pricing", icon: "pricing", group: "Operations", render: renderPricing },
  { path: "/schedule", title: "Schedule", icon: "clock", group: "Operations", render: renderSchedule },

  { path: "/billing", title: "Billing", icon: "billing", group: "Business", render: renderBilling, bind: bindBilling, roles: ["admin", "owner"] },
  { path: "/tickets", title: "Tickets", icon: "inbox", group: "Business", render: renderTickets },
  { path: "/health", title: "Data health", icon: "health", group: "Business", render: renderHealth, roles: ["admin"] },

  /*
   * The phone app. A separate, mobile shell (see `render`) rather than a page
   * inside the console, so `app: true` marks these off. They stay out of the
   * desktop rail (`hidden`); the "Phone app" rail link is the way in.
   */
  { path: "/app", title: "Phone app", icon: "clock", app: true, hidden: true, render: renderAppHome },
  { path: "/app/schedule", title: "Schedule", app: true, hidden: true, appTab: true, icon: "calendar", render: renderAppSchedule, bind: bindAppSchedule, roles: ["admin", "owner", "manager"] },
  { path: "/app/clock", title: "My clock", app: true, hidden: true, appTab: true, icon: "clock", render: renderAppClock, bind: bindAppClock, roles: ["admin", "owner", "manager"] },
  { path: "/app/team", title: "Team", app: true, hidden: true, appTab: true, icon: "owners", render: renderAppTeam, bind: bindAppTeam, roles: ["admin", "owner", "manager"] },
  { path: "/app/tasks", title: "Tasks", app: true, hidden: true, appTab: true, icon: "check", render: renderAppTasks, bind: bindAppTasks, roles: ["admin", "owner", "manager"] },
  { path: "/app/me", title: "Employee", app: true, hidden: true, render: renderAppMe, bind: bindAppMe },
];

/** The role name used for route visibility. */
function roleOf(user) {
  if (!user) return "none";
  if (isAdmin(user)) return "admin";
  return user.role === "manager" ? "manager" : "owner";
}

function allowed(route, user) {
  return !route.roles || route.roles.includes(roleOf(user));
}

/* The manager's dashboard carries the same team schedule the phone app does.
   Everyone else's dashboard has nothing extra to wire. */
function bindDashboardExtras(root, ctx) {
  if (appRole(ctx.user) === "manager") bindAppSchedule(root, ctx);
}

/** Match a hash path against the route table, extracting `:params`. */
function matchRoute(pathname) {
  for (const route of ROUTES) {
    const routeParts = route.path.split("/").filter(Boolean);
    const pathParts = pathname.split("/").filter(Boolean);
    if (routeParts.length !== pathParts.length) continue;

    const params = {};
    const matched = routeParts.every((part, i) => {
      if (part.startsWith(":")) { params[part.slice(1)] = decodeURIComponent(pathParts[i]); return true; }
      return part === pathParts[i];
    });
    if (matched) return { route, params };
  }
  return null;
}

function parseHash() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const [pathname, search = ""] = hash.split("?");
  return { pathname: pathname || "/", query: new URLSearchParams(search) };
}

/* -------------------------------------------------------------------------
   Application state
   ------------------------------------------------------------------------- */

const state = {
  user: null,
  data: null,
  model: null,
  current: null,
  loading: false,
  loadError: null,
};

const app = document.getElementById("app");

function navigate(hash, options = {}) {
  const target = hash.startsWith("#") ? hash : `#${hash}`;
  if (location.hash === target) render(options);
  else location.hash = target;
}

/* -------------------------------------------------------------------------
   Theme
   ------------------------------------------------------------------------- */

const THEME_KEY = "ssv2_theme";

function activeTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#060f1d" : "#0b2545");
}

function toggleTheme() {
  const next = activeTheme() === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
  render();
}

applyTheme(activeTheme());

/* -------------------------------------------------------------------------
   Sign in
   ------------------------------------------------------------------------- */

/**
 * The signed-out site: the public pages, plus the one log-in form.
 *
 * The live site scatters three sign-in surfaces across the home page, the
 * footer and portal.html. There is one here, and the account decides where it
 * leads.
 */
function renderPublic(message = "") {
  document.body.classList.add("is-public");
  const { pathname } = parseHash();

  const route = PUBLIC_ROUTES.find((entry) => entry.path === pathname);
  if (route && !message) {
    app.innerHTML = route.render();
    wirePublic();
    return;
  }

  app.innerHTML = renderLogin(message);
  wirePublic();

  const form = document.getElementById("signInForm");
  const error = document.getElementById("authError");
  const button = document.getElementById("signInBtn");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    button.disabled = true;
    button.textContent = "Checking…";
    try {
      state.user = await signIn(form.username.value, form.password.value);
      document.body.classList.remove("is-public");
      location.hash = "#/";
      await boot();
    } catch (failure) {
      error.textContent = failure.message || "Could not sign in.";
      button.disabled = false;
      button.textContent = "Log in";
      form.password.select();
    }
  });

  document.getElementById("email").focus();
}

function wirePublic() {
  document.getElementById("siteBurger")?.addEventListener("click", () => {
    document.querySelector(".site-nav")?.classList.toggle("is-open");
  });
}

function signOut() {
  session.clear();
  state.user = null;
  state.data = null;
  state.model = null;
  state.current = null;
  location.hash = "#/";
  renderPublic("You have been signed out.");
}

/* -------------------------------------------------------------------------
   Chrome
   ------------------------------------------------------------------------- */

const ROLE_LABEL = { admin: "Administrator", owner: "Owner", manager: "Store manager" };

function railMarkup(activePath, scope) {
  const groups = new Map();
  ROUTES.filter((route) => !route.hidden && allowed(route, state.user)).forEach((route) => {
    if (!groups.has(route.group)) groups.set(route.group, []);
    groups.get(route.group).push(route);
  });

  const counts = attentionCounts();

  const body = [...groups.entries()].map(([group, routes]) => `
    <div class="rail-group">
      <div class="rail-label">${esc(group)}</div>
      ${routes.map((route) => {
        const active = route.path === activePath
          || (route.path === "/stores" && activePath.startsWith("/store"))
          || (route.path === "/owners" && activePath.startsWith("/owner/"));
        const count = counts[route.path];
        // Carrying the scope means picking a client once holds as you move
        // between profit, fuel and purchases.
        const href = scope ? withScope(route.path, scope) : `#${route.path}`;
        return `<a class="rail-link${active ? " is-active" : ""}" href="${esc(href)}">
          ${icon(route.icon)}<span>${esc(route.title)}</span>
          ${count ? `<span class="count${count.alert ? " alert" : ""}">${esc(count.value)}</span>` : ""}
        </a>`;
      }).join("")}
    </div>`).join("");

  const user = state.user || {};
  return `
    <div class="rail-brand">
      <a href="#/"><img src="assets/logo-wordmark-dark.png"
        srcset="assets/logo-wordmark-dark.png 1x, assets/logo-wordmark-dark@2x.png 2x"
        alt="Smart Solutions AI" width="158"></a>
    </div>
    <div class="rail-scroll">${body}
      <div class="rail-group">
        <div class="rail-label">On your phone</div>
        <a class="rail-link" href="#/app">${icon("clock")}<span>Phone app</span></a>
      </div>
    </div>
    <div class="rail-foot">
      <div class="rail-user">
        <span class="avatar">${esc(initials(user.client || user.email))}</span>
        <span class="who">
          <b class="truncate">${esc(user.client || user.email || "")}</b>
          <span>${esc(ROLE_LABEL[roleOf(user)] || "Signed in")}</span>
        </span>
      </div>
      <button class="btn btn-ghost btn-sm" id="signOut" style="width:100%;justify-content:flex-start;margin-top:4px">
        ${icon("logout")}Sign out</button>
    </div>`;
}

/** Small counters shown against rail entries. */
function attentionCounts() {
  const data = state.data;
  if (!data) return {};
  const out = {};
  const missing = data.s2k?.missing?.length || 0;
  if (missing) out["/invoices"] = { value: missing, alert: true };
  const unpaid = (data.billing?.invoices || []).filter((i) => String(i.status || "").toLowerCase() !== "paid").length;
  if (unpaid) out["/billing"] = { value: unpaid, alert: false };
  const open = (data.tickets?.tickets || []).filter((t) => String(t.status || "open").toLowerCase() !== "closed").length;
  const pending = data.days?.items?.length || 0;
  if (open + pending) out["/tickets"] = { value: open + pending, alert: open > 0 };
  return out;
}

/* -------------------------------------------------------------------------
   Print & email
   -------------------------------------------------------------------------
   Every report can be printed, saved as a PDF (through the browser's own
   "Save as PDF" printer), or emailed. Printing is driven entirely by the
   print stylesheet: the rail, the top bar and every control drop away, a
   document header with the logo, scope and timestamp is revealed, and the
   cards are flattened to ink on white. Email opens the reader's own mail
   client with the report named and a deep link back to this exact view. */

function reportTitle(route, params) {
  return route.path === "/store/:id"
    ? state.model?.byId.get(String(params.id))?.name || "Store"
    : route.title;
}

/* The scope and period behind the figures, as short phrases for the print
   header and the email. Kept identical between the two so a printed copy and
   an emailed link describe the same thing. */
function reportMeta(scope) {
  const parts = [];
  if (scope?.label) parts.push(scope.label);
  if (scope?.timeframe?.label) parts.push(scope.timeframe.label);
  if (state.model?.latestMonth) parts.push(`Books through ${monthLabel(state.model.latestMonth)}`);
  return parts;
}

/* Shown only when printing. A running footer is added in CSS. */
function printDocHead(route, scope, params) {
  const title = reportTitle(route, params);
  const meta = reportMeta(scope);
  const stamp = new Date().toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });
  const who = state.user?.email || state.user?.name || "";
  return `<div class="print-doc-head" aria-hidden="true">
    <img class="print-logo" src="assets/logo-wordmark-light.png" alt="Smart Solutions AI">
    <div class="print-doc-title">
      <h1>${esc(title)}</h1>
      ${meta.length ? `<div class="print-doc-meta">${meta.map(esc).join(" &middot; ")}</div>` : ""}
    </div>
    <div class="print-doc-stamp">
      <div>Generated ${esc(stamp)}</div>
      ${who ? `<div>${esc(who)}</div>` : ""}
    </div>
  </div>`;
}

/* Name the print job so "Save as PDF" offers a sensible file name, then hand
   off to the browser's print dialog and restore the tab title afterwards. */
function printReport() {
  const title = reportTitle(state.currentRoute, state.currentParams);
  const meta = reportMeta(state.currentScope);
  const previous = document.title;
  document.title = ["Smart Solutions", title, ...meta].join(" — ");
  const restore = () => { document.title = previous; };
  window.addEventListener("afterprint", restore, { once: true });
  // Safari never fires afterprint if the dialog is cancelled; restore anyway.
  setTimeout(restore, 60000);
  window.print();
}

function emailReport() {
  const title = reportTitle(state.currentRoute, state.currentParams);
  const scope = state.currentScope;
  const meta = reportMeta(scope).join(" · ");
  const subject = `Smart Solutions — ${title}${scope?.label ? ` (${scope.label})` : ""}`;
  const body = [
    meta ? `${title} — ${meta}` : title,
    "",
    "Open the live report:",
    location.href,
    "",
    "For a PDF, open the report and use Print, then choose “Save as PDF”.",
    "",
    `Generated ${new Date().toLocaleString()}`,
  ].join("\n");
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/* The phone app's bottom tab bar. Only the manager, who holds the crew tools,
   gets tabs; admins and owners get the numbers and nothing to fiddle with, and
   employee mode carries its own controls, so both show no bar. */
function appNavMarkup(route) {
  if (appRole(state.user) !== "manager" || route.path === "/app/me") return "";
  const tabs = [
    { path: "/app", title: "Home", ico: "dashboard" },
    { path: "/app/schedule", title: "Schedule", ico: "calendar" },
    { path: "/app/clock", title: "Clock", ico: "clock" },
    { path: "/app/team", title: "Team", ico: "owners" },
    { path: "/app/tasks", title: "Tasks", ico: "check" },
  ];
  return `<nav class="app-nav no-print">${tabs.map((t) => `<a href="#${t.path}"
    class="${route.path === t.path ? "is-active" : ""}">${icon(t.ico)}<span>${esc(t.title)}</span></a>`).join("")}</nav>`;
}

function wireAppChrome() {
  document.getElementById("appPrint")?.addEventListener("click", printReport);
}

function topbarMarkup(route, params) {
  const title = reportTitle(route, params);

  return `
    <button class="btn btn-icon btn-ghost rail-toggle no-print" id="railToggle" aria-label="Open navigation">${icon("menu")}</button>
    <h1>${esc(title)}</h1>
    ${state.model?.latestMonth ? `<span class="sub">Books through ${esc(monthLabel(state.model.latestMonth))}</span>` : ""}
    <span class="topbar-spacer"></span>
    <button class="btn btn-sm no-print" id="paletteOpen" aria-label="Search">
      ${icon("search")}<span class="palette-hint">Search</span><kbd>${navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}K</kbd>
    </button>
    <button class="btn btn-icon btn-sm no-print" id="printReport" title="Print or save as PDF" aria-label="Print or save as PDF">${icon("printer")}</button>
    <button class="btn btn-icon btn-sm no-print" id="emailReport" title="Email this report" aria-label="Email this report">${icon("mail")}</button>
    <button class="btn btn-icon btn-sm no-print" id="refresh" title="Reload data" aria-label="Reload data">${icon("refresh")}</button>
    <button class="btn btn-icon btn-sm no-print" id="themeToggle" title="Switch theme" aria-label="Switch theme">
      ${icon(activeTheme() === "dark" ? "sun" : "moon")}</button>`;
}

/* -------------------------------------------------------------------------
   Command palette
   ------------------------------------------------------------------------- */

function paletteEntries() {
  const entries = ROUTES.filter((route) => !route.hidden && allowed(route, state.user))
    .map((route) => ({ label: route.title, kind: route.group, href: `#${route.path}`, icon: route.icon }));

  (state.model?.owners || []).forEach((owner) => {
    entries.push({
      label: `${owner.client} · ${owner.stations.length} store${owner.stations.length === 1 ? "" : "s"}`,
      kind: "Owner",
      href: `#/owner/${owner.id}`,
      icon: "owners",
    });
  });

  (state.model?.stations || []).forEach((station) => {
    entries.push({
      label: `${station.name} (${station.id})`,
      kind: "Store",
      href: `#/store/${station.id}`,
      icon: "stores",
    });
  });
  return entries;
}

function openPalette() {
  if (document.querySelector(".palette-backdrop")) return;

  const entries = paletteEntries();
  const backdrop = document.createElement("div");
  backdrop.className = "palette-backdrop";
  backdrop.innerHTML = `<div class="palette" role="dialog" aria-modal="true" aria-label="Search">
      <input type="text" placeholder="Jump to a page or a store…" aria-label="Search" autocomplete="off">
      <div class="palette-list"></div>
    </div>`;
  document.body.appendChild(backdrop);

  const input = backdrop.querySelector("input");
  const list = backdrop.querySelector(".palette-list");
  let cursor = 0;
  let visible = entries;

  function paint() {
    const term = input.value.trim().toLowerCase();
    visible = term
      ? entries.filter((entry) => entry.label.toLowerCase().includes(term)
        || entry.kind.toLowerCase().includes(term))
      : entries;
    cursor = Math.min(cursor, Math.max(visible.length - 1, 0));

    list.innerHTML = visible.length
      ? visible.map((entry, i) => `<div class="palette-item${i === cursor ? " is-active" : ""}" data-index="${i}">
          ${icon(entry.icon)}<span>${esc(entry.label)}</span><span class="kind">${esc(entry.kind)}</span>
        </div>`).join("")
      : `<div class="palette-group">No matches</div>`;

    list.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
  }

  function close() {
    backdrop.remove();
    document.removeEventListener("keydown", onKey, true);
  }

  function choose(index) {
    const entry = visible[index];
    if (!entry) return;
    close();
    navigate(entry.href);
  }

  function onKey(event) {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); cursor = Math.min(cursor + 1, visible.length - 1); paint(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); cursor = Math.max(cursor - 1, 0); paint(); }
    else if (event.key === "Enter") { event.preventDefault(); choose(cursor); }
  }

  input.addEventListener("input", () => { cursor = 0; paint(); });
  list.addEventListener("click", (event) => {
    const item = event.target.closest("[data-index]");
    if (item) choose(Number(item.dataset.index));
  });
  backdrop.addEventListener("mousedown", (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener("keydown", onKey, true);

  paint();
  input.focus();
}

/* -------------------------------------------------------------------------
   Render
   ------------------------------------------------------------------------- */

function loadingMarkup() {
  return `<div class="page-head">
      <div class="skeleton" style="height:24px;width:220px"></div>
      <div class="skeleton" style="height:14px;width:420px;margin-top:10px"></div>
    </div>
    <div class="grid cols-4" style="margin-bottom:16px">
      ${Array.from({ length: 4 }, () => `<div class="stat">
        <div class="skeleton" style="height:11px;width:80px"></div>
        <div class="skeleton" style="height:26px;width:120px;margin-top:10px"></div>
        <div class="skeleton" style="height:12px;width:100px;margin-top:14px"></div>
      </div>`).join("")}
    </div>
    <div class="card"><div class="card-body">
      <div class="skeleton" style="height:240px;width:100%"></div>
    </div></div>`;
}

function render(options = {}) {
  if (!state.user) { renderPublic(); return; }
  document.body.classList.remove("is-public");

  const { pathname, query } = parseHash();
  const matched = matchRoute(pathname) || { route: ROUTES[0], params: {} };
  let { route } = matched;
  const { params } = matched;
  if (!allowed(route, state.user)) route = ROUTES[0];

  const scope = state.model ? resolveScope(state.model, query) : null;
  const ctx = {
    ...state, query, params, pathname, scope, navigate, refresh,
    rerender: () => render({ preserveScroll: true }),
  };

  let body;
  if (state.loading && !state.data) body = loadingMarkup();
  else if (state.loadError) {
    body = `<div class="page-head"><h2>Could not load the console</h2></div>
      <div class="error-box">${icon("alert")}<div><b>${esc(state.loadError)}</b>
        <div>The upstream site may be unreachable, or this account may not have access.</div>
        <button class="btn btn-sm" id="retryLoad" style="margin-top:10px">${icon("refresh")}Try again</button>
      </div></div>`;
  } else {
    try {
      body = route.render(ctx);
    } catch (failure) {
      console.error(failure);
      body = `<div class="error-box">${icon("alert")}<div><b>This page could not be drawn</b>
        <div>${esc(failure.message || String(failure))}</div></div></div>`;
    }
  }

  app.innerHTML = route.app
    ? `<div class="appview">
        <header class="app-top">
          <img class="app-mark" src="assets/logo-wordmark-dark.png" alt="Smart Solutions AI">
          <h1>${esc(reportTitle(route, params))}</h1>
          <span class="app-role no-print">${esc(appRole(state.user))}</span>
          <button class="app-icon-btn no-print" id="appPrint" title="Print or save as PDF" aria-label="Print">${icon("printer")}</button>
          <a class="app-icon-btn no-print" href="#/" title="Full console" aria-label="Full console">${icon("external")}</a>
        </header>
        <main class="app-body" id="content">${body}</main>
        ${appNavMarkup(route)}
      </div>`
    : `<div class="shell">
      <aside class="rail no-print" id="rail">${railMarkup(route.path, scope)}</aside>
      <div>
        <header class="topbar">${topbarMarkup(route, params)}</header>
        <main class="content" id="content">${state.model ? printDocHead(route, scope, params) : ""}${body}</main>
      </div>
      <div class="print-doc-foot" aria-hidden="true">smartsolutionsai.us · Confidential management report</div>
    </div>`;

  document.body.classList.toggle("is-appview", Boolean(route.app));

  state.currentRoute = route;
  state.currentScope = scope;
  state.currentParams = params;
  wireChrome();
  if (route.app) wireAppChrome();
  if (route.bind && state.data) {
    try {
      route.bind(document.getElementById("content"), ctx);
    } catch (failure) {
      console.error(failure);
    }
  }

  // Keep the location watch alive for whoever is clocked in on this device,
  // whatever screen is showing, so leaving the store still clocks them out.
  if (route.app && state.data) {
    ensureGeofence(activeEmployeeId(), () => render({ preserveScroll: true }))
      .catch((err) => console.error(err));
  }

  if (options.keepFocus) {
    const field = document.querySelector(options.keepFocus);
    if (field) {
      field.focus();
      const length = field.value.length;
      field.setSelectionRange(length, length);
    }
  } else if (!options.preserveScroll) {
    document.getElementById("content")?.scrollTo?.(0, 0);
    window.scrollTo(0, 0);
  }
}

function wireChrome() {
  document.getElementById("signOut")?.addEventListener("click", signOut);
  document.getElementById("themeToggle")?.addEventListener("click", toggleTheme);
  document.getElementById("paletteOpen")?.addEventListener("click", openPalette);
  document.getElementById("printReport")?.addEventListener("click", printReport);
  document.getElementById("emailReport")?.addEventListener("click", emailReport);
  document.getElementById("refresh")?.addEventListener("click", () => refresh(true));
  document.getElementById("retryLoad")?.addEventListener("click", () => refresh(true));

  const rail = document.getElementById("rail");
  document.getElementById("railToggle")?.addEventListener("click", () => {
    rail.classList.add("is-open");
    const scrim = document.createElement("div");
    scrim.className = "rail-scrim";
    scrim.addEventListener("click", () => { rail.classList.remove("is-open"); scrim.remove(); });
    document.body.appendChild(scrim);
  });

  // Whole-row navigation for tables and bar lists.
  document.getElementById("content")?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-href]");
    if (!target || event.target.closest("a,button")) return;
    navigate(target.dataset.href);
  });
}

/* -------------------------------------------------------------------------
   Loading
   ------------------------------------------------------------------------- */

/*
 * Stores the signed-in account may see. The upstream feed already filters by
 * `x-ss-email`, but a client's figures are the one thing that must not leak if
 * that ever changes, so the console narrows the model as well.
 */
function visibleStores() {
  const user = state.user;
  if (!user || isAdmin(user)) return null;
  const ids = (user.stores || []).map(String).filter(Boolean);
  return ids.length ? ids : null;
}

async function refresh(force = false) {
  if (force) invalidate();
  state.loading = true;
  state.loadError = null;
  render({ preserveScroll: true });

  try {
    const data = await loadWorkspace({ maxAge: force ? 0 : 120000 });
    if (!data.overlay) throw new Error(data.errors.overlay || "The books feed is unavailable.");
    state.data = data;

    const model = buildModel(data.overlay, {
      stores: visibleStores(),
      monthly: data.monthly,
      openDays: data.openDays,
      depts: data.depts,
    });
    model.owners = buildOwners(data.owners?.accounts || [], model);
    state.model = model;
    // The open month comes from a separate feed; the console still works
    // without it, so a failure here only blanks the pages that need it.
    state.current = buildCurrent(data.manager, { stores: visibleStores() });
    // Same for vendor spend: it narrows to the stores this account may see, so
    // it is built here rather than in the view.
    data.vendors = buildVendors(data.vendorSpend, { stores: visibleStores() });
    if (force) toast("Data reloaded");
  } catch (failure) {
    state.loadError = failure.message || "Something went wrong.";
  } finally {
    state.loading = false;
    render({ preserveScroll: true });
  }
}

async function boot() {
  state.user = session.read();
  if (!state.user) { renderPublic(); return; }
  document.body.classList.remove("is-public");
  await refresh();
}

/* -------------------------------------------------------------------------
   Wiring
   ------------------------------------------------------------------------- */

window.addEventListener("hashchange", () => render());

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (state.user) openPalette();
  }
});

boot().catch((failure) => {
  console.error(failure);
  state.loadError = failure.message || "Startup failed.";
  render();
});
