// GitHub is the source for new orders.
// GET /vendor-orders-live.json should return the static asset sends first,
// then any send in the GitHub file whose store + vendor + date is not already there.
// An existing amount is left as it is.

const GITHUB_LEDGER =
  "https://raw.githubusercontent.com/distassy-art/Jayden/main/orders/vendor-orders-live.json";

function normVendor(v) {
  const s = String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (s.includes("coke") || s.includes("coca")) return "coke";
  if (s.includes("pepsi") || s.includes("7up")) return "pepsi";
  if (s.includes("core") || s.includes("cmark")) return "coremark";
  if (s.includes("harbor")) return "harbor";
  return s;
}

function orderKey(send) {
  const sid = String(send.storeId || send.store || "").trim();
  const dt = String(send.dateSent || "").slice(0, 10);
  return `${sid}|${normVendor(send.vendor)}|${dt}`;
}

export async function mergeGithubOrders(assetJson) {
  const base = assetJson && typeof assetJson === "object" ? assetJson : { sends: [] };
  const sends = Array.isArray(base.sends) ? base.sends.slice() : [];
  const seen = new Set(sends.map(orderKey));
  let extraSends = [];
  try {
    const res = await fetch(GITHUB_LEDGER, { cf: { cacheTtl: 0, cacheEverything: false } });
    if (res.ok) {
      const extra = await res.json();
      if (Array.isArray(extra.sends)) extraSends = extra.sends;
    }
  } catch (_) {
    extraSends = [];
  }
  for (const send of extraSends) {
    const key = orderKey(send);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    sends.push(send);
  }
  return { ...base, sends, appendNote: "GitHub appends only. Existing sends were kept." };
}
