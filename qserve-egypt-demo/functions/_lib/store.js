const PREFIX = {
  visit: "visit:",
  lead: "lead:",
};

export async function putJson(env, key, value) {
  if (!env.STORE) return value;
  await env.STORE.put(key, JSON.stringify(value));
  return value;
}

export async function getJson(env, key) {
  if (!env.STORE) return null;
  return env.STORE.get(key, "json");
}

export async function listPrefix(env, prefix, limit = 250) {
  if (!env.STORE) return [];
  const listed = await env.STORE.list({ prefix, limit: 200 });
  const rows = await Promise.all(listed.keys.map((k) => env.STORE.get(k.name, "json")));
  return rows.filter(Boolean).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, limit);
}

export async function addVisit(env, item) {
  const id = `${Date.now()}-${crypto.randomUUID()}`;
  const row = { id, ts: Date.now(), ...item };
  await putJson(env, PREFIX.visit + id, row);
  return row;
}

export async function upsertLead(env, sessionId, patch) {
  const key = PREFIX.lead + sessionId;
  const prev = (await getJson(env, key)) || { sessionId, ts: Date.now(), created: Date.now() };
  const row = {
    ...prev,
    ...patch,
    sessionId,
    ts: Date.now(),
    transcript: patch.transcript || prev.transcript || [],
  };
  await putJson(env, key, row);
  return row;
}

export async function listVisits(env) {
  return listPrefix(env, PREFIX.visit);
}

export async function listLeads(env) {
  return listPrefix(env, PREFIX.lead);
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, x-admin-password",
    },
  });
}

export function adminOk(request, env) {
  const expected = env.ADMIN_PASSWORD || "qserve-staff";
  const got = request.headers.get("x-admin-password") || "";
  return got === expected;
}

export async function getKbOverrides(env) {
  return (await getJson(env, "kb:overrides")) || {};
}

export async function putKbOverrides(env, value) {
  return putJson(env, "kb:overrides", value || {});
}
