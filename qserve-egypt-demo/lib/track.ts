export function lookedAt(path: string): string {
  const p = path.toLowerCase();
  if (p.includes("/admin")) return "admin";
  if (p.includes("queuing")) return "queue";
  if (p.includes("nurses")) return "nurse";
  if (p.includes("kiosk") || p.includes("self-service")) return "kiosk";
  if (p.includes("quote")) return "quote";
  if (p.includes("repair")) return "repair";
  if (p.includes("insights") || p.includes("software")) return "software";
  if (p.includes("contact") || p.includes("about")) return "factory";
  if (p === "/" || p === "/en" || p.endsWith("/en/")) return "home";
  return "other";
}

export function sessionId() {
  const k = "qserve-demo-sid";
  try {
    let id = sessionStorage.getItem(k);
    if (!id) {
      id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(k, id);
    }
    return id;
  } catch {
    return `tmp-${Date.now()}`;
  }
}

export async function postJson(url: string, body: unknown, headers?: HeadersInit) {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(headers || {}) },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    /* demo: ignore offline */
  }
}
