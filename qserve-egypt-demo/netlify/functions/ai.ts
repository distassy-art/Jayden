import type { Config, Context } from "@netlify/functions";
import { GoogleGenAI } from "@google/genai";
import { dialectFallback, dialectOf } from "../../functions/_lib/dialect.js";
import { bySku, searchKb } from "../../functions/_lib/kb.js";
import { extractPhone, inferCartOps, parseActions, pickKind, systemPrompt } from "../../functions/_lib/prompt.js";
import { inferPartner, inferShipId } from "../../functions/_lib/ship.js";
import { addVisit, upsertLead } from "../../functions/_lib/store.js";
import { corsHeaders, json, optionsOk, storeEnv } from "./_shared/http";

const MODELS = ["gemini-2.5-flash-lite"] as const;

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
    sellUsd: null,
    unitAr: h.unitAr || "بند",
    unitEn: h.unitEn || "line",
    score: h.score,
  };
}

function toGeminiContents(incoming: ChatMsg[]) {
  const rows: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  for (const m of incoming) {
    const text = String(m.text || m.content || "").slice(0, 280).trim();
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

function mergeChunk(raw: string, piece: string) {
  if (!piece) return raw;
  if (!raw) return piece;
  if (piece.startsWith(raw)) return piece;
  if (raw.endsWith(piece)) return raw;
  return raw + piece;
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
  const incoming = Array.isArray(body.messages) ? (body.messages as ChatMsg[]).slice(-4) : [];
  const lastUser = [...incoming].reverse().find((m) => m.role === "user") || {};
  const userText = String(lastUser.text || lastUser.content || "");
  const hits = searchKb(userText, {}).slice(0, 3);
  const prompt = systemPrompt(locale, pagePath, hits, "", {
    shipId: body.shipId || "",
    partner: Boolean(body.partner),
    currency,
  });
  const contents = toGeminiContents(incoming);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      let raw = "";
      let model = "";
      let error = "";
      try {
        const ai = new GoogleGenAI({});
        for (const candidate of MODELS) {
          try {
            raw = "";
            const gen = await ai.models.generateContentStream({
              model: candidate,
              contents,
              config: {
                systemInstruction: prompt,
                maxOutputTokens: 64,
                temperature: 0.6,
                ...(candidate.includes("2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
              },
            });
            for await (const chunk of gen) {
              const piece = geminiText(chunk);
              if (!piece) continue;
              const next = mergeChunk(raw, piece);
              const delta = next.slice(raw.length);
              raw = next;
              if (delta) send({ delta });
            }
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
        if (top) raw += `\nNAV:${top.page}`;
        send({ delta: raw });
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

      send({
        done: true,
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
        webUsed: false,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
      ...corsHeaders(),
    },
  });
};

export const config: Config = {
  path: "/api/ai",
  method: ["POST", "OPTIONS"],
};
