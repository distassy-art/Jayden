const MODELS = ["@cf/meta/llama-3.1-8b-instruct", "@cf/meta/llama-3.2-3b-instruct", "@cf/qwen/qwen1.5-7b-chat-awq"];

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

function textFromAi(out) {
  if (!out) return "";
  if (typeof out === "string") return out;
  if (typeof out.response === "string") return out.response;
  if (out.result && typeof out.result.response === "string") return out.result.response;
  if (Array.isArray(out.choices) && out.choices[0]?.message?.content) return out.choices[0].message.content;
  return "";
}

function hitPublic(h) {
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

export async function onRequestPost({ request, env }) {
  const { json, upsertLead, addVisit, getKbOverrides } = await import("../_lib/store.js");
  const { systemPrompt, parseActions, inferCartOps, extractPhone, pickKind } = await import("../_lib/prompt.js");
  const { searchKb, webFallback, bySku } = await import("../_lib/kb.js");

  const body = await request.json().catch(() => ({}));
  const locale = body.locale === "en" ? "en" : "ar";
  const pagePath = String(body.path || "/").slice(0, 200);
  const sessionId = String(body.sessionId || crypto.randomUUID()).slice(0, 80);
  const incoming = Array.isArray(body.messages) ? body.messages.slice(-16) : [];
  const lastUser = [...incoming].reverse().find((m) => m.role === "user") || {};
  const userText = String(lastUser.text || lastUser.content || "");
  const overrides = await getKbOverrides(env);

  let hits = searchKb(userText, overrides);
  let webNote = "";
  if (hits.length === 0 || (hits[0] && hits[0].score < 4)) {
    webNote = await webFallback(userText);
  }

  const llmMessages = [
    { role: "system", content: systemPrompt(locale, pagePath, hits, webNote) },
    ...incoming.map((m) => ({
      role: m.role === "assistant" || m.role === "bot" ? "assistant" : "user",
      content: String(m.text || m.content || "").slice(0, 2500),
    })),
  ];

  let raw = "";
  let model = "";
  let error = "";
  if (env.AI && typeof env.AI.run === "function") {
    for (const id of MODELS) {
      try {
        const out = await env.AI.run(id, { messages: llmMessages, max_tokens: 480 });
        raw = textFromAi(out).trim();
        if (raw) {
          model = id;
          break;
        }
      } catch (e) {
        error = String(e && e.message ? e.message : e);
      }
    }
  } else {
    error = "AI binding missing";
  }

  if (!raw) {
    const top = hits[0];
    if (top) {
      raw =
        locale === "en"
          ? `${top.nameEn}: ${top.descEn} I can add ${top.sku} to the cart.`
          : `${top.nameAr}: ${top.descAr} أقدر أضيف ${top.sku} للسلة.`;
      raw += `\nCART_ADD:${top.sku}:1\nNAV:${top.page}`;
    } else {
      raw =
        locale === "en"
          ? "I could not reach the factory model. Try again or WhatsApp +20 122 799 3999."
          : "تعذّر الوصول للمساعد. أعد الإرسال أو واتساب +20 122 799 3999.";
    }
  }

  const parsed = parseActions(raw, locale);
  let cartOps = parsed.cartOps;
  const inferred = inferCartOps(userText).filter((op) => bySku(op.sku, overrides) && !cartOps.some((c) => c.sku === op.sku && c.op === op.op));
  cartOps = cartOps.concat(inferred);
  const showCart = parsed.showCart || cartOps.length > 0;
  const navigate = parsed.navigate;
  const reply = parsed.reply;
  const phone = extractPhone(userText) || String(body.phone || "");
  const kind = pickKind(userText + " " + reply);
  const recommended = hits.map((h) => h.sku);
  const incomingCart = Array.isArray(body.cart) ? body.cart : [];
  let cart = incomingCart.map((l) => ({ sku: String(l.sku || ""), qty: Math.max(1, Number(l.qty) || 1) })).filter((l) => l.sku);
  for (const op of cartOps) {
    if (op.op === "remove") cart = cart.filter((l) => l.sku !== op.sku);
    if (op.op === "add" && bySku(op.sku, overrides)) {
      const row = cart.find((l) => l.sku === op.sku);
      if (row) row.qty += op.qty;
      else cart.push({ sku: op.sku, qty: op.qty });
    }
  }

  const transcript = incoming
    .concat([{ role: "assistant", text: reply }])
    .map((m) => ({ role: m.role === "assistant" || m.role === "bot" ? "bot" : "user", text: String(m.text || m.content || "") }));

  await upsertLead(env, sessionId, {
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
  await addVisit(env, { path: pagePath, locale, lookedAt: kind, source: "chat" });

  return json({
    reply,
    navigate: navigate || "",
    cartOps,
    showCart,
    cart,
    hits: hits.map(hitPublic),
    model: model || "",
    ok: Boolean(model) || hits.length > 0,
    error: model || hits.length ? "" : error,
    webUsed: Boolean(webNote),
  });
}
