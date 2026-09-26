import { readFileSync, writeFileSync } from "node:fs";

const FROM = "orders@smartsolutionsai26.onmicrosoft.com";

function normVendor(v) {
  const s = String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (s.includes("coke") || s.includes("coca")) return "coke";
  if (s.includes("pepsi") || s.includes("7up")) return "pepsi";
  if (s.includes("core") || s.includes("cmark")) return "coremark";
  if (s.includes("harbor")) return "harbor";
  return s;
}

function orderKey(storeId, vendor, date) {
  const sid = String(storeId || "").trim();
  const dt = String(date || "").slice(0, 10);
  return `${sid}|${normVendor(vendor)}|${dt}`;
}

function shellRows(shell) {
  const rows = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    if (node.madeDate && (node.vendorName || node.vendorId) && (node.stationId || node.storeId)) {
      rows.push(node);
    }
    Object.values(node).forEach((value) => {
      if (value && typeof value === "object") walk(value);
    });
  };
  walk(shell.clients || []);
  return rows;
}

function toSend(row) {
  const send = {
    dateSent: String(row.dateSent).slice(0, 10),
    vendor: row.vendor,
    store: String(row.storeId),
    storeId: String(row.storeId),
    client: row.storeName || String(row.storeId),
    aiAmount: Number(row.aiAmount),
    orderingFee: Number(row.orderingFee),
    orderingFeeCharged: Boolean(row.orderingFeeCharged),
    status: row.status,
    pdfName: row.pdfName || null,
    emailTo: row.emailTo || "",
    subject: row.vendor,
    size: row.size || "",
    notes: row.notes || "",
    from: FROM,
    submittedByAI: Boolean(row.submittedByAI),
    mycokeDraftSaved: Boolean(row.mycokeDraftSaved)
  };
  if (row.pdfName) send.pdfUrl = `/web/orders/pdfs/${row.pdfName}`;
  return send;
}

const live = JSON.parse(readFileSync(new URL("./ledger/live-sends-document.json", import.meta.url)));
const shell = JSON.parse(readFileSync(new URL("./ledger/shell-orders.json", import.meta.url)));
const pending = JSON.parse(readFileSync(new URL("./ledger/pending-appends.json", import.meta.url)));
const originalSends = JSON.stringify(live.sends);

const protectedKeys = new Map();
for (const send of live.sends) {
  const key = orderKey(send.storeId || send.store, send.vendor, send.dateSent);
  protectedKeys.set(key, { source: "live", amount: send.aiAmount });
}
for (const row of shellRows(shell)) {
  const key = orderKey(row.stationId || row.storeId, row.vendorName || row.vendorId, row.madeDate);
  if (!protectedKeys.has(key)) {
    protectedKeys.set(key, { source: "shell", amount: row.amount });
  }
}

const added = [];
const skipped = [];
for (const row of pending) {
  const key = orderKey(row.storeId, row.vendor, row.dateSent);
  const existing = protectedKeys.get(key);
  if (existing) {
    skipped.push({
      key,
      incomingAmount: row.aiAmount,
      existingAmount: existing.amount,
      existingSource: existing.source,
      reason: "already on the list — left unchanged"
    });
    continue;
  }
  const send = toSend(row);
  added.push(send);
  protectedKeys.set(key, { source: "append", amount: send.aiAmount });
}

const out = structuredClone(live);
out.sends = live.sends.concat(added);
out.updatedAt = new Date().toISOString();
out.appendNote = "Append-only. Sends already in this file and orders already in the shell were not replaced.";

if (JSON.stringify(live.sends) !== originalSends) {
  throw new Error("live sends were mutated");
}
if (out.sends.length !== live.sends.length + added.length) {
  throw new Error("send count does not match current plus adds");
}
for (let i = 0; i < live.sends.length; i += 1) {
  if (JSON.stringify(out.sends[i]) !== JSON.stringify(live.sends[i])) {
    throw new Error(`existing send ${i} changed`);
  }
}

const seen = new Set();
for (const send of out.sends) {
  const key = orderKey(send.storeId || send.store, send.vendor, send.dateSent);
  if (seen.has(key)) throw new Error(`duplicate key in output ${key}`);
  seen.add(key);
}

writeFileSync(new URL("./vendor-orders-live.json", import.meta.url), `${JSON.stringify(out, null, 2)}\n`);
writeFileSync(new URL("./ledger/added.json", import.meta.url), `${JSON.stringify(added, null, 2)}\n`);
writeFileSync(new URL("./ledger/skipped.json", import.meta.url), `${JSON.stringify(skipped, null, 2)}\n`);

console.log(`kept ${live.sends.length} current sends, added ${added.length}, skipped ${skipped.length}`);
