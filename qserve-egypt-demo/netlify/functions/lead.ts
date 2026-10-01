import type { Config } from "@netlify/functions";
import { upsertLead } from "../../functions/_lib/store.js";
import { json, optionsOk, storeEnv } from "./_shared/http";

export default async (req: Request) => {
  if (req.method === "OPTIONS") return optionsOk();
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sessionId = String(body.sessionId || crypto.randomUUID()).slice(0, 80);
  const row = await upsertLead(storeEnv(), sessionId, {
    name: String(body.name || "").slice(0, 80),
    phone: String(body.phone || "").slice(0, 40),
    email: String(body.email || "").slice(0, 120),
    org: String(body.org || "").slice(0, 120),
    city: String(body.city || "").slice(0, 80),
    interest: String(body.interest || "").slice(0, 80),
    kind: String(body.kind || "chat").slice(0, 40),
    locale: body.locale === "en" ? "en" : "ar",
    path: String(body.path || "").slice(0, 200),
    summary: String(body.summary || "").slice(0, 500),
    cart: Array.isArray(body.cart) ? body.cart.slice(0, 80) : [],
    transcript: Array.isArray(body.transcript) ? body.transcript.slice(-40) : [],
  });
  return json({ ok: true, sessionId: row.sessionId });
};

export const config: Config = {
  path: "/api/lead",
  method: ["POST", "OPTIONS"],
};
