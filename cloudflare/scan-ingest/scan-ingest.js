/**
 * Cloudflare Worker: station PC → Mina business OneDrive Scans folder.
 *
 * POST /api/scan-ingest
 * Headers:
 *   X-Station-Id: 42179
 *   X-Station-Token: <per-station secret>
 *   X-Filename: Scan2026-09-12.pdf
 * Body: raw PDF bytes
 *
 * Secrets / vars:
 *   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET
 *   GRAPH_DRIVE_USER  (Mina work UPN)
 *   SCAN_STATION_TOKENS  JSON {"42179":"secret",...}
 *
 * Graph app needs Application permission Files.ReadWrite.All (admin consent).
 */
import stations from "./stations.js";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, X-Station-Id, X-Station-Token, X-Filename",
  "Cache-Control": "no-store",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function monthFolderName(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "numeric",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value])
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  return `${year}-${String(month).padStart(2, "0")} ${MONTHS[month - 1]}`;
}

function scansFolderRel(dest, layout) {
  const month = monthFolderName();
  if (layout === "scans_then_month") return `${dest}/Scans/${month}`;
  return `${dest}/${month}/Scans`;
}

function safeFilename(name) {
  const base = String(name || "scan.pdf").split(/[/\\]/).pop() || "scan.pdf";
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 180);
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

function encodeDrivePath(rel) {
  return rel
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

function parseStationTokens(env) {
  const raw = (env && env.SCAN_STATION_TOKENS) || "";
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function getGraphToken(env) {
  const tenant = env.GRAPH_TENANT_ID;
  const clientId = env.GRAPH_CLIENT_ID;
  const clientSecret = env.GRAPH_CLIENT_SECRET;
  if (!tenant || !clientId || !clientSecret) {
    throw new Error("graph_not_configured");
  }
  const res = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: [
        `client_id=${encodeURIComponent(clientId)}`,
        `client_secret=${encodeURIComponent(clientSecret)}`,
        `scope=${encodeURIComponent("https://graph.microsoft.com/.default")}`,
        "grant_type=client_credentials",
      ].join("&"),
    }
  );
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`token_failed:${(data && data.error) || res.status}`);
  }
  return data.access_token;
}

async function folderExists(token, user, folderRel) {
  const url =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user)}` +
    `/drive/root:/${encodeDrivePath(folderRel)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

async function createChildFolder(token, user, parentRel, name) {
  const url = parentRel
    ? `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user)}/drive/root:/${encodeDrivePath(parentRel)}:/children`
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user)}/drive/root/children`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    }),
  });
  if (res.ok || res.status === 409) return;
  const text = await res.text();
  if (text.includes("nameAlreadyExists")) return;
  throw new Error(
    `mkdir_failed:${parentRel}/${name}:${res.status}:${text.slice(0, 160)}`
  );
}

async function ensureFolder(token, user, folderRel) {
  if (await folderExists(token, user, folderRel)) return;
  const parts = folderRel.split("/").filter(Boolean);
  let cur = "";
  for (const part of parts) {
    const next = cur ? `${cur}/${part}` : part;
    if (!(await folderExists(token, user, next))) {
      await createChildFolder(token, user, cur, part);
    }
    cur = next;
  }
}

async function uploadPdf(token, user, folderRel, filename, bytes) {
  await ensureFolder(token, user, folderRel);
  const path = encodeDrivePath(`${folderRel}/${filename}`);
  const url =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user)}` +
    `/drive/root:/${path}:/content`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/pdf",
    },
    body: bytes,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`upload_failed:${res.status}:${text.slice(0, 240)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function handleScanIngest(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const stationId = String(request.headers.get("X-Station-Id") || "").trim();
  const stationToken = String(
    request.headers.get("X-Station-Token") || ""
  ).trim();
  const filename = safeFilename(
    request.headers.get("X-Filename") || "scan.pdf"
  );

  if (!stationId || !stationToken) {
    return json(401, { ok: false, error: "missing_station_auth" });
  }

  const tokens = parseStationTokens(env);
  if (!tokens[stationId] || tokens[stationId] !== stationToken) {
    return json(403, { ok: false, error: "bad_station_token" });
  }

  const station = stations[stationId];
  if (!station) {
    return json(400, { ok: false, error: "unknown_station", stationId });
  }

  const driveUser = String((env.GRAPH_DRIVE_USER || "").trim());
  if (!driveUser) {
    return json(503, { ok: false, error: "missing_GRAPH_DRIVE_USER" });
  }

  const bytes = await request.arrayBuffer();
  if (!bytes || bytes.byteLength < 64) {
    return json(400, { ok: false, error: "empty_body" });
  }
  if (bytes.byteLength > 20 * 1024 * 1024) {
    return json(413, { ok: false, error: "too_large", max_mb: 20 });
  }

  const folderRel = scansFolderRel(station.dest, station.scans_layout);

  try {
    const access = await getGraphToken(env);
    const meta = await uploadPdf(access, driveUser, folderRel, filename, bytes);
    return json(200, {
      ok: true,
      stationId,
      station: station.name,
      folder: folderRel,
      filename,
      size: bytes.byteLength,
      webUrl: meta.webUrl || null,
      id: meta.id || null,
    });
  } catch (e) {
    return json(502, {
      ok: false,
      error: "graph_upload_failed",
      detail: String(e && e.message ? e.message : e).slice(0, 300),
    });
  }
}
