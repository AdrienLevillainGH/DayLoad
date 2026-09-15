/* ==================================================================
   coros

   Talks to the COROS MCP server directly from the browser: OAuth 2.0
   authorization code + PKCE, public client (no secret), refresh token
   kept in localStorage.

   sync() returns plain text in exactly the shape the parsers in
   DayLoad.jsx already read — the Sport Records listing, followed by
   one "### labelId sportType" anchor and detail block per activity.
   So the network is the only new thing here; the import path below it
   is unchanged.
   ================================================================== */

const REGION = "https://mcpeu.coros.com"; // eu account; us / cn exist too
const MCP = `${REGION}/mcp`;
const REGISTER = `${REGION}/connect/register`;
const AUTHORIZE = `${REGION}/oauth2/authorize`;
const TOKEN = `${REGION}/oauth2/token`;
const SCOPE = "openid mcp.tools offline_access";
const PROTOCOL = "2025-06-18";

const KEY = "dayload:coros";
const PENDING = "dayload:coros:pending";

/* the page itself is the redirect target, so this must match what was
   registered — trailing slash included */
const redirectUri = () => window.location.origin + window.location.pathname;

function read() {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "{}");
  } catch (e) {
    return {};
  }
}
function write(v) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(v));
  } catch (e) {
    /* full or blocked */
  }
}

export function isConnected() {
  return Boolean(read().refreshToken);
}

export function disconnect() {
  write({});
}

/* ---------- PKCE ---------- */

function randomString(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function challengeOf(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* ---------- registration ---------- */

// COROS has no developer portal: a client registers itself and keeps the
// client_id. It isn't a secret, and one per browser is fine.
async function clientId() {
  const s = read();
  if (s.clientId) return s.clientId;

  const r = await fetch(REGISTER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "DayLoad",
      redirect_uris: [redirectUri()],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: SCOPE,
      application_type: "native",
    }),
  });
  if (!r.ok) throw new Error(`Registration refused (${r.status}). ${await r.text()}`);
  const reg = await r.json();
  write({ ...read(), clientId: reg.client_id });
  return reg.client_id;
}

/* ---------- the authorization dance ---------- */

export async function connect() {
  const id = await clientId();
  const verifier = randomString();
  const state = randomString(16);
  window.localStorage.setItem(PENDING, JSON.stringify({ verifier, state }));

  const q = new URLSearchParams({
    response_type: "code",
    client_id: id,
    redirect_uri: redirectUri(),
    scope: SCOPE,
    state,
    code_challenge: await challengeOf(verifier),
    code_challenge_method: "S256",
  });
  window.location.href = `${AUTHORIZE}?${q}`;
}

async function exchange(body) {
  const r = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Token request failed (${r.status}). ${text}`);
  const t = JSON.parse(text);
  const s = read();
  write({
    ...s,
    accessToken: t.access_token,
    // some servers rotate the refresh token, some don't return it again
    refreshToken: t.refresh_token || s.refreshToken,
    expiresAt: Date.now() + (t.expires_in ? t.expires_in * 1000 : 3600_000) - 60_000,
  });
  return t;
}

/* Call once on page load. If COROS has just redirected back with a code,
   finish the exchange and tidy the URL. Returns "connected", "error:…"
   or null when the load has nothing to do with OAuth. */
export async function handleRedirect() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  if (!code && !err) return null;

  const clean = () => {
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    window.history.replaceState({}, "", url.toString());
  };

  let pending = {};
  try {
    pending = JSON.parse(window.localStorage.getItem(PENDING) || "{}");
  } catch (e) {
    /* nothing pending */
  }
  window.localStorage.removeItem(PENDING);

  if (err) {
    clean();
    return `error:${url.searchParams.get("error_description") || err}`;
  }
  if (pending.state && url.searchParams.get("state") !== pending.state) {
    clean();
    return "error:state mismatch — start the connection again";
  }

  try {
    await exchange({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: read().clientId,
      code_verifier: pending.verifier || "",
    });
    clean();
    return "connected";
  } catch (e) {
    clean();
    return `error:${e.message}`;
  }
}

async function accessToken() {
  const s = read();
  if (s.accessToken && s.expiresAt && Date.now() < s.expiresAt) return s.accessToken;
  if (!s.refreshToken) throw new Error("Not connected to COROS.");
  const t = await exchange({
    grant_type: "refresh_token",
    refresh_token: s.refreshToken,
    client_id: s.clientId,
  });
  return t.access_token;
}

/* ---------- MCP ---------- */

// the server may answer as JSON or as a single SSE frame; accept both
function readBody(contentType, text) {
  if ((contentType || "").includes("text/event-stream")) {
    const payloads = text
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .filter(Boolean);
    for (const p of payloads) {
      try {
        const j = JSON.parse(p);
        if (j.result || j.error) return j;
      } catch (e) {
        /* keep looking */
      }
    }
    throw new Error("No usable frame in the streamed reply.");
  }
  return JSON.parse(text);
}

let rpcId = 0;

async function rpc(method, params) {
  const token = await accessToken();
  const r = await fetch(MCP, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL,
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const text = await r.text();
  if (r.status === 401) {
    write({ ...read(), accessToken: null, expiresAt: 0 });
    throw new Error("COROS rejected the token. Connect again.");
  }
  if (!r.ok) throw new Error(`COROS returned ${r.status}. ${text.slice(0, 300)}`);
  const body = readBody(r.headers.get("content-type"), text);
  if (body.error) throw new Error(body.error.message || JSON.stringify(body.error));
  return body.result;
}

// tool results arrive as content blocks; the text is what the parsers want
async function callTool(name, args) {
  const result = await rpc("tools/call", { name, arguments: args });
  const text = (result.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  if (result.isError) throw new Error(text || `${name} failed.`);
  return text;
}

const yyyymmdd = (d) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

/* ---------- the sync itself ---------- */

/* Pulls the listing for the last `days`, then a detail block for every
   activity that isn't already in DayLoad (plus any the caller forces).
   `known` is the set of labelIds already stored, so a routine sync costs
   one listing call and a detail call per new run.

   onProgress(text) is called as it goes, for the button label. */
export async function sync({ days = 30, known = new Set(), max = 25, limit = 500, onProgress = () => {} } = {}) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);

  onProgress("Reading your activity list…");
  // every filter is required even when unused, and `limit` defaults to 20 —
  // leave it out and a 700-day window still returns 20 activities
  const listing = await callTool("querySportRecords", {
    startDate: yyyymmdd(start),
    endDate: yyyymmdd(end),
    limit,
    sportTypeCodes: [65535],
    locationKeyword: "",
    maxAveragePace: "",
    minDistanceKm: 0,
    maxDistanceKm: 100000,
    minDurationMinutes: 0,
    maxDurationMinutes: 100000,
  });

  const found = [];
  const re = /LabelId:\s*(\S+)\s*\|\s*SportType:\s*(\d+)/g;
  let m;
  while ((m = re.exec(listing)) !== null) found.push({ labelId: m[1], sportType: Number(m[2]) });

  const wanted = found.filter((a) => !known.has(a.labelId)).slice(0, max);

  const parts = [listing];
  let done = 0;
  for (const a of wanted) {
    onProgress(`Fetching detail ${++done} of ${wanted.length}…`);
    try {
      const detail = await callTool("getActivityDetail", {
        labelId: a.labelId,
        sportType: a.sportType,
      });
      // the anchor line lets the importer match this block exactly
      parts.push(`### ${a.labelId} ${a.sportType}\n${detail}`);
    } catch (e) {
      // one bad activity shouldn't lose the whole sync
      console.warn("detail failed for", a.labelId, e);
    }
  }

  return {
    text: parts.join("\n\n"),
    total: found.length,
    detailed: done,
    skipped: found.length - wanted.length,
  };
}
