import type { Station } from "./calendar.ts";

const S2K_ORIGIN = "https://store.s2kprime.com";
const S2K_REQUEST_TIMEOUT_MS = 25_000;

export type S2kStationCfg = {
  station: Station;
  accountId: number;
  siteId: number;
  tso: string;
  dbname: string;
  accountName: string;
};

/** Confirm TSO in S2K before each station. DB first, then HB. */
export const S2K_STATIONS: S2kStationCfg[] = [
  {
    station: "db",
    accountId: -325,
    siteId: 387,
    tso: "42352",
    dbname: "TSO__325",
    accountName: "TSO_FARSAI & FARSAI",
  },
  {
    station: "hb",
    accountId: -218,
    siteId: 208,
    tso: "42179",
    dbname: "TSO__218",
    accountName: "TSO_HF & SJ",
  },
];

export type S2kLine = {
  varid?: number;
  qty?: number | null;
  amount?: number | null;
  tax?: number | null;
  charge?: number | null;
  charge_qty?: number | null;
  cal_wcost?: number | string | null;
  cal_qtyonhand?: number | null;
  props?: Record<string, unknown> | string | null;
};

export type S2kTran = {
  type?: string;
  trantype?: number;
  siteid?: number | string;
  tranref?: string;
  trandate?: string;
  lines?: S2kLine[] | string | null;
};

export type NamedLookup = { id: number; name: string };

export type ConfirmedStation = S2kStationCfg & {
  storeName: string;
  accountIdLive: number;
  dbnameLive: string;
};

export class S2kClient {
  private cookies = new Map<string, string>();
  private xsrf = "";
  private username: string;
  private password: string;

  constructor(username: string, password: string) {
    this.username = username;
    this.password = password;
  }

  async login(): Promise<{ accountId: number; accountName: string; dbname: string }> {
    const data = asRecord(
      await this.json("/api/auth/login", {
        provider: "local",
        email: this.username,
        password: this.password,
      }),
    );
    const accountId = Number(data.accountid);
    if (!Number.isFinite(accountId)) throw new Error("s2k_login_failed");
    return {
      accountId,
      accountName: String(data.accountname ?? ""),
      dbname: String(data.dbname ?? ""),
    };
  }

  async switchAccount(accountId: number): Promise<{ accountId: number; accountName: string; dbname: string; stores: string }> {
    const data = asRecord(
      await this.json("/api/authprivate/changeAccount", { accountid: accountId }),
    );
    if (Number(data.accountid) !== accountId) {
      throw new Error(`s2k_switch_failed:${accountId}`);
    }
    return {
      accountId: Number(data.accountid),
      accountName: String(data.accountname ?? data.name ?? ""),
      dbname: String(data.dbname ?? data.s2kdbname ?? ""),
      stores: String(data.stores ?? ""),
    };
  }

  async lookupNames(model: string): Promise<NamedLookup[]> {
    const rows = await this.json(`/api/Lookup/${model}/find`, { where: {} });
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => ({
        id: Number((row as { id?: unknown }).id),
        name: String((row as { name?: unknown }).name ?? "").trim(),
      }))
      .filter((row) => Number.isFinite(row.id) && row.name);
  }

  async dailyBook(siteId: number, day: string): Promise<S2kTran[]> {
    const rows = await this.json("/api/Tran/find", {
      where: {
        type: "all",
        trantype: 0,
        startdate: day,
        enddate: day,
        stores: String(siteId),
      },
    });
    return Array.isArray(rows) ? (rows as S2kTran[]) : [];
  }

  /**
   * Switch if needed, then confirm the live store is the expected TSO / siteid.
   * Does not Sync from HQ.
   */
  async confirmStation(cfg: S2kStationCfg): Promise<ConfirmedStation> {
    const switched = await this.switchAccount(cfg.accountId);
    const stores = await this.lookupNames("lkkStore");
    const hit = stores.find((store) => store.id === cfg.siteId);
    const storeName = hit?.name ?? "";
    const tsoOk = storeName.includes(`#${cfg.tso}`) || storeName.includes(cfg.tso);
    const accountOk =
      switched.accountId === cfg.accountId &&
      (switched.dbname === cfg.dbname ||
        switched.accountName.includes(cfg.accountName.split("&")[0]!.trim()));
    if (!hit || !tsoOk || !accountOk) {
      throw new Error(
        `s2k_station_mismatch:${cfg.station}:expected_tso_${cfg.tso}_site_${cfg.siteId}:got_${storeName || "missing"}`,
      );
    }
    return {
      ...cfg,
      storeName,
      accountIdLive: switched.accountId,
      dbnameLive: switched.dbname,
    };
  }

  private async json(path: string, body: unknown): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "farsai-calendar-worker",
    };
    if (this.cookies.size) headers.Cookie = cookieHeader(this.cookies);
    if (this.xsrf) headers["X-XSRF-TOKEN"] = this.xsrf;
    const res = await fetch(`${S2K_ORIGIN}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(S2K_REQUEST_TIMEOUT_MS),
    });
    this.captureCookies(res);
    const text = await res.text();
    if (!res.ok) throw new Error(`s2k_http_${res.status}:${path}`);
    if (!text) return [];
    return JSON.parse(text) as unknown;
  }

  private captureCookies(res: Response): void {
    const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    const fallback = res.headers.get("set-cookie");
    const lines = raw.length ? raw : fallback ? [fallback] : [];
    for (const line of lines) {
      const pair = line.split(";", 1)[0];
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      this.cookies.set(name, value);
      if (name === "XSRF-TOKEN") this.xsrf = decodeURIComponent(value);
    }
  }
}

function cookieHeader(cookies: Map<string, string>): string {
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function parseLines(raw: S2kTran["lines"]): S2kLine[] {
  let lines: unknown = raw;
  if (typeof lines === "string") {
    try {
      lines = JSON.parse(lines || "[]");
    } catch {
      return [];
    }
  }
  if (!Array.isArray(lines)) return [];
  return lines.map((line) => {
    const row = { ...(line as S2kLine) };
    if (typeof row.props === "string") {
      try {
        row.props = JSON.parse(row.props) as Record<string, unknown>;
      } catch {
        row.props = {};
      }
    }
    return row;
  });
}
