export function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, x-admin-password",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(),
    },
  });
}

export function optionsOk() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export function storeEnv() {
  let admin = "Ema1977$";
  try {
    admin = Netlify.env.get("ADMIN_PASSWORD") || "Ema1977$";
  } catch {
    /* local tests */
  }
  return { STORE: undefined, ADMIN_PASSWORD: admin };
}
