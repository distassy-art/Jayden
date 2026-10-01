export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

export async function onRequestPost({ request, env }) {
  const { dialectOf } = await import("../_lib/dialect.js");
  const { synthesize } = await import("../_lib/tts.js");
  const body = await request.json().catch(() => ({}));
  const dialectRaw = String(body.dialect || "");
  const allowed = ["eg", "ae", "sa", "qa", "kw", "en"];
  const dialect = allowed.includes(dialectRaw) ? dialectRaw : dialectOf(body.currency);
  const text = String(body.text || "").slice(0, 1200);
  if (!text.trim()) {
    return new Response(JSON.stringify({ ok: false, error: "empty" }), {
      status: 400,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
    });
  }
  const out = await synthesize(env, text, dialect);
  if (!out?.bytes) {
    return new Response(JSON.stringify({ ok: false, error: out?.error || "tts failed" }), {
      status: 503,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
    });
  }
  return new Response(out.bytes, {
    headers: {
      "content-type": out.mime || "audio/mpeg",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
      "x-qserve-tts": out.via || "",
    },
  });
}
