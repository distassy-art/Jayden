import assert from "node:assert/strict";
import test from "node:test";
import { lookupsFrom, mapSeventeen, hasDailyBook } from "../src/lib/s2k-map.ts";
import type { S2kTran } from "../src/lib/s2k-client.ts";

const names = lookupsFrom(
  [
    { id: 1, name: "Unleaded-Regular" },
    { id: 2, name: "Unleaded-Mid Grade Blended" },
    { id: 3, name: "Unleaded-Premium" },
    { id: 7, name: "Diesel #2" },
  ],
  [
    { id: 181, name: "Non-Integrated Fuel" },
    { id: 9750, name: "Propane Exchanges" },
    { id: 9760, name: "Lotto" },
    { id: 9765, name: "Scratch Tickets" },
    { id: 10001, name: "Tax 1" },
    { id: 10004, name: "Tax 4" },
    { id: 3302, name: "Card Activations" },
    { id: 9700, name: "Bottle Deposits - taxable" },
    { id: 9705, name: "Bottle Deposits - nontaxable" },
    { id: 800, name: "Candy" },
  ],
  [
    { id: -18, name: "SAFEDROP" },
    { id: -17, name: "PAYOUT" },
    { id: 1, name: "9999 Fuel Deposits" },
    { id: -5, name: "LOTTO" },
    { id: -32, name: "LOTTO PAYOUT" },
    { id: -8, name: "LOTTERY" },
    { id: -6, name: "CREDIT" },
    { id: -13, name: "DEBIT" },
    { id: 4, name: "EBT CASH ONL" },
    { id: 6, name: "FEE" },
    { id: 12, name: "MOBILE" },
    { id: -27, name: "PREPAID GIFT" },
  ],
);

function tran(type: string, trantype: number, lines: object[], siteid = 387): S2kTran {
  return { type, trantype, siteid, tranref: "0@2026-09-14.162", lines: lines as S2kTran["lines"] };
}

test("maps the 17 fields from Daily Book labels and skips missing ones instead of inventing 0", () => {
  const trans: S2kTran[] = [
    tran("fuel", 10, [
      { varid: 7, qty: 2090 },
      { varid: 3, qty: 4132 },
      { varid: 1, qty: 7326 },
    ]),
    tran("fuel", 0, [
      { varid: 7, qty: 191.031, amount: 1642.77, tax: 217.373, cal_wcost: 4.5, charge: 0 },
      { varid: 3, qty: 1017.636, amount: 6263.11, tax: 284.0074, cal_wcost: 3.2, charge: 0 },
      { varid: 1, qty: 5337.476, amount: 30090.87, tax: 1364.5025, cal_wcost: 2.9, charge: 0 },
      { varid: 2, qty: 475.79, amount: 2825.25, tax: 128.114, cal_wcost: 3.0, charge: 0 },
    ]),
    tran("category", 0, [
      { varid: 181, amount: 31.75 },
      { varid: 9760, amount: 491 },
      { varid: 9765, amount: 6787 },
      { varid: 10001, amount: 299.71 },
      { varid: 9700, amount: 10 },
      { varid: 9705, amount: 5 },
      { varid: 800, amount: 100 },
    ]),
    tran("rt", 0, [
      { varid: -18, amount: 14877 },
      { varid: -17, amount: 100 },
      { varid: 1, amount: 15 },
      { varid: -5, amount: 52 },
      { varid: -8, amount: 859 },
      { varid: -6, amount: 10000 },
      { varid: -13, amount: 20000 },
      { varid: 4, amount: 50 },
      { varid: 6, amount: -67.04 },
      { varid: 12, amount: 100 },
      { varid: -27, amount: 20 },
    ]),
  ];
  const s2k = mapSeventeen(trans, 387, names);
  assert.equal(s2k[0], 13548);
  assert.equal(s2k[1], 31.75);
  assert.equal(s2k[2], null, "propane label missing → skip, not 0");
  assert.equal(s2k[3], 14877);
  assert.equal(s2k[4], 191.031, "field 5 is Diesel #2 only");
  assert.equal(s2k[5], 7021.933, "field 6 is every Fuel Sales grade including Mid");
  assert.equal(s2k[8], 299.71, "Tax 4 missing → Tax 1 only");
  assert.equal(s2k[9], 491);
  assert.equal(s2k[10], 6787);
  assert.equal(s2k[11], 52);
  assert.equal(s2k[12], 859);
  assert.equal(s2k[14], 100);
  assert.equal(s2k[15], 15);
  assert.equal(s2k[16], 30102.96);
  assert.ok(s2k[6] != null);
  assert.equal(s2k[7], 131.75);
  assert.ok(!hasDailyBook([], 387));
  assert.ok(hasDailyBook(trans, 387));
});

test("field 6 includes Mid when the row exists; does not use LOTTO PAYOUT or a missing PAYOUT as 0", () => {
  const trans: S2kTran[] = [
    tran("fuel", 0, [
      { varid: 2, qty: 100, amount: 500, tax: 0, cal_wcost: 2, charge: 0 },
      { varid: 1, qty: 10, amount: 50, tax: 1, cal_wcost: 2, charge: 0 },
    ]),
    tran("rt", 0, [{ varid: -32, amount: 999 }]),
  ];
  const s2k = mapSeventeen(trans, 387, names);
  assert.equal(s2k[4], null, "field 5 stays blank without Diesel #2");
  assert.equal(s2k[5], 110, "Mid + Regular Sales Qty");
  assert.equal(s2k[11], null, "LOTTO PAYOUT is not field 12");
  assert.equal(s2k[14], null, "missing PAYOUT stays blank");
  assert.equal(s2k[16], null);
  assert.equal(s2k.filter((v) => v != null).length, 3);
});

test("field 6 skips unnamed Fuel Sales grades instead of inventing 0", () => {
  const trans: S2kTran[] = [
    tran("fuel", 0, [
      { varid: 1, qty: 10, amount: 50, tax: 1, cal_wcost: 2, charge: 0 },
      { varid: 99, qty: 999, amount: 1, tax: 0, cal_wcost: 1, charge: 0 },
    ]),
  ];
  const s2k = mapSeventeen(trans, 387, names);
  assert.equal(s2k[5], 10);
});

test("PAYOUT $0.00 is stored because the label exists", () => {
  const trans: S2kTran[] = [tran("rt", 0, [{ varid: -17, amount: 0 }])];
  const s2k = mapSeventeen(trans, 387, names);
  assert.equal(s2k[14], 0);
  assert.equal(s2k[3], null);
});

test("wrong siteid is ignored so Combined Summary cannot fill a station", () => {
  const trans: S2kTran[] = [
    tran("fuel", 10, [{ varid: 1, qty: 99 }], 999),
    tran("rt", 0, [{ varid: -18, amount: 1 }], 387),
  ];
  const s2k = mapSeventeen(trans, 387, names);
  assert.equal(s2k[0], null);
  assert.equal(s2k[3], 1);
});
