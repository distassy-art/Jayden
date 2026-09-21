import { emptyS2k, filledCount, type Station, type S2kValues } from "./calendar.ts";
import {
  S2K_STATIONS,
  S2kClient,
  type ConfirmedStation,
  type S2kTran,
} from "./s2k-client.ts";
import { hasDailyBook, lookupsFrom, mapSeventeen } from "./s2k-map.ts";
import type { PullPlan } from "./s2k-schedule.ts";

export type PullDayResult = {
  station: Station;
  day: string;
  tso: string;
  storeName: string;
  tranref: string | null;
  filled: number;
  s2k: S2kValues;
  skipped: string | null;
};

export type PullRunResult = {
  ok: boolean;
  plan: PullPlan;
  results: PullDayResult[];
  errors: string[];
};

export async function runScheduledPull(
  env: { S2K_USERNAME?: string; S2K_PASSWORD?: string },
  plan: PullPlan,
  onDay?: (row: PullDayResult) => Promise<void>,
): Promise<PullRunResult> {
  const errors: string[] = [];
  const results: PullDayResult[] = [];
  if (!plan.dates.length) {
    return { ok: true, plan, results, errors };
  }
  const username = env.S2K_USERNAME ?? "";
  const password = env.S2K_PASSWORD ?? "";
  if (!username || !password) {
    return { ok: false, plan, results, errors: ["missing_s2k_secrets"] };
  }
  const client = new S2kClient(username, password);
  try {
    await client.login();
  } catch (err) {
    return { ok: false, plan, results, errors: [errMessage(err)] };
  }

  for (const cfg of S2K_STATIONS) {
    let confirmed: ConfirmedStation;
    try {
      confirmed = await client.confirmStation(cfg);
    } catch (err) {
      errors.push(errMessage(err));
      continue;
    }
    let names;
    try {
      names = lookupsFrom(
        await client.lookupNames("lkkFuelGrade"),
        await client.lookupNames("lkkDept"),
        await client.lookupNames("lkkMop"),
      );
    } catch (err) {
      errors.push(`${cfg.station}:lookup:${errMessage(err)}`);
      continue;
    }
    for (const day of plan.dates) {
      try {
        const trans = await client.dailyBook(cfg.siteId, day);
        const row = mapStationDay(confirmed, day, trans, names);
        results.push(row);
        if (onDay) await onDay(row);
      } catch (err) {
        errors.push(`${cfg.station}:${day}:${errMessage(err)}`);
      }
    }
  }
  return { ok: errors.length === 0, plan, results, errors };
}

function mapStationDay(
  confirmed: ConfirmedStation,
  day: string,
  trans: S2kTran[],
  names: ReturnType<typeof lookupsFrom>,
): PullDayResult {
  if (!hasDailyBook(trans, confirmed.siteId)) {
    return {
      station: confirmed.station,
      day,
      tso: confirmed.tso,
      storeName: confirmed.storeName,
      tranref: null,
      filled: 0,
      s2k: emptyS2k(),
      skipped: "no_daily_book",
    };
  }
  const s2k = mapSeventeen(trans, confirmed.siteId, names);
  const tranref =
    trans.find((row) => Number(row.siteid) === confirmed.siteId && row.tranref)?.tranref ?? null;
  return {
    station: confirmed.station,
    day,
    tso: confirmed.tso,
    storeName: confirmed.storeName,
    tranref,
    filled: filledCount(s2k),
    s2k,
    skipped: null,
  };
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
