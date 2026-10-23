import type { Config } from "@netlify/functions";
import { addVisit } from "../../functions/_lib/store.js";
import { json, optionsOk, storeEnv } from "./_shared/http";

export default async (req: Request) => {
  if (req.method === "OPTIONS") return optionsOk();
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = (await req.json().catch(() => ({}))) as Record<string, string>;
  const row = await addVisit(storeEnv(), {
    path: String(body.path || "/").slice(0, 200),
    locale: body.locale === "en" ? "en" : "ar",
    lookedAt: String(body.lookedAt || "other").slice(0, 40),
    source: String(body.source || "page").slice(0, 40),
  });
  return json({ ok: true, id: row.id });
};

export const config: Config = {
  path: "/api/visit",
  method: ["POST", "OPTIONS"],
};
