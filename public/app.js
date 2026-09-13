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
  dialog: document.getElementById("day-dialog"),
  dayTitle: document.getElementById("day-title"),
  dayForm: document.getElementById("day-form"),
  dayFilled: document.getElementById("day-filled"),
  s2kFields: document.getElementById("s2k-fields"),
  file: document.getElementById("file"),
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
  els.dayForm.addEventListener("submit", onDaySubmit);
  els.s2kFields.addEventListener("click", onAddOne);
  els.s2kFields.addEventListener("keydown", onFieldKey);
  els.file.addEventListener("change", onFile);
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
  els.body.dataset.station = state.station;
  const meta = STATIONS[state.station];
  els.title.textContent = meta.title;
  els.subtitle.textContent = meta.sub;
  els.monthLabel.textContent = `${MONTHS[state.month - 1]} ${state.year}`;
  els.btnHb.setAttribute("aria-pressed", String(state.station === "hb"));
  els.btnDb.setAttribute("aria-pressed", String(state.station === "db"));
  const farsai = (state.prefs.farsai || "hb").toUpperCase();
  els.farsaiNote.textContent = `Farsai is on ${farsai}.`;
  renderGrid();
  renderSummary();
}

async function setStation(station) {
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
    const classes = ["cell"];
    const filled = (row?.s2k || []).filter((v) => v != null).length;
    if (!filled) classes.push("empty");
    if (iso === today) classes.push("today");
    if (iso === state.selectedDay) classes.push("selected");
    const vol = filled ? `${filled}/${fieldCount()}` : "—";
    html.push(
      `<button type="button" class="${classes.join(" ")}" data-day="${iso}">
        <span class="dom">${d}</span>
        <span class="vol">${vol}</span>
      </button>`,
    );
  }
  els.grid.innerHTML = html.join("");
  els.grid.querySelectorAll("button[data-day]").forEach((btn) => {
    btn.addEventListener("click", () => openDay(btn.getAttribute("data-day")));
  });
}

function fieldCount() {
  return state.slots.length || 17;
}

function slotMeta(i) {
  return state.slots[i] || { index: i + 1, label: String(i + 1) };
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
  const row = state.days.find((d) => d.day === iso);
  const s2k = Array.from({ length: fieldCount() }, (_, i) => row?.s2k?.[i] ?? null);
  els.dayTitle.textContent = `${STATIONS[state.station].title.replace(" calendar", "")} · ${iso}`;
  els.s2kFields.innerHTML = s2k
    .map((value, i) => {
      const n = i + 1;
      const slot = slotMeta(i);
      const filled = value != null ? " filled" : "";
      const title = escapeHtml(slot.label);
      return `<label class="${filled.trim()}">
        <span class="slot"><span class="slot-num">${n}</span><span class="slot-name">${title}</span></span>
        <input name="s2k-${n}" type="number" step="any" value="${value ?? ""}" data-index="${n}" aria-label="${title}" />
        <button type="button" data-add="${n}">Add</button>
      </label>`;
    })
    .join("");
  updateFilledLabel();
  els.dialog.showModal();
  const firstEmpty = els.s2kFields.querySelector("input[value=''], input:not([value])") ||
    [...els.s2kFields.querySelectorAll("input")].find((el) => el.value === "");
  firstEmpty?.focus();
}

function readS2kFromForm() {
  return Array.from({ length: fieldCount() }, (_, i) => {
    const input = els.dayForm.elements[`s2k-${i + 1}`];
    const raw = String(input?.value ?? "").trim();
    return raw === "" ? null : Number(raw);
  });
}

function updateFilledLabel() {
  const filled = readS2kFromForm().filter((v) => v != null).length;
  els.dayFilled.textContent = `${filled} of ${fieldCount()} filled`;
}

async function addOneField(index) {
  const input = els.dayForm.elements[`s2k-${index}`];
  const raw = String(input?.value ?? "").trim();
  const value = raw === "" ? null : Number(raw);
  if (raw !== "" && !Number.isFinite(value)) {
    showStatus("Enter a number", true);
    return;
  }
  await api("/api/day", {
    method: "POST",
    body: JSON.stringify({
      station: state.station,
      day: state.selectedDay,
      index,
      value,
    }),
  });
  updateFilledLabel();
  showStatus(`Saved ${slotMeta(index - 1).label} on this site.`);
  const next = els.dayForm.elements[`s2k-${index + 1}`];
  if (next) next.focus();
  await refresh();
}

function onAddOne(event) {
  const btn = event.target.closest("[data-add]");
  if (!btn) return;
  event.preventDefault();
  addOneField(Number(btn.getAttribute("data-add")));
}

function onFieldKey(event) {
  if (event.key !== "Enter") return;
  const input = event.target;
  if (input?.dataset?.index) {
    event.preventDefault();
    addOneField(Number(input.dataset.index));
  }
}

async function onDaySubmit(event) {
  event.preventDefault();
  const submitter = event.submitter;
  if (submitter?.value !== "save") {
    els.dialog.close();
    return;
  }
  await api("/api/day", {
    method: "POST",
    body: JSON.stringify({
      station: state.station,
      day: state.selectedDay,
      s2k: readS2kFromForm(),
    }),
  });
  els.dialog.close();
  showStatus("Day saved on this site.");
  await refresh();
}

async function onFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const payload = await fileToPayload(file);
    payload.role = state.role;
    payload.station = state.station;
    const data = await api("/api/import", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    showStatus(`Saved ${data.imported} ${state.station.toUpperCase()} rows on this site.`);
    if (data.year && data.month) {
      state.year = data.year;
      state.month = data.month;
    }
    await refresh();
  } catch (err) {
    showStatus(err.message || "Import failed", true);
  }
}

async function fileToPayload(file) {
  const name = file.name || "upload";
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv")) {
    return { filename: name, csv: await file.text() };
  }
  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    return { filename: name, html: await file.text() };
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const xlsx = globalThis.XLSX;
    if (!xlsx) throw new Error("Excel parser did not load");
    const buf = await file.arrayBuffer();
    const wb = xlsx.read(buf, { type: "array", cellDates: true });
    const days = [];
    for (const sheetName of wb.SheetNames) {
      const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
      days.push(...sheetRowsToDays(rows));
    }
    if (!days.length) throw new Error("No dated rows found in that workbook");
    return { filename: name, days };
  }
  throw new Error("Use Excel, CSV, or HTML");
}

function sheetRowsToDays(rows) {
  for (let headerAt = 0; headerAt < Math.min(rows.length, 12); headerAt++) {
    const labels = (rows[headerAt] || []).map((v) =>
      String(v ?? "").trim().toLowerCase(),
    );
    const dateIdx = firstIdx(labels, [["date"]]);
    if (dateIdx < 0) continue;
    const col = {
      gas_vol: firstIdx(labels, [["gas volume"], ["gas vol"], ["gallons"]]),
      gas_profit: firstIdx(labels, [["gas profit"]]),
      sales: firstIdx(labels, [["c-store sales"], ["sales"]]),
      purch: firstIdx(labels, [["purchase"]]),
      store_profit: firstIdx(labels, [["store profit"]]),
      total_profit: firstIdx(labels, [["total profit"]]),
    };
    const out = [];
    for (const row of rows.slice(headerAt + 1)) {
      const day = toIso(row[dateIdx]);
      if (!day) continue;
      const rec = { day };
      for (const [k, i] of Object.entries(col)) {
        rec[k] = i < 0 ? null : toNum(row[i]);
      }
      out.push(rec);
    }
    if (out.length) return out;
  }
  return [];
}

function firstIdx(labels, groups) {
  for (const group of groups) {
    const i = labels.findIndex((label) => group.every((n) => label.includes(n)));
    if (i >= 0) return i;
  }
  return -1;
}

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function toNum(value) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
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

function showStatus(message, isError = false) {
  els.status.hidden = false;
  els.status.textContent = message;
  els.status.className = `status${isError ? " error" : ""}`;
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

function fmtMoney(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}
