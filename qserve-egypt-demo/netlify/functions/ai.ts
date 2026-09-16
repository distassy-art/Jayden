import type { Config, Context } from "@netlify/functions";
import { GoogleGenAI } from "@google/genai";
import { dialectFallback, dialectOf } from "../../functions/_lib/dialect.js";
import { bySku, searchKb, webFallback } from "../../functions/_lib/kb.js";
import { extractPhone, inferCartOps, parseActions, pickKind, systemPrompt } from "../../functions/_lib/prompt.js";
import { inferPartner, inferShipId } from "../../functions/_lib/ship.js";
import { addVisit, upsertLead } from "../../functions/_lib/store.js";
import { json, optionsOk, storeEnv } from "./_shared/http";

const MODELS = ["gemini-2.5-flash-lite", "gemini-flash-lite-latest", "gemini-2.5-flash"] as const;

type ChatMsg = { role?: string; text?: string; content?: string };

function hitPublic(h: Record<string, unknown>) {
  return {
    sku: h.sku,
    category: h.category,
    priceRule: h.priceRule,
    nameAr: h.nameAr,
    nameEn: h.nameEn,
    descAr: h.descAr,
    descEn: h.descEn,
    page: h.page,
    sellUsd: h.priceRule === "catalog-2x" ? h.sellUsd : null,
    unitAr: h.unitAr || "بند",
    unitEn: h.unitEn || "line",
    score: h.score,
  };
}

function toGeminiContents(incoming: ChatMsg[]) {
  const rows: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  for (const m of incoming) {
    const text = String(m.text || m.content || "").slice(0, 400).trim();
    if (!text) continue;
    const role: "user" | "model" = m.role === "assistant" || m.role === "bot" || m.role === "model" ? "model" : "user";
    const last = rows[rows.length - 1];
    if (last && last.role === role) {
      last.parts[0].text += `\n${text}`;
    } else {
      rows.push({ role, parts: [{ text }] });
    }
  }
  while (rows.length && rows[0].role !== "user") rows.shift();
  if (!rows.length) rows.push({ role: "user", parts: [{ text: "إزيك" }] });
  return rows;
}

function geminiText(out: unknown) {
  if (!out) return "";
  const rec = out as { text?: string; candidates?: { content?: { parts?: { text?: string }[] } }[] };
  if (typeof rec.text === "string" && rec.text.trim()) return rec.text.trim();
  const parts = rec.candidates?.[0]?.content?.parts || [];
  return parts
    .map((p) => p.text || "")
    .join("")
    .trim();
}

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") return optionsOk();
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const env = storeEnv();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const locale = body.locale === "en" ? "en" : "ar";
  const currency = String(body.currency || "EGP").toUpperCase();
  const dialect = dialectOf(currency);
  const pagePath = String(body.path || "/").slice(0, 200);
  const sessionId = String(body.sessionId || crypto.randomUUID()).slice(0, 80);
  const incoming = Array.isArray(body.messages) ? (body.messages as ChatMsg[]).slice(-6) : [];
  const lastUser = [...incoming].reverse().find((m) => m.role === "user") || {};
  const userText = String(lastUser.text || lastUser.content || "");

  const hits = searchKb(userText, {}).slice(0, 3);
  let webNote = "";
  if (!hits.length) {
    webNote = await Promise.race([
      webFallback(userText),
      new Promise<string>((resolve) => setTimeout(() => resolve(""), 350)),
    ]).catch(() => "");
  }

  const prompt = systemPrompt(locale, pagePath, hits, webNote, {
    shipId: body.shipId || "",
    partner: Boolean(body.partner),
    currency,
  });

  let raw = "";
  let model = "";
  let error = "";
  try {
    // Empty constructor: Netlify AI Gateway injects GEMINI_API_KEY + GOOGLE_GEMINI_BASE_URL.
    const ai = new GoogleGenAI({});
    for (const candidate of MODELS) {
      try {
        const out = await ai.models.generateContent({
          model: candidate,
          contents: toGeminiContents(incoming),
          config: {
            systemInstruction: prompt,
            maxOutputTokens: 96,
            temperature: 0.7,
            thinkingConfig: { thinkingBudget: 0 },
          },
        });
        raw = geminiText(out);
        if (raw) {
          model = candidate;
          break;
        }
      } catch (e) {
        error = String(e && typeof e === "object" && "message" in e ? (e as Error).message : e);
      }
    }
  } catch (e) {
    error = String(e && typeof e === "object" && "message" in e ? (e as Error).message : e);
  }

  if (!raw) {
    const top = hits[0];
    raw = dialectFallback(dialect, top);
    if (top) raw += `\nCART_ADD:${top.sku}:1\nNAV:${top.page}`;
  }

  const parsed = parseActions(raw, locale);
  let cartOps = parsed.cartOps.filter((op: { sku: string }) => !["INST-EG", "INST-ME", "SHIP-ME"].includes(op.sku));
  const inferred = inferCartOps(userText).filter(
    (op: { sku: string; op: string }) =>
      bySku(op.sku, {}) &&
      !cartOps.some((c: { sku: string; op: string }) => c.sku === op.sku && c.op === op.op) &&
      !["INST-EG", "INST-ME", "SHIP-ME"].includes(op.sku),
  );
  cartOps = cartOps.concat(inferred);
  const showCart = parsed.showCart || cartOps.length > 0;
  const navigate = parsed.navigate;
  const reply = parsed.reply;
  const shipId = parsed.shipId || inferShipId(userText) || String(body.shipId || "");
  const inferredPartner = inferPartner(userText);
  const partner =
    parsed.partner != null ? parsed.partner : inferredPartner != null ? inferredPartner : Boolean(body.partner);
  const phone = extractPhone(userText) || String(body.phone || "");
  const kind = pickKind(userText + " " + reply);
  const recommended = hits.map((h: { sku: string }) => h.sku);
  const incomingCart = Array.isArray(body.cart) ? body.cart : [];
  let cart = incomingCart
    .map((l: { sku?: string; qty?: number }) => ({ sku: String(l.sku || ""), qty: Math.max(1, Number(l.qty) || 1) }))
    .filter((l: { sku: string }) => l.sku);
  for (const op of cartOps) {
    if (op.op === "remove") cart = cart.filter((l: { sku: string }) => l.sku !== op.sku);
    if (op.op === "add" && bySku(op.sku, {})) {
      const row = cart.find((l: { sku: string }) => l.sku === op.sku);
      if (row) row.qty += op.qty;
      else cart.push({ sku: op.sku, qty: op.qty });
    }
  }

  const transcript = incoming.concat([{ role: "assistant", text: reply }]).map((m) => ({
    role: m.role === "assistant" || m.role === "bot" ? "bot" : "user",
    text: String(m.text || m.content || ""),
  }));

  void upsertLead(env, sessionId, {
    name: String(body.name || "").slice(0, 80),
    phone,
    org: String(body.org || "").slice(0, 120),
    city: String(body.city || "").slice(0, 80),
    interest: kind,
    kind,
    locale,
    path: pagePath,
    model: model || "none",
    summary: reply.slice(0, 400),
    recommended,
    cart,
    transcript,
  });
  void addVisit(env, { path: pagePath, locale, lookedAt: kind, source: "chat" });

  return json({
    reply,
    navigate: navigate || "",
    cartOps,
    showCart,
    shipId,
    partner,
    cart,
    hits: hits.map(hitPublic),
    model: model || "",
    ok: Boolean(model) || hits.length > 0,
    error: model || hits.length ? "" : error,
    webUsed: Boolean(webNote),
  });
};

export const config: Config = {
  path: "/api/ai",
  method: ["POST", "OPTIONS"],
};
