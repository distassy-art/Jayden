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
  const { addVisit, json } = await import("../_lib/store.js");
  const body = await request.json().catch(() => ({}));
  const row = await addVisit(env, {
    path: String(body.path || "/").slice(0, 200),
    locale: body.locale === "en" ? "en" : "ar",
    lookedAt: String(body.lookedAt || "other").slice(0, 40),
    source: String(body.source || "page").slice(0, 40),
  });
  return json({ ok: true, id: row.id });
}
