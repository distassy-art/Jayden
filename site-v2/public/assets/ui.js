/* Rendering helpers: escaping, formatting, icons, SVG charts, toasts. */

/* -------------------------------------------------------------------------
   Escaping and DOM
   ------------------------------------------------------------------------- */

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape a value for interpolation into an HTML template string. */
export function esc(value) {
  if (value == null) return "";
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

export function el(selector, root = document) {
  return root.querySelector(selector);
}

export function els(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/* -------------------------------------------------------------------------
   Number and date formatting
   ------------------------------------------------------------------------- */

const MONEY_0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const MONEY_2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUM_0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function isNum(value) {
  return value != null && value !== "" && Number.isFinite(Number(value));
}

export function money(value, { cents = false, dash = "—" } = {}) {
  if (!isNum(value)) return dash;
  return (cents ? MONEY_2 : MONEY_0).format(Number(value));
}

/** Compact money for dense cards: $1.2M, $840K. */
export function moneyShort(value, dash = "—") {
  if (!isNum(value)) return dash;
  const n = Number(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(abs >= 1e7 ? 1 : 2)}M`;
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function num(value, dash = "—") {
  if (!isNum(value)) return dash;
  return NUM_0.format(Number(value));
}

/**
 * Fuel margin is carried as dollars per gallon, not a percentage — 0.46 means
 * 46 cents a gallon. Formatting it with `pct` would read as 46%.
 */
export function perGallon(value, dash = "—") {
  if (!isNum(value)) return dash;
  return `$${Number(value).toFixed(3)}`;
}

/** Percentage from a 0..1 ratio. */
export function pct(ratio, { digits = 1, dash = "—" } = {}) {
  if (!isNum(ratio)) return dash;
  return `${(Number(ratio) * 100).toFixed(digits)}%`;
}

/** Signed percentage for deltas, from an already-multiplied percent value. */
export function pctDelta(value, { digits = 1, dash = "—" } = {}) {
  if (!isNum(value)) return dash;
  const n = Number(value);
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

/** Percent change from `before` to `after`, or null when it is undefined. */
export function change(after, before) {
  if (!isNum(after) || !isNum(before) || Number(before) === 0) return null;
  return ((Number(after) - Number(before)) / Math.abs(Number(before))) * 100;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-08" -> "August 2026". Short form gives "Aug 2026". */
export function monthLabel(key, short = false) {
  if (!key || !/^\d{4}-\d{2}$/.test(key)) return key || "—";
  const [year, month] = key.split("-");
  const name = MONTH_NAMES[Number(month) - 1] || month;
  return `${short ? name.slice(0, 3) : name} ${year}`;
}

/** "2026-08-31" -> "Aug 31, 2026". */
export function dateLabel(iso, { weekday = false } = {}) {
  if (!iso) return "—";
  const parsed = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(iso);
  return parsed.toLocaleDateString("en-US", {
    weekday: weekday ? "short" : undefined,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Relative age of a timestamp, e.g. "3 hours ago". */
export function timeAgo(value) {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const units = [
    ["minute", 60],
    ["hour", 3600],
    ["day", 86400],
    ["week", 604800],
    ["month", 2629800],
    ["year", 31557600],
  ];
  let chosen = units[0];
  for (const unit of units) {
    if (seconds >= unit[1]) chosen = unit;
  }
  const amount = Math.round(seconds / chosen[1]);
  return `${amount} ${chosen[0]}${amount === 1 ? "" : "s"} ago`;
}

/** Whole days between an ISO date and today. */
export function daysSince(iso) {
  if (!iso) return null;
  const then = new Date(`${String(iso).slice(0, 10)}T00:00:00`).getTime();
  if (Number.isNaN(then)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - then) / 86400000);
}

export function initials(name) {
  const parts = String(name || "?").trim().split(/[\s@._-]+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/* -------------------------------------------------------------------------
   Icons — a small inline set so the console has no icon-font dependency.
   ------------------------------------------------------------------------- */

const ICON_PATHS = {
  dashboard: '<path d="M3 3h7v7H3zM14 3h7v4h-7zM14 11h7v10h-7zM3 14h7v7H3z"/>',
  stores: '<path d="M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6"/>',
  invoice: '<path d="M6 2h9l5 5v15H6zM15 2v5h5M9 13h7M9 17h5M9 9h3"/>',
  orders: '<path d="M3 5h2l2.5 11h10L20 8H6M9 20a1 1 0 100-2 1 1 0 000 2zM17 20a1 1 0 100-2 1 1 0 000 2z"/>',
  billing: '<path d="M2 6h20v12H2zM2 10h20M6 15h4"/>',
  health: '<path d="M3 12h4l2.5-7 5 14L17 12h4"/>',
  alert: '<path d="M12 3l9.5 17H2.5zM12 10v4M12 17.5v.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M18 13l-6 6-6-6"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M22 12h-2.4M4.4 12H2M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7M19.1 19.1l-1.7-1.7M6.6 6.6L4.9 4.9"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/>',
  logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
  refresh: '<path d="M21 12a9 9 0 11-2.6-6.4M21 3v6h-6"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>',
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  download: '<path d="M12 3v12M7 11l5 5 5-5M4 21h16"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5M3 13l3-9h12l3 9v8H3z"/>',
  fuel: '<path d="M4 21V5a2 2 0 012-2h6a2 2 0 012 2v16M3 21h12M6 9h6M14 8l3 2.5V17a2 2 0 004 0V9l-3-3"/>',
  departments: '<path d="M3 4h7v7H3zM14 4h7v7h-7zM3 15h7v5H3zM14 15h7v5h-7z"/>',
  rankings: '<path d="M4 20V11M10 20V4M16 20v-6M22 20H2"/>',
  chart: '<path d="M3 3v18h18M7 15l3.5-4 3 2.5L20 7"/><circle cx="7" cy="15" r="1.1"/><circle cx="20" cy="7" r="1.1"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  owners: '<path d="M16 20v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 10a4 4 0 100-8 4 4 0 000 8M22 20v-2a4 4 0 00-3-3.9M16 2.1a4 4 0 010 7.8"/>',
  profit: '<path d="M3 17l6-6 4 4 8-8M21 7h-5M21 7v5"/>',
  calendar: '<path d="M4 5h16v16H4zM4 10h16M9 3v4M15 3v4"/>',
  pricing: '<path d="M3 12V4h8l9 9-8 8-9-9zM7.5 7.5v.01"/>',
  printer: '<path d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-4a2 2 0 012-2h16a2 2 0 012 2v4a2 2 0 01-2 2h-2M6 14h12v7H6z"/>',
  mail: '<path d="M3 5h18v14H3zM3 6l9 7 9-7"/>',
  pin: '<path d="M12 21s-7-6.3-7-11a7 7 0 1114 0c0 4.7-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/>',
};

/** Inline SVG icon. Returns markup (already safe) for template interpolation. */
export function icon(name, className = "ico") {
  const path = ICON_PATHS[name];
  if (!path) return "";
  return `<svg class="${esc(className)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" `
    + `stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/* -------------------------------------------------------------------------
   Small presentational fragments
   ------------------------------------------------------------------------- */

/** Coloured delta chip. `higherIsBetter=false` flips the colour mapping. */
export function deltaBadge(percent, { higherIsBetter = true, digits = 1, suffix = "" } = {}) {
  if (!isNum(percent)) return '<span class="badge">—</span>';
  const value = Number(percent);
  const flat = Math.abs(value) < 0.05;
  const good = higherIsBetter ? value > 0 : value < 0;
  const tone = flat ? "" : good ? "pos" : "neg";
  const arrow = flat ? "" : icon(value > 0 ? "up" : "down");
  return `<span class="badge ${tone}">${arrow}${esc(pctDelta(value, { digits }))}${esc(suffix)}</span>`;
}

export function emptyState(title, detail = "", iconName = "inbox") {
  return `<div class="empty">${icon(iconName)}<b>${esc(title)}</b>${detail ? `<div>${esc(detail)}</div>` : ""}</div>`;
}

export function errorState(title, detail = "", retryLabel = "") {
  return `<div class="error-box">${icon("alert")}<div><b>${esc(title)}</b><div>${esc(detail)}</div>`
    + (retryLabel ? `<button class="btn btn-sm" data-retry style="margin-top:10px">${icon("refresh")}${esc(retryLabel)}</button>` : "")
    + "</div></div>";
}

export function skeletonRows(rows = 6, cols = 4) {
  const body = Array.from({ length: rows }, () => {
    const cells = Array.from({ length: cols }, (_, i) => {
      const width = i === 0 ? "62%" : "40%";
      return `<td><div class="skeleton" style="height:13px;width:${width}"></div></td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="table"><tbody>${body}</tbody></table></div>`;
}

/* -------------------------------------------------------------------------
   SVG charts — deliberately dependency-free so the console keeps working
   even when a CDN is unreachable.
   ------------------------------------------------------------------------- */

function niceCeil(value) {
  if (!(value > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

function pathFrom(points) {
  return points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
}

/**
 * Compact trend line for stat cards. `values` is a plain number array.
 */
export function sparkline(values, { width = 140, height = 46, stroke = "var(--cyan-500)" } = {}) {
  const clean = (values || []).filter(isNum).map(Number);
  if (clean.length < 2) return "";
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const step = width / (clean.length - 1);
  const points = clean.map((value, i) => [i * step, height - 4 - ((value - min) / span) * (height - 10)]);
  const area = `${pathFrom(points)} L${width} ${height} L0 ${height} Z`;
  const id = `sp${Math.random().toString(36).slice(2, 8)}`;
  return `<svg class="stat-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${stroke}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${stroke}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#${id})"/>
    <path d="${pathFrom(points)}" fill="none" stroke="${stroke}" stroke-width="1.8"
      stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

/**
 * Multi-series line chart with a value axis and hover targets.
 * `series`: [{ name, color, values:[number|null] }]; `labels`: x tick labels.
 */
export function lineChart(labels, series, { height = 260, valueFormat = moneyShort } = {}) {
  const usable = (series || []).filter((s) => s && s.values && s.values.some(isNum));
  if (!labels || labels.length < 2 || !usable.length) {
    return emptyState("Not enough history", "At least two closed periods are needed to draw a trend.", "health");
  }

  const width = 760;
  const pad = { top: 14, right: 14, bottom: 26, left: 54 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const all = usable.flatMap((s) => s.values.filter(isNum).map(Number));
  const rawMax = Math.max(...all, 0);
  const rawMin = Math.min(...all, 0);
  const max = niceCeil(rawMax || 1);
  const min = rawMin < 0 ? -niceCeil(Math.abs(rawMin)) : 0;
  const span = max - min || 1;

  const x = (i) => pad.left + (labels.length === 1 ? plotW / 2 : (i * plotW) / (labels.length - 1));
  const y = (v) => pad.top + plotH - ((Number(v) - min) / span) * plotH;

  const ticks = 4;
  const gridlines = Array.from({ length: ticks + 1 }, (_, i) => {
    const value = min + (span * i) / ticks;
    const yy = y(value);
    return `<line class="grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/>`
      + `<text x="${pad.left - 8}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end">${esc(valueFormat(value))}</text>`;
  }).join("");

  // Thin out x labels so they never collide on narrow screens.
  const every = Math.ceil(labels.length / 8);
  const xLabels = labels.map((label, i) => (
    i % every === 0 || i === labels.length - 1
      ? `<text x="${x(i).toFixed(1)}" y="${height - 8}" text-anchor="middle">${esc(label)}</text>`
      : ""
  )).join("");

  const paths = usable.map((s) => {
    // Break the line across gaps rather than interpolating through missing months.
    const segments = [];
    let current = [];
    s.values.forEach((value, i) => {
      if (isNum(value)) current.push([x(i), y(value)]);
      else if (current.length) { segments.push(current); current = []; }
    });
    if (current.length) segments.push(current);

    const lines = segments
      .map((seg) => (seg.length === 1
        ? `<circle cx="${seg[0][0].toFixed(1)}" cy="${seg[0][1].toFixed(1)}" r="2.6" fill="${s.color}"/>`
        : `<path d="${pathFrom(seg)}" fill="none" stroke="${s.color}" stroke-width="2.2"
             stroke-linejoin="round" stroke-linecap="round"/>`))
      .join("");

    const lastIndex = [...s.values].map(isNum).lastIndexOf(true);
    const marker = lastIndex >= 0
      ? `<circle cx="${x(lastIndex).toFixed(1)}" cy="${y(s.values[lastIndex]).toFixed(1)}" r="3.4"
           fill="var(--surface)" stroke="${s.color}" stroke-width="2.2"/>`
      : "";
    return lines + marker;
  }).join("");

  const hovers = labels.map((label, i) => {
    const rows = usable
      .filter((s) => isNum(s.values[i]))
      .map((s) => `${s.name}: ${valueFormat(s.values[i])}`)
      .join(" · ");
    const bandW = plotW / labels.length;
    return `<rect x="${(x(i) - bandW / 2).toFixed(1)}" y="${pad.top}" width="${bandW.toFixed(1)}" height="${plotH}"
      fill="transparent"><title>${esc(label)} — ${esc(rows)}</title></rect>`;
  }).join("");

  const legend = usable
    .map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`)
    .join("");

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" preserveAspectRatio="xMidYMid meet">
      ${gridlines}
      <line class="axis-line" x1="${pad.left}" x2="${pad.left}" y1="${pad.top}" y2="${pad.top + plotH}"/>
      ${xLabels}${paths}${hovers}
    </svg><div class="legend" style="margin-top:10px">${legend}</div>`;
}

/**
 * Grouped vertical bars, for comparing the same months across two years.
 * `series`: [{ name, color, values:[number|null] }] aligned to `labels`.
 */
export function barChart(labels, series, { height = 260, valueFormat = moneyShort } = {}) {
  const usable = (series || []).filter((s) => s && s.values && s.values.some(isNum));
  if (!labels?.length || !usable.length) return emptyState("No figures for this period");

  const width = 760;
  const pad = { top: 14, right: 14, bottom: 26, left: 54 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const all = usable.flatMap((s) => s.values.filter(isNum).map(Number));
  const max = niceCeil(Math.max(...all, 0) || 1);
  const min = Math.min(...all, 0) < 0 ? -niceCeil(Math.abs(Math.min(...all, 0))) : 0;
  const span = max - min || 1;
  const y = (v) => pad.top + plotH - ((Number(v) - min) / span) * plotH;

  const ticks = 4;
  const gridlines = Array.from({ length: ticks + 1 }, (_, i) => {
    const value = min + (span * i) / ticks;
    const yy = y(value);
    return `<line class="grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/>`
      + `<text x="${pad.left - 8}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end">${esc(valueFormat(value))}</text>`;
  }).join("");

  const groupW = plotW / labels.length;
  const barW = Math.max(2, (groupW * 0.66) / usable.length);
  const baseline = y(0);

  const bars = labels.map((label, i) => {
    const groupX = pad.left + i * groupW + (groupW - barW * usable.length) / 2;
    return usable.map((s, j) => {
      const value = s.values[i];
      if (!isNum(value)) return "";
      const top = y(value);
      const barH = Math.abs(baseline - top);
      // A loss drawn in the same colour as a gain reads as a short bar rather
      // than as a bad day, so a series may name a second colour for values
      // below zero.
      const fill = Number(value) < 0 && s.negativeColor ? s.negativeColor : s.color;
      return `<rect x="${(groupX + j * barW).toFixed(1)}" y="${Math.min(top, baseline).toFixed(1)}"
        width="${(barW - 1.5).toFixed(1)}" height="${Math.max(barH, 0.6).toFixed(1)}"
        fill="${fill}" rx="2"><title>${esc(label)} — ${esc(s.name)}: ${esc(valueFormat(value))}</title></rect>`;
    }).join("");
  }).join("");

  const every = Math.ceil(labels.length / 12);
  const xLabels = labels.map((label, i) => (i % every === 0
    ? `<text x="${(pad.left + i * groupW + groupW / 2).toFixed(1)}" y="${height - 8}" text-anchor="middle">${esc(label)}</text>`
    : "")).join("");

  const legend = usable.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("");

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" preserveAspectRatio="xMidYMid meet">
      ${gridlines}
      <line class="axis-line" x1="${pad.left}" x2="${width - pad.right}" y1="${baseline}" y2="${baseline}"/>
      ${bars}${xLabels}
    </svg><div class="legend" style="margin-top:10px">${legend}</div>`;
}

/**
 * Horizontal bar list — used for rankings where labels are long.
 */
export function barList(items, { valueFormat = moneyShort, color = "var(--cyan-500)", max = null } = {}) {
  const rows = (items || []).filter((it) => it && isNum(it.value));
  if (!rows.length) return emptyState("Nothing to rank yet");
  const peak = max || Math.max(...rows.map((r) => Math.abs(Number(r.value))), 1);

  return `<div class="bar-list">${rows.map((row) => {
    const value = Number(row.value);
    const width = Math.max(1.5, (Math.abs(value) / peak) * 100);
    const tone = row.color || (value < 0 ? "var(--neg-line)" : color);
    return `<div class="bar-row"${row.href ? ` data-href="${esc(row.href)}"` : ""}>
      <div class="bar-name truncate" title="${esc(row.label)}">${esc(row.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${width.toFixed(1)}%;background:${tone}"></div></div>
      <div class="bar-value num">${esc(valueFormat(value))}</div>
    </div>`;
  }).join("")}</div>`;
}

/* -------------------------------------------------------------------------
   Toasts
   ------------------------------------------------------------------------- */

let toastHost = null;

export function toast(message, tone = "") {
  if (!toastHost) {
    toastHost = document.createElement("div");
    toastHost.className = "toasts";
    document.body.appendChild(toastHost);
  }
  const node = document.createElement("div");
  node.className = `toast ${tone}`;
  node.textContent = message;
  toastHost.appendChild(node);
  setTimeout(() => {
    node.style.transition = "opacity .2s, transform .2s";
    node.style.opacity = "0";
    node.style.transform = "translateY(6px)";
    setTimeout(() => node.remove(), 220);
  }, 3200);
}

/* -------------------------------------------------------------------------
   CSV export
   ------------------------------------------------------------------------- */

export function downloadCsv(filename, headers, rows) {
  const quote = (value) => {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const body = [headers, ...rows].map((row) => row.map(quote).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
