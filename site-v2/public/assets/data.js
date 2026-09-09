/*
 * Data access for the admin console.
 *
 * Everything is read through this module's `/api/...` paths, which the preview
 * worker proxies to the production site with the method pinned to GET. Nothing
 * here can write to production.
 */

/* -------------------------------------------------------------------------
   Session — same credential scheme as the production site, so the same
   usernames and passwords work here.
   ------------------------------------------------------------------------- */

const SESSION_KEY = "ssv2_session";

/** Strip the domain part so "owner@bigdaddy" and "owner" can be compared. */
function ident(value) {
  const text = String(value || "").trim().toLowerCase();
  const at = text.indexOf("@");
  return at === -1 ? text : text.slice(0, at);
}

function hasDomain(value) {
  return String(value || "").indexOf("@") !== -1;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 of "<identity>\n<password>", matching the production hashes. */
async function passwordHash(identity, password) {
  const payload = `${String(identity || "").trim().toLowerCase()}\n${String(password)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return toHex(digest);
}

/** Owner identity matching, mirroring the production rules. */
function ownerMatches(typed, stored) {
  const a = String(typed || "").trim().toLowerCase();
  const b = String(stored || "").trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  // Never let a shared local part such as "owner" collapse two different tenants.
  if (!hasDomain(b) && ident(a) === b) return true;
  if (!hasDomain(a) && ident(b) === a) return true;
  return false;
}

function managerMatches(typed, stored) {
  const a = String(typed || "").trim().toLowerCase();
  const b = String(stored || "").trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  return ident(a) === b || a === ident(b) || ident(a) === ident(b);
}

function pickOverlayHash(hashes, candidates) {
  const map = hashes || {};
  for (const candidate of candidates) {
    if (!candidate) continue;
    const key = ident(candidate);
    if (key && map[key]) return map[key];
    if (map[candidate]) return map[candidate];
  }
  return "";
}

export const session = {
  read() {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  },
  write(value) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
  },
  clear() {
    sessionStorage.removeItem(SESSION_KEY);
    cache.clear();
  },
};

/** True when the signed-in account is the Smart Solutions admin tenant. */
export function isAdmin(user = session.read()) {
  if (!user) return false;
  const name = ident(user.email);
  return name === "smartsolutionsai" || name === "admin";
}

/**
 * Verify credentials against the production account lists.
 * Resolves to a session object, or throws with a user-facing message.
 */
export async function signIn(email, password) {
  const typed = String(email || "").trim().toLowerCase();
  if (!typed || !password) throw new Error("Enter a username and a password.");
  if (!crypto?.subtle) {
    throw new Error("This browser blocks secure hashing. Open the console over HTTPS.");
  }

  const [overlay, owners, managers] = await Promise.all([
    getJson("/api/login-hashes").then((r) => r?.hashes || {}).catch(() => ({})),
    getJson("/api/data/owners.json").then((r) => r?.accounts || []).catch(() => []),
    getJson("/api/data/logins.json").then((r) => r?.accounts || []).catch(() => []),
  ]);

  if (!owners.length && !managers.length) {
    throw new Error("Could not reach the account directory. Check your connection and retry.");
  }

  const owner = owners.find((account) => ownerMatches(typed, account.email));
  const manager = managers.find((account) => managerMatches(typed, account.email || account.username));

  // A multi-store owner outranks a manager who happens to share the local part.
  let account;
  let role;
  if (owner && ((owner.stores || []).length > 1 || !manager)) {
    account = owner;
    role = "owner";
  } else if (manager) {
    account = manager;
    role = "manager";
  } else if (owner) {
    account = owner;
    role = "owner";
  } else {
    throw new Error("That username was not recognised.");
  }

  const storedEmail = String(account.email || account.username || "").toLowerCase();
  const identity = role === "manager" ? ident(storedEmail) : storedEmail;

  const expected = pickOverlayHash(overlay, [identity, storedEmail, typed]) || account.phash || "";
  if (!expected) throw new Error("That account has no password set. Contact Smart Solutions.");

  // Production accepts the hash of either the full stored email or its local part.
  const candidates = await Promise.all([
    passwordHash(identity, password),
    passwordHash(ident(identity), password),
    passwordHash(typed, password),
  ]);
  if (!candidates.includes(expected)) throw new Error("Wrong username or password.");

  const user = {
    email: storedEmail,
    role,
    client: account.client || account.name || storedEmail,
    stores: role === "manager"
      ? [String(account.station_id || "")].filter(Boolean)
      : (account.stores || []).map(String),
    signedInAt: Date.now(),
  };
  session.write(user);
  return user;
}

/* -------------------------------------------------------------------------
   Fetching
   ------------------------------------------------------------------------- */

const cache = new Map();
const inflight = new Map();

/** Admin headers the upstream endpoints expect. */
function authHeaders() {
  const user = session.read();
  if (!user) return {};
  return { "x-ss-email": user.email, "x-ss-role": user.role === "manager" ? "manager" : "owner" };
}

class HttpError extends Error {
  constructor(status, url) {
    super(status === 403
      ? "This account is not allowed to read that data."
      : `Request failed (${status}).`);
    this.status = status;
    this.url = url;
  }
}

async function fetchJson(path) {
  let response;
  try {
    response = await fetch(path, { headers: authHeaders(), credentials: "same-origin" });
  } catch {
    throw new Error("Network unreachable. Check your connection and retry.");
  }
  if (!response.ok) throw new HttpError(response.status, path);
  try {
    return await response.json();
  } catch {
    throw new Error("The server returned a response that could not be read.");
  }
}

/**
 * Fetch JSON with de-duplication and an in-memory cache.
 * `maxAge` of 0 forces a refetch but still de-duplicates concurrent callers.
 */
export function getJson(path, { maxAge = 120000 } = {}) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < maxAge) return Promise.resolve(hit.value);
  if (inflight.has(path)) return inflight.get(path);

  const request = fetchJson(path)
    .then((value) => {
      cache.set(path, { value, at: Date.now() });
      return value;
    })
    .finally(() => inflight.delete(path));

  inflight.set(path, request);
  return request;
}

export function invalidate() {
  cache.clear();
}

/* -------------------------------------------------------------------------
   Typed resources
   ------------------------------------------------------------------------- */

const resource = (path) => (options) => getJson(path, options);

export const fetchOverlay = resource("/api/books-overlay");
export const fetchBilling = resource("/api/billing");
export const fetchTickets = resource("/api/mgr-tickets");
export const fetchPendingDays = resource("/api/mgr-days");
export const fetchS2kInvoices = resource("/api/data/s2k-invoices.json");
export const fetchVendorOrders = resource("/api/data/vendor-orders.json");
export const fetchPricing = resource("/api/data/pricing.json");
export const fetchAdminStores = resource("/api/data/admin-stores.json");

/**
 * Load everything the console needs in one pass.
 * Individual failures degrade to `null` so one dead endpoint cannot blank the
 * whole dashboard — each view renders its own missing-data notice instead.
 */
export async function loadWorkspace(options) {
  const sources = {
    overlay: fetchOverlay,
    billing: fetchBilling,
    tickets: fetchTickets,
    days: fetchPendingDays,
    s2k: fetchS2kInvoices,
    orders: fetchVendorOrders,
    pricing: fetchPricing,
  };

  const names = Object.keys(sources);
  const results = await Promise.allSettled(names.map((name) => sources[name](options)));

  const out = { errors: {} };
  names.forEach((name, i) => {
    const result = results[i];
    if (result.status === "fulfilled") {
      out[name] = result.value;
    } else {
      out[name] = null;
      out.errors[name] = result.reason?.message || "Unavailable";
    }
  });
  return out;
}
