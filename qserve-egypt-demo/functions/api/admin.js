export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, x-admin-password",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

export async function onRequestGet({ request, env }) {
  const { adminOk, json, listVisits, listLeads, getKbOverrides } = await import("../_lib/store.js");
  const { catalogWithSell } = await import("../_lib/catalog.js");
  if (!adminOk(request, env)) return json({ error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") || "products";
  if (tab === "visits") return json({ visits: await listVisits(env) });
  if (tab === "leads") return json({ leads: await listLeads(env) });
  const items = catalogWithSell(await getKbOverrides(env));
  if (tab === "spares") return json({ items: items.filter((i) => i.category === "spare") });
  return json({ items });
}

export async function onRequestPost({ request, env }) {
  const { adminOk, json } = await import("../_lib/store.js");
  const body = await request.json().catch(() => ({}));
  const password = String(body.password || "");
  if (password !== (env.ADMIN_PASSWORD || "Ema1977$")) return json({ ok: false }, 401);
  return json({ ok: true });
}
