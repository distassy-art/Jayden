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
    if (!row) classes.push("empty");
    if (iso === today) classes.push("today");
    if (iso === state.selectedDay) classes.push("selected");
    const vol = row?.gas_vol != null ? `${fmtNum(row.gas_vol)} gal` : "—";
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

function renderSummary() {
  const t = state.summary?.totals ?? {};
  const rows = [
    ["Gas volume", fmtNum(t.gas_vol), "gal"],
    ["Gas profit", fmtMoney(t.gas_profit)],
    ["C-store sales", fmtMoney(t.sales)],
    ["Purchases", fmtMoney(t.purch)],
    ["Store profit", fmtMoney(t.store_profit)],
    ["Total profit", fmtMoney(t.total_profit)],
  ];
  els.totals.innerHTML = rows
    .map(
      ([k, v, suffix]) =>
        `<div><dt>${k}</dt><dd>${v}${suffix ? ` ${suffix}` : ""}</dd></div>`,
    )
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
  els.trend.innerHTML = `${up ? "Up" : "Down"} ${fmtMoney(Math.abs(trend.delta))}${pct}<small>${trend.label}</small>`;
}

function openDay(iso) {
  state.selectedDay = iso;
  renderGrid();
  const row = state.days.find((d) => d.day === iso) ?? {};
  els.dayTitle.textContent = `${STATIONS[state.station].title.replace(" calendar", "")} · ${iso}`;
  for (const name of ["gas_vol", "gas_profit", "sales", "purch", "store_profit", "total_profit"]) {
    els.dayForm.elements[name].value = row[name] ?? "";
  }
  els.dialog.showModal();
}

async function onDaySubmit(event) {
  event.preventDefault();
  const submitter = event.submitter;
  if (submitter?.value !== "save") {
    els.dialog.close();
    return;
  }
  const form = new FormData(els.dayForm);
  const payload = { station: state.station, day: state.selectedDay };
  for (const key of ["gas_vol", "gas_profit", "sales", "purch", "store_profit", "total_profit"]) {
    const raw = String(form.get(key) ?? "").trim();
    payload[key] = raw === "" ? null : Number(raw);
  }
  await api("/api/day", { method: "POST", body: JSON.stringify(payload) });
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

function fmtNum(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtMoney(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}
