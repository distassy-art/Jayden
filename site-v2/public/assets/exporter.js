/*
 * A tiny, dependency-free Excel writer.
 *
 * The app has no build step and no room for a spreadsheet library, but a
 * manager still needs a real .xls to hand out — the crew's logins, a pay-period
 * timesheet. This emits SpreadsheetML 2003 (a single XML file Excel and Google
 * Sheets open natively, no zip, no warning) and triggers the download.
 *
 * Browser only: it touches Blob and the DOM. Keep it out of the render path.
 */

function xmlEscape(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function cell(value) {
  const isNumber = typeof value === "number" && Number.isFinite(value);
  const type = isNumber ? "Number" : "String";
  const data = isNumber ? String(value) : xmlEscape(value);
  return `<Cell><Data ss:Type="${type}">${data}</Data></Cell>`;
}

function row(values) {
  return `<Row>${values.map(cell).join("")}</Row>`;
}

/**
 * Build a SpreadsheetML workbook string from one or more sheets.
 * Each sheet: { name, headers:[...], rows:[[...], ...] }.
 */
export function buildWorkbook(sheets) {
  const body = sheets.map((sheet) => {
    const head = sheet.headers ? row(sheet.headers) : "";
    const lines = (sheet.rows || []).map(row).join("");
    return `<Worksheet ss:Name="${xmlEscape(sheet.name || "Sheet")}"><Table>${head}${lines}</Table></Worksheet>`;
  }).join("");
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" `
    + `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${body}</Workbook>`;
}

/** Build the workbook and start a download named `filename` (.xls appended). */
export function downloadExcel(filename, sheets) {
  const xml = buildWorkbook(Array.isArray(sheets) ? sheets : [sheets]);
  const name = /\.xls$/i.test(filename) ? filename : `${filename}.xls`;
  const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
