import {
  emptyS2k,
  finalizeMetrics,
  round2,
  type DayRow,
  type Station,
} from "./calendar.ts";
import { eachIsoDay } from "./parse.ts";

export const SAMPLE_START = "2026-08-01";
export const SAMPLE_END = "2026-09-13";

function unit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function sampleDay(station: Station, day: string): DayRow {
  const u = unit(`${station}:${day}`);
  const dt = new Date(`${day}T12:00:00Z`);
  const weekend = dt.getUTCDay() === 0 || dt.getUTCDay() === 6;
  const baseVol = station === "hb" ? 4420 : 3580;
  const gas_vol = round2(baseVol + (weekend ? 640 : 80) + u * 520 - 180);
  const gas_profit = round2(gas_vol * (station === "hb" ? 0.142 : 0.128) + u * 40);
  const sales = round2((station === "hb" ? 2480 : 2110) + (weekend ? 360 : 0) + u * 420);
  const purch = round2(sales * (0.68 + u * 0.04));
  return {
    day,
    s2k: emptyS2k(),
    ...finalizeMetrics({ gas_vol, gas_profit, sales, purch }),
  };
}

export type SeedDay = DayRow & { station: Station };

export function sampleSeed(): SeedDay[] {
  const out: SeedDay[] = [];
  for (const station of ["hb", "db"] as const) {
    for (const day of eachIsoDay(SAMPLE_START, SAMPLE_END)) {
      out.push({ station, ...sampleDay(station, day) });
    }
  }
  return out;
}
