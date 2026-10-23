export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, x-admin-password",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

export async function onRequestGet() {
  const { publicAccessories } = await import("../_lib/catalog.js");
  const { json } = await import("../_lib/store.js");
  return json({ items: publicAccessories() });
}
