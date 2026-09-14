const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const STATIONS = {
  hb: { title: "HB calendar", sub: "Arco HB · store 42179" },
  db: { title: "DB calendar", sub: "Arco DB · store 42352" },
};

/** First 4 majors on the day cell. Empty omitted. */
const FALLBACK_CELL_FIELDS = [
  { index: 1, short: "Gas Inv", tone: "gas" },
  { index: 4, short: "Safe drop", tone: "drop" },
  { index: 6, short: "Gallons", tone: "gallons" },
  { index: 8, short: "C-store", tone: "cstore" },
];

const state = {
  role: isOwner() ? "owner" : "farsai",
  station: "hb",
  year: 2026,
  month: 9,
  days: [],
  prefs: { farsai: "hb", owner: "hb" },
  summary: null,
  selectedDay: null,
  slots: [],
  cellFields: FALLBACK_CELL_FIELDS,
};

function isOwner() {
  const q = new URLSearchParams(location.search);
  return q.get("owner") === "1" || q.get("view") === "owner" || q.get("role") === "owner";
}

const els = {
  body: document.body,
  roleLabel: document.getElementById("role-label"),
  title: document.getElementById("title"),
  subtitle: document.getElementById("subtitle"),
  monthLabel: document.getElementById("month-label"),
  ownerBar: document.getElementById("owner-bar"),
  farsaiNote: document.getElementById("farsai-station-note"),
  switchLabel: document.getElementById("switch-label"),
  btnHb: document.getElementById("btn-hb"),
  btnDb: document.getElementById("btn-db"),
  grid: document.getElementById("grid"),
  totals: document.getElementById("totals"),
  trend: document.getElementById("trend"),
  status: document.getElementById("status"),
  dayDetail: document.getElementById("day-detail"),
  dayTitle: document.getElementById("day-title"),
  s2kFields: document.getElementById("s2k-fields"),
};

init();

async function init() {
  els.body.dataset.role = state.role;
  els.roleLabel.textContent = state.role === "owner" ? "Owner" : "Farsai";
  els.ownerBar.hidden = state.role !== "owner";
  els.switchLabel.textContent =
    state.role === "owner" ? "Owner station (independent of Farsai)" : "Station";
  document.getElementById("prev-month").addEventListener("click", () => shiftMonth(-1));
  document.getElementById("next-month").addEventListener("click", () => shiftMonth(1));
  els.btnHb.addEventListener("click", () => setStation("hb"));
  els.btnDb.addEventListener("click", () => setStation("db"));
  await refresh({ usePref: true });
}

async function refresh(opts = {}) {
  const params = new URLSearchParams({
    role: state.role,
    year: String(state.year),
    month: String(state.month),
  });
  if (!opts.usePref) params.set("station", state.station);
  const data = await api(`/api/state?${params}`);
  applyState(data);
}

function applyState(data) {
  if (!data?.ok) throw new Error(data?.error || "Could not load calendar");
  state.station = data.station;
  state.year = data.year;
  state.month = data.month;
  state.days = data.days ?? [];
  state.prefs = data.prefs ?? state.prefs;
  state.summary = data.summary;
  state.slots = data.slots ?? [];
  const fromApi = data.cellFields?.length ? data.cellFields : data.gridFields;
  state.cellFields = fromApi?.length ? fromApi : FALLBACK_CELL_FIELDS;
  els.body.dataset.station = state.station;
  const meta = STATIONS[state.station];
  els.title.textContent = meta.title;
  els.subtitle.textContent = meta.sub;
  els.monthLabel.textContent = `${MONTHS[state.month - 1]} ${state.year}`;
  els.btnHb.setAttribute("aria-pressed", String(state.station === "hb"));
  els.btnDb.setAttribute("aria-pressed", String(state.station === "db"));
  const farsai = (state.prefs.farsai || "hb").toUpperCase();
  els.farsaiNote.textContent = `Farsai is on ${farsai}.`;
  if (state.selectedDay && !state.days.some((row) => row.day === state.selectedDay)) {
    state.selectedDay = null;
  }
  renderGrid();
  renderSummary();
  renderDayDetail();
}

async function setStation(station) {
  state.selectedDay = null;
  const data = await api("/api/prefs", {
    method: "POST",
    body: JSON.stringify({
      role: state.role,
      station,
      year: state.year,
      month: state.month,
    }),
  });
  applyState(data);
}

async function shiftMonth(delta) {
  state.selectedDay = null;
  const d = new Date(Date.UTC(state.year, state.month - 1 + delta, 1));
  state.year = d.getUTCFullYear();
  state.month = d.getUTCMonth() + 1;
  await refresh();
}

function renderGrid() {
  const byDay = new Map(state.days.map((row) => [row.day, row]));
  const first = new Date(Date.UTC(state.year, state.month - 1, 1));
  const pad = first.getUTCDay();
  const last = new Date(Date.UTC(state.year, state.month, 0)).getUTCDate();
  const today = new Date().toISOString().slice(0, 10);
  const html = [];
  for (let i = 0; i < pad; i++) html.push(`<div class="pad"></div>`);
  for (let d = 1; d <= last; d++) {
    const iso = `${state.year}-${String(state.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const row = byDay.get(iso);
    const metrics = gridCellMetrics(row?.s2k);
    const classes = ["cell"];
    if (!metrics.length) classes.push("empty");
    if (iso === today) classes.push("today");
    if (iso === state.selectedDay) classes.push("selected");
    const lines = metrics.length
      ? `<span class="metrics">${metrics
          .map(
            (m) =>
              `<span class="metric" data-tone="${escapeHtml(m.tone)}"><span class="metric-name">${escapeHtml(m.short)}</span><span class="metric-val">${fmtNum(m.value)}</span></span>`,
          )
          .join("")}</span>`
      : `<span class="vol">—</span>`;
    const aria = metrics.length
      ? `${d}, ${metrics.map((m) => `${m.short} ${fmtNum(m.value)}`).join(", ")}`
      : String(d);
    html.push(
      `<button type="button" class="${classes.join(" ")}" data-day="${iso}" aria-label="${escapeHtml(aria)}">
        <span class="dom">${d}</span>
        ${lines}
      </button>`,
    );
  }
  els.grid.innerHTML = html.join("");
  els.grid.querySelectorAll("button[data-day]").forEach((btn) => {
    btn.addEventListener("click", () => openDay(btn.getAttribute("data-day")));
  });
}

function gridCellMetrics(s2k) {
  const fields = s2k || [];
  return (state.cellFields || FALLBACK_CELL_FIELDS).flatMap((field) => {
    const value = fields[field.index - 1];
    if (value == null) return [];
    return [{ ...field, value }];
  });
}

function fieldCount() {
  return state.slots.length || 17;
}

function slotMeta(i) {
  return state.slots[i] || { index: i + 1, label: String(i + 1) };
}

function cellIndexes() {
  return new Set((state.cellFields || FALLBACK_CELL_FIELDS).map((f) => f.index));
}

function renderSummary() {
  const grand = state.summary?.grand;
  const prior = state.summary?.priorGrand;
  els.totals.innerHTML = [
    ["Total", fmtNum(grand)],
    ["Prior period", fmtNum(prior)],
  ]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
    .join("");
  const trend = state.summary?.trend;
  if (!trend || trend.delta == null) {
    els.trend.className = "trend";
    els.trend.innerHTML = `No prior period yet.<small>${trend?.label ?? ""}</small>`;
    return;
  }
  const up = trend.delta >= 0;
  els.trend.className = `trend ${up ? "up" : "down"}`;
  const pct = trend.pct == null ? "" : ` (${Math.abs(trend.pct * 100).toFixed(1)}%)`;
  els.trend.innerHTML = `${up ? "Up" : "Down"} ${fmtNum(Math.abs(trend.delta))}${pct}<small>${trend.label}</small>`;
}

function openDay(iso) {
  state.selectedDay = iso;
  renderGrid();
  renderDayDetail({ scroll: true });
}

function renderDayDetail(opts = {}) {
  const iso = state.selectedDay;
  if (!iso) {
    els.dayDetail.hidden = true;
    els.s2kFields.innerHTML = "";
    return;
  }
  const row = state.days.find((d) => d.day === iso);
  const s2k = Array.from({ length: fieldCount() }, (_, i) => row?.s2k?.[i] ?? null);
  const onCell = cellIndexes();
  els.dayTitle.textContent = `${STATIONS[state.station].title.replace(" calendar", "")} · ${iso}`;
  const monthTotals = state.summary?.totals ?? [];
  els.s2kFields.innerHTML = [
    `<div class="s2k-row head" aria-hidden="true">
      <span class="slot"><span class="slot-num"></span><span class="slot-name">Field</span></span>
      <span class="slot-val">This day</span>
      <span class="slot-month">Month</span>
    </div>`,
    ...s2k.map((value, i) => {
      const n = i + 1;
      const slot = slotMeta(i);
      const filled = value != null ? " filled" : "";
      const onSquare = onCell.has(n) ? " on-cell" : "";
      const title = escapeHtml(slot.label);
      return `<div class="s2k-row${filled}${onSquare}">
        <span class="slot"><span class="slot-num">${n}</span><span class="slot-name">${title}</span></span>
        <span class="slot-val">${fmtNum(value)}</span>
        <span class="slot-month">${fmtNum(monthTotals[i])}</span>
      </div>`;
    }),
  ].join("");
  els.dayDetail.hidden = false;
  if (opts.scroll) {
    els.dayDetail.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtNum(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
}
