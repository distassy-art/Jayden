export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, x-admin-password",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

export async function onRequestPost({ request, env }) {
  const { upsertLead, json } = await import("../_lib/store.js");
  const body = await request.json().catch(() => ({}));
  const sessionId = String(body.sessionId || crypto.randomUUID()).slice(0, 80);
  const row = await upsertLead(env, sessionId, {
    name: String(body.name || "").slice(0, 80),
    phone: String(body.phone || "").slice(0, 40),
    org: String(body.org || "").slice(0, 120),
    city: String(body.city || "").slice(0, 80),
    interest: String(body.interest || "").slice(0, 80),
    kind: String(body.kind || "chat").slice(0, 40),
    locale: body.locale === "en" ? "en" : "ar",
    path: String(body.path || "").slice(0, 200),
    summary: String(body.summary || "").slice(0, 500),
    transcript: Array.isArray(body.transcript) ? body.transcript.slice(-40) : [],
  });
  return json({ ok: true, sessionId: row.sessionId });
}
