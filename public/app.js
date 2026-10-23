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

/** Canonical field 1 is a close snapshot — show on cells/details, not in month sums. */
const GAS_INV_INDEX = 1;

/** Trend: Total Gallons Sold and Net Cstore Sales vs this month’s daily average. */
const TREND_FIELDS = [
  { index: 6, short: "Gallons", tone: "gallons" },
  { index: 8, short: "C-store", tone: "cstore" },
];
const PERF_INDEXES = new Set(TREND_FIELDS.map((f) => f.index));

/** All 17 named fields. Cells use 1–3 letter keys; full names stay in day details. */
const FALLBACK_CELL_FIELDS = [
  { index: 1, short: "Gas Inv", key: "GI", tone: "gas" },
  { index: 2, short: "Non-int", key: "NI", tone: "nonint" },
  { index: 3, short: "Propane", key: "PR", tone: "propane" },
  { index: 4, short: "Safe drop", key: "SD", tone: "drop" },
  { index: 5, short: "Diesel", key: "DG", tone: "diesel" },
  { index: 6, short: "Gallons", key: "GL", tone: "gallons" },
  { index: 7, short: "Profit", key: "GP", tone: "profit" },
  { index: 8, short: "C-store", key: "CS", tone: "cstore" },
  { index: 9, short: "Tax1+4", key: "TX", tone: "tax" },
  { index: 10, short: "Lotto", key: "LS", tone: "lotto" },
  { index: 11, short: "Scratch", key: "SC", tone: "scratch" },
  { index: 12, short: "Lotto pay", key: "LP", tone: "lottopay" },
  { index: 13, short: "Lottery", key: "LY", tone: "lottery" },
  { index: 14, short: "O/S", key: "OS", tone: "os" },
  { index: 15, short: "Payouts", key: "PO", tone: "payouts" },
  { index: 16, short: "Fuel dep", key: "FD", tone: "fueldep" },
  { index: 17, short: "Credit", key: "CR", tone: "credit" },
];

/** Month footer stays the 8 majors; Gas Inventory is then omitted from sums. */
const FOOTER_FIELDS = [
  { index: 1, short: "Gas Inv", tone: "gas" },
  { index: 4, short: "Safe drop", tone: "drop" },
  { index: 6, short: "Gallons", tone: "gallons" },
  { index: 8, short: "C-store", tone: "cstore" },
  { index: 9, short: "Tax1+4", tone: "tax" },
  { index: 15, short: "Payouts", tone: "payouts" },
  { index: 14, short: "O/S", tone: "os" },
  { index: 17, short: "Credit", tone: "credit" },
];

/** Large numbers in the selected-day side panel. */
const HIGHLIGHT_FIELDS = [
  { index: 6, short: "Gallons", key: "GL", tone: "gallons" },
  { index: 8, short: "C-store", key: "CS", tone: "cstore" },
  { index: 7, short: "Profit", key: "GP", tone: "profit" },
  { index: 14, short: "O/S", key: "OS", tone: "os" },
];

const FIELD_GROUPS = [
  { id: "fuel", title: "Fuel", indexes: [6, 7, 5, 1, 2, 3, 16] },
  { id: "cstore", title: "C-store", indexes: [8, 9] },
  { id: "lottery", title: "Lottery", indexes: [10, 11, 12, 13] },
  { id: "cash", title: "Cash", indexes: [14, 4, 15, 17] },
];

const HIGHLIGHT_INDEXES = new Set(HIGHLIGHT_FIELDS.map((f) => f.index));

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
  scans: {},
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
  workspace: document.getElementById("workspace"),
  grid: document.getElementById("grid"),
  totals: document.getElementById("totals"),
  trend: document.getElementById("trend"),
  status: document.getElementById("status"),
  dayDetail: document.getElementById("day-detail"),
  dayTitle: document.getElementById("day-title"),
  closeDay: document.getElementById("close-day"),
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
  els.closeDay.addEventListener("click", closeDay);
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
  state.cellFields =
    fromApi?.length === 17 ? fromApi : FALLBACK_CELL_FIELDS;
  state.scans = data.scans && typeof data.scans === "object" ? data.scans : {};
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
    const groups = groupedFilled(row?.s2k);
    const filled = gridCellMetrics(row?.s2k).filter((m) => m.value != null);
    const classes = ["cell"];
    if (!filled.length) classes.push("empty");
    if (iso === today) classes.push("today");
    if (iso === state.selectedDay) classes.push("selected");
    const perf = perfRowHtml(row?.s2k);
    const groupHtml = groups.length
      ? `<span class="cell-groups">${groups
          .map((g) => {
            const metrics = g.items
              .map((m) => {
                const vs = PERF_INDEXES.has(m.index) ? vsAvgClass(m.index, m.value) : "";
                const perfMetric = PERF_INDEXES.has(m.index) ? " perf" : "";
                return `<span class="metric${perfMetric}${vs}" data-tone="${escapeHtml(m.tone)}" title="${escapeHtml(vsAvgTitle(m.index, m.value))}"><span class="metric-key">${escapeHtml(m.key)}</span><span class="metric-val">${fmtNum(m.value)}</span></span>`;
              })
              .join("");
            return `<span class="cell-group" data-group="${escapeHtml(g.id)}"><span class="cell-group-title">${escapeHtml(g.title)}</span><span class="metrics" data-count="${g.items.length}">${metrics}</span></span>`;
          })
          .join("")}</span>`
      : "";
    const lines = filled.length ? `${perf}${groupHtml}` : "";
    const aria = filled.length
      ? `${d}, ${filled.map((m) => `${m.short} ${fmtNum(m.value)}`).join(", ")}`
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
    const iso = btn.getAttribute("data-day");
    btn.setAttribute("aria-pressed", String(iso === state.selectedDay));
    btn.addEventListener("click", () => openDay(iso));
  });
}

function gridCellMetrics(s2k) {
  const fields = s2k || [];
  return (state.cellFields || FALLBACK_CELL_FIELDS).map((field) => ({
    ...field,
    value: fields[field.index - 1] ?? null,
  }));
}

function groupedFilled(s2k) {
  const byIndex = new Map(gridCellMetrics(s2k).map((m) => [m.index, m]));
  return FIELD_GROUPS.map((group) => ({
    ...group,
    items: group.indexes
      .filter((index) => !PERF_INDEXES.has(index))
      .map((index) => byIndex.get(index))
      .filter((m) => m && m.value != null),
  })).filter((group) => group.items.length);
}

function vsAvgClass(index, value) {
  const avg = monthAverage(index);
  if (value == null || avg == null) return "";
  return value >= avg ? " up" : " down";
}

function vsAvgTitle(index, value) {
  const label = slotMeta(index - 1).label;
  const avg = monthAverage(index);
  if (value == null || avg == null) return label;
  const above = value >= avg;
  return `${label}: ${above ? "above" : "below"} month avg ${fmtNum(avg)}`;
}

function perfRowHtml(s2k) {
  const fields = s2k || [];
  const chips = TREND_FIELDS.map((field) => {
    const value = fields[field.index - 1] ?? null;
    if (value == null) return "";
    const vs = vsAvgClass(field.index, value);
    const name = field.index === 6 ? "Gas" : "C-store";
    return `<span class="perf${vs}" data-tone="${escapeHtml(field.tone)}" title="${escapeHtml(vsAvgTitle(field.index, value))}"><span class="perf-name">${name}</span><span class="perf-val">${fmtNum(value)}</span></span>`;
  }).filter(Boolean);
  if (!chips.length) return "";
  return `<span class="perf-row">${chips.join("")}</span>`;
}

function scanPdfLink(iso, field) {
  if (field !== 4 && field !== 12 && field !== 13) return "";
  const key = String(field);
  const row = state.days.find((d) => d.day === iso);
  const href = row?.scans?.[key] ?? state.scans?.[iso]?.[key];
  if (!href) return "";
  return ` <a class="scan-pdf" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">PDF</a>`;
}

function fieldCount() {
  return state.slots.length || 17;
}

function slotMeta(i) {
  return state.slots[i] || { index: i + 1, label: String(i + 1) };
}

function fieldMeta(index) {
  return (
    (state.cellFields || FALLBACK_CELL_FIELDS).find((f) => f.index === index) ||
    FALLBACK_CELL_FIELDS[index - 1]
  );
}

function cellIndexes() {
  return HIGHLIGHT_INDEXES;
}

function includeInMonthTotals(index) {
  return index !== GAS_INV_INDEX;
}

function monthAverage(index) {
  if (!includeInMonthTotals(index)) return null;
  const fromApi = state.summary?.averages?.[index - 1];
  if (fromApi != null) return fromApi;
  const vals = state.days.map((d) => d.s2k?.[index - 1]).filter((v) => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function trendCompareRow() {
  if (state.selectedDay) {
    return state.days.find((d) => d.day === state.selectedDay) ?? null;
  }
  for (let i = state.days.length - 1; i >= 0; i--) {
    const s2k = state.days[i].s2k;
    if (s2k?.[TREND_FIELDS[0].index - 1] != null || s2k?.[TREND_FIELDS[1].index - 1] != null) {
      return state.days[i];
    }
  }
  return null;
}

function renderSummary() {
  const totals = state.summary?.totals ?? [];
  const rows = FOOTER_FIELDS
    .filter((field) => includeInMonthTotals(field.index))
    .map((field) => {
      const value = totals[field.index - 1];
      if (value == null) return null;
      return [field.short, fmtNum(value), field.tone];
    })
    .filter(Boolean);
  els.totals.innerHTML = rows.length
    ? rows
        .map(
          ([k, v, tone]) =>
            `<div data-tone="${escapeHtml(tone)}"><dt>${escapeHtml(k)}</dt><dd>${v}</dd></div>`,
        )
        .join("")
    : `<div><dt>Totals</dt><dd></dd></div>`;
  renderTrend();
}

function renderTrend() {
  const row = trendCompareRow();
  const lines = TREND_FIELDS.map((field) => {
    const avg = monthAverage(field.index);
    const value = row?.s2k?.[field.index - 1] ?? null;
    let klass = "trend-row";
    let compare = "No value this day";
    if (value != null && avg != null) {
      const delta = value - avg;
      const pct = avg === 0 ? null : delta / Math.abs(avg);
      const above = delta >= 0;
      klass += above ? " up" : " down";
      const pctTxt = pct == null ? "" : ` (${Math.abs(pct * 100).toFixed(1)}%)`;
      compare = `${above ? "above" : "below"} avg ${fmtNum(avg)}${pctTxt}`;
    } else if (avg != null) {
      compare = `avg ${fmtNum(avg)}`;
    }
    const name = field.index === 6 ? "Gas gallons" : "C-store sales";
    return `<div class="${klass}" data-tone="${escapeHtml(field.tone)}">
      <dt>${escapeHtml(name)}</dt>
      <dd>${fmtNum(value)}<small>${compare}</small></dd>
    </div>`;
  });
  const hasAvg = TREND_FIELDS.some((field) => monthAverage(field.index) != null);
  if (!hasAvg) {
    els.trend.className = "trend";
    els.trend.innerHTML = `No gallons or C-store yet.<small>vs this month’s daily average</small>`;
    return;
  }
  const which = state.selectedDay
    ? `${state.selectedDay} vs month avg`
    : row
      ? `${row.day} vs month avg`
      : "vs this month’s daily average";
  els.trend.className = "trend";
  els.trend.innerHTML = `<small>${escapeHtml(which)}</small>${lines.join("")}`;
}

function openDay(iso) {
  if (state.selectedDay === iso) {
    closeDay();
    return;
  }
  state.selectedDay = iso;
  renderGrid();
  renderTrend();
  renderDayDetail({ scroll: true });
}

function closeDay() {
  state.selectedDay = null;
  renderGrid();
  renderTrend();
  renderDayDetail();
}

function renderDayDetail(opts = {}) {
  const iso = state.selectedDay;
  els.workspace.classList.toggle("has-day", Boolean(iso));
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
  els.s2kFields.innerHTML = FIELD_GROUPS.map((group) => {
    const rows = group.indexes
      .map((n) => {
        const i = n - 1;
        const value = s2k[i];
        const slot = slotMeta(i);
        const meta = fieldMeta(n);
        const filled = value != null ? " filled" : "";
        const hero = onCell.has(n) ? " hero" : "";
        const title = escapeHtml(slot.label);
        const scan = scanPdfLink(iso, n);
        const month = includeInMonthTotals(n) ? fmtNum(monthTotals[i]) : "";
        const monthTxt = month ? `month ${month}` : "";
        return `<div class="s2k-row${filled}${hero}" data-tone="${escapeHtml(meta.tone || "other")}">
          <span class="slot"><span class="slot-key">${escapeHtml(meta.key)}</span><span class="slot-name">${title}</span></span>
          <span class="slot-nums"><span class="slot-val">${fmtNum(value)}${scan}</span><span class="slot-month">${monthTxt}</span></span>
        </div>`;
      })
      .join("");
    return `<section class="day-group" data-group="${escapeHtml(group.id)}">
      <h3>${escapeHtml(group.title)}</h3>
      ${rows}
    </section>`;
  }).join("");
  els.dayDetail.hidden = false;
  if (opts.scroll && window.matchMedia("(max-width: 1100px)").matches) {
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
  if (n == null) return "";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
}
