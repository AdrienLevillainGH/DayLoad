/* ==================================================================
   github

   The browser's side of the data repo. A fine-grained token, pasted
   once per device, is the whole identification mechanism: GitHub
   verifies it, so the app never has to.

   Nothing here knows what DayLoad data looks like — it reads and
   writes files and fires workflows.
   ================================================================== */

const KEY = "dayload:gh";

const DEFAULTS = { owner: "", repo: "dayload-data", token: "" };

export function config() {
  try {
    return { ...DEFAULTS, ...JSON.parse(window.localStorage.getItem(KEY) || "{}") };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

export function setConfig(patch) {
  const next = { ...config(), ...patch };
  window.localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function forgetDevice() {
  window.localStorage.removeItem(KEY);
}

export function isLinked() {
  const c = config();
  return Boolean(c.token && c.owner && c.repo);
}

/* ---------- base64 that survives accents ---------- */

// btoa works on bytes, not characters: "Vélo de route" breaks it
function encode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function decode(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* ---------- the API ---------- */

async function api(path, options = {}) {
  const c = config();
  if (!c.token) throw new Error("No GitHub token on this device.");

  const r = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${c.token}`,
      "x-github-api-version": "2022-11-28",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  if (r.status === 401) throw new Error("GitHub rejected the token. It may have expired.");
  if (r.status === 403) throw new Error("GitHub refused: the token lacks a permission, or you are rate limited.");
  if (r.status === 404) return null; // a missing file is an answer, not a failure
  if (r.status === 409 || r.status === 412) {
    const e = new Error("The file changed while you were editing it.");
    e.conflict = true;
    throw e;
  }
  if (!r.ok) throw new Error(`GitHub returned ${r.status}: ${(await r.text()).slice(0, 200)}`);
  if (r.status === 204) return {};
  return r.json();
}

const base = () => {
  const c = config();
  return `/repos/${c.owner}/${c.repo}`;
};

/* Returns { text, sha } or null when the file isn't there yet.
   The sha matters: it is what makes the next write safe. */
export async function readFile(path) {
  const j = await api(`${base()}/contents/${encodeURIComponent(path)}`);
  if (!j || !j.content) return null;
  return { text: decode(j.content), sha: j.sha };
}

/* sha must be the one from the read this write is based on. Pass null
   to create. GitHub rejects the write if the file moved on, which is
   the conflict detection — do not work around it by re-reading the sha
   and retrying blindly, or you will overwrite the other device. */
export async function writeFile(path, text, sha, message) {
  const j = await api(`${base()}/contents/${encodeURIComponent(path)}`, {
    method: "PUT",
    body: JSON.stringify({
      message: message || `dayload: update ${path}`,
      content: encode(text),
      ...(sha ? { sha } : {}),
    }),
  });
  return j && j.content ? j.content.sha : null;
}

export async function listDir(path) {
  const j = await api(`${base()}/contents/${encodeURIComponent(path)}`);
  if (!Array.isArray(j)) return [];
  return j.filter((f) => f.type === "file").map((f) => ({ name: f.name, path: f.path, sha: f.sha }));
}

/* ---------- the workflow ---------- */

export async function runSync({ lookbackDays = 30, maxDetails = 25 } = {}) {
  await api(`${base()}/actions/workflows/sync.yml/dispatches`, {
    method: "POST",
    body: JSON.stringify({
      ref: "main",
      inputs: { lookback_days: String(lookbackDays), max_details: String(maxDetails) },
    }),
  });
}

/* status of the most recent run, for the button to report progress */
export async function lastRun() {
  const j = await api(`${base()}/actions/workflows/sync.yml/runs?per_page=1`);
  const run = j && j.workflow_runs && j.workflow_runs[0];
  if (!run) return null;
  return {
    status: run.status, // queued | in_progress | completed
    conclusion: run.conclusion, // success | failure | null
    startedAt: run.run_started_at,
    url: run.html_url,
  };
}

/* ---------- a cheap check that the token actually works ---------- */

export async function check() {
  const c = config();
  if (!c.owner) throw new Error("Tell it which GitHub account the repo belongs to.");
  const j = await api(base());
  if (!j) throw new Error(`Can't see ${c.owner}/${c.repo}. Check the name, and that the token lists this repo.`);
  if (!j.permissions || !j.permissions.push) throw new Error("The token can read this repo but not write to it. Contents needs Read and write.");
  return { private: j.private, name: j.full_name };
}
