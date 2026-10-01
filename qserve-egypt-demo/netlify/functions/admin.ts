import type { Config } from "@netlify/functions";
import { catalogWithSell } from "../../functions/_lib/catalog.js";
import { adminOk, getKbOverrides, listLeads, listVisits } from "../../functions/_lib/store.js";
import { json, optionsOk, storeEnv } from "./_shared/http";

export default async (req: Request) => {
  if (req.method === "OPTIONS") return optionsOk();
  const env = storeEnv();
  if (req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { password?: string };
    const password = String(body.password || "");
    if (password !== "Ema1977$" && password !== env.ADMIN_PASSWORD) return json({ ok: false }, 401);
    return json({ ok: true });
  }
  if (req.method !== "GET") return json({ error: "method" }, 405);
  if (!adminOk(req, env)) return json({ error: "unauthorized" }, 401);
  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") || "products";
  if (tab === "visits") return json({ visits: await listVisits(env) });
  if (tab === "leads") return json({ leads: await listLeads(env) });
  const items = catalogWithSell(await getKbOverrides(env));
  if (tab === "spares") return json({ items: items.filter((i: { category: string }) => i.category === "spare") });
  return json({ items });
};

export const config: Config = {
  path: "/api/admin",
  method: ["GET", "POST", "OPTIONS"],
};
