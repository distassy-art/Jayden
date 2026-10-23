import type { S2kValues } from "./calendar.ts";
import { emptyS2k } from "./calendar.ts";
import { parseLines, type NamedLookup, type S2kLine, type S2kTran } from "./s2k-client.ts";

/** Field 1 Close only — not field 6. Mid is not in Close. */
const CLOSE_GRADES = new Set(["Diesel #2", "Unleaded-Premium", "Unleaded-Regular"]);
const DIESEL_GRADE = "Diesel #2";
const FIELD2_LABELS = new Set(["Non-Integrated Fuel", "Non Fuel Integrated"]);
const FIELD3_LABELS = new Set(["Propane Exchanges", "Propane Exchange"]);
const NET_SUBTRACT = [
  "Tax 1",
  "Tax 4",
  "Scratch Tickets",
  "Lotto",
  "Card Activations",
  "Bottle Deposits - taxable",
  "Bottle Deposits - nontaxable",
];
const TAX_LABELS = new Set(["Tax 1", "Tax 4"]);
const FUEL_DEPOSIT_LABELS = new Set(["9999 Fuel Deposits", "9999 FUEL DEPOSIT"]);
const COMBO_LABELS = new Set([
  "CREDIT",
  "DEBIT",
  "EBT CASH ONL",
  "EBT FOOD ONL",
  "MOBILE",
  "Mobile",
  "PREPAID GIFT",
  "FEE",
]);

export type Lookups = {
  fuels: Map<number, string>;
  depts: Map<number, string>;
  mops: Map<number, string>;
};

export function lookupsFrom(fuels: NamedLookup[], depts: NamedLookup[], mops: NamedLookup[]): Lookups {
  return {
    fuels: toMap(fuels),
    depts: toMap(depts),
    mops: toMap(mops),
  };
}

function toMap(rows: NamedLookup[]): Map<number, string> {
  const out = new Map<number, string>();
  for (const row of rows) out.set(row.id, row.name);
  return out;
}

export function mapSeventeen(
  trans: S2kTran[],
  siteId: number,
  names: Lookups,
): S2kValues {
  const fuel0 = linesOf(trans, siteId, "fuel", 0);
  const fuel10 = linesOf(trans, siteId, "fuel", 10);
  const category0 = linesOf(trans, siteId, "category", 0);
  const rt0 = linesOf(trans, siteId, "rt", 0);
  const s2k = emptyS2k();

  s2k[0] = sumNamed(fuel10, names.fuels, CLOSE_GRADES, closeQty, 4);
  s2k[1] = sumNamed(category0, names.depts, FIELD2_LABELS, lineAmount, 2);
  s2k[2] = sumNamed(category0, names.depts, FIELD3_LABELS, lineAmount, 2);
  s2k[3] = sumNamed(rt0, names.mops, new Set(["SAFEDROP"]), lineAmount, 2);
  s2k[4] = sumNamed(fuel0, names.fuels, new Set([DIESEL_GRADE]), qtyAdj, 4);
  s2k[5] = sumFuelSalesQty(fuel0, names.fuels);
  s2k[6] = fuelProfit(fuel0);
  s2k[7] = netCstore(category0, names.depts);
  s2k[8] = sumNamed(category0, names.depts, TAX_LABELS, lineAmount, 2);
  s2k[9] = sumNamed(category0, names.depts, new Set(["Lotto"]), lineAmount, 2);
  s2k[10] = sumNamed(category0, names.depts, new Set(["Scratch Tickets"]), lineAmount, 2);
  s2k[11] = sumNamed(rt0, names.mops, new Set(["LOTTO"]), lineAmount, 2);
  s2k[12] = sumNamed(rt0, names.mops, new Set(["LOTTERY"]), lineAmount, 2);
  s2k[13] = overShort(rt0, fuel0, category0);
  s2k[14] = sumNamed(rt0, names.mops, new Set(["PAYOUT"]), lineAmount, 2);
  s2k[15] = sumNamed(rt0, names.mops, FUEL_DEPOSIT_LABELS, lineAmount, 2);
  s2k[16] = tenderCombo(rt0, names.mops);
  return s2k;
}

export function hasDailyBook(trans: S2kTran[], siteId: number): boolean {
  return trans.some(
    (row) =>
      Number(row.siteid) === siteId &&
      (row.type === "fuel" || row.type === "category" || row.type === "rt"),
  );
}

function linesOf(trans: S2kTran[], siteId: number, type: string, trantype: number): S2kLine[] {
  const out: S2kLine[] = [];
  for (const row of trans) {
    if (Number(row.siteid) !== siteId) continue;
    if (row.type !== type || Number(row.trantype) !== trantype) continue;
    out.push(...parseLines(row.lines));
  }
  return out;
}

/** Field 6: Fuel Sales Sales Qty of every named grade on that day's table, including Mid. */
function sumFuelSalesQty(lines: S2kLine[], fuels: Map<number, string>): number | null {
  let sum = 0;
  let found = false;
  for (const line of lines) {
    const label = fuels.get(Number(line.varid));
    if (!label) continue;
    const value = qtyAdj(line);
    if (value == null) continue;
    found = true;
    sum += value;
  }
  return found ? roundTo(sum, 4) : null;
}

function sumNamed(
  lines: S2kLine[],
  names: Map<number, string>,
  wanted: Set<string>,
  read: (line: S2kLine) => number | null,
  places: number,
): number | null {
  let sum = 0;
  let found = false;
  for (const line of lines) {
    const label = names.get(Number(line.varid));
    if (!label || !wanted.has(label)) continue;
    const value = read(line);
    if (value == null) continue;
    found = true;
    sum += value;
  }
  return found ? roundTo(sum, places) : null;
}

function netCstore(lines: S2kLine[], depts: Map<number, string>): number | null {
  if (!lines.length) return null;
  let total = 0;
  for (const line of lines) total += lineAmount(line) ?? 0;
  let net = total;
  for (const label of NET_SUBTRACT) {
    const piece = sumNamed(lines, depts, new Set([label]), lineAmount, 4);
    if (piece != null) net -= piece;
  }
  return roundTo(net, 2);
}

function fuelProfit(lines: S2kLine[]): number | null {
  if (!lines.length) return null;
  let total = 0;
  for (const line of lines) {
    const cost = line.cal_wcost;
    if (cost === "****") return null;
    const qty = qtyAdj(line) ?? 0;
    const amount = amountAdj(line) ?? 0;
    total += amount - (line.tax || 0) - qty * (typeof cost === "number" ? cost : Number(cost) || 0);
  }
  return roundTo(total, 4);
}

function overShort(rt: S2kLine[], fuel: S2kLine[], category: S2kLine[]): number | null {
  if (!rt.length && !fuel.length && !category.length) return null;
  const receipts = rt.reduce((n, line) => n + (lineAmount(line) ?? 0), 0);
  const fuelRev = fuel.reduce((n, line) => n + (amountAdj(line) ?? 0), 0);
  const store = category.reduce((n, line) => n + (lineAmount(line) ?? 0), 0);
  return roundTo(receipts - fuelRev - store, 2);
}

function tenderCombo(lines: S2kLine[], mops: Map<number, string>): number | null {
  return sumNamed(lines, mops, COMBO_LABELS, lineAmount, 2);
}

function lineAmount(line: S2kLine): number | null {
  return num(line.amount);
}

function qtyAdj(line: S2kLine): number | null {
  const qty = num(line.qty);
  if (qty == null && line.charge_qty == null) return null;
  return (qty ?? 0) + (num(line.charge_qty) ?? 0);
}

function amountAdj(line: S2kLine): number | null {
  const amount = num(line.amount);
  if (amount == null && line.charge == null) return null;
  return (amount ?? 0) + (num(line.charge) ?? 0);
}

function closeQty(line: S2kLine): number | null {
  const qty = num(line.qty);
  if (qty != null) return qty;
  return num(line.cal_qtyonhand);
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function roundTo(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round((value + Number.EPSILON) * f) / f;
}
