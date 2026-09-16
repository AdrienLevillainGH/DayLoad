/* ==================================================================
   storage

   Still the only place the dataset is read or written, exactly as
   before — load() and save() have the same signatures they always had.
   What changed is what sits behind them.

   localStorage is now a cache, not the truth. The truth is data.json
   in your private GitHub repo. Every device merges into it rather than
   overwriting it.

   Writing is deliberately lazy: save() returns the moment localStorage
   is written, and the push to GitHub happens a few seconds after you
   stop making changes. Typing a note must not cost an HTTP request per
   keystroke.
   ================================================================== */

import { merge, normalise, differs, nowISO } from "./merge.js";
import * as gh from "./github.js";

const KEY = "dayload:v1";
const FILE = "data.json";
const QUIET_MS = 4000; // how long to wait after the last change

/* ---------- the local cache ---------- */

function readLocal() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    /* unavailable, or not valid JSON */
  }
  return null;
}

function writeLocal(value) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------- status, for the Settings panel ---------- */

let status = { state: "offline", at: null, error: null, pending: false };
const listeners = new Set();

function setStatus(patch) {
  status = { ...status, ...patch };
  for (const fn of listeners) {
    try { fn(status); } catch (e) { /* a broken listener is not our problem */ }
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}

export const syncStatus = () => status;

/* ---------- the remote ---------- */

let knownSha = null; // sha of the copy this device last saw
let timer = null;
let pushing = false;
let again = false; // a change arrived mid-push

async function pull() {
  const file = await gh.readFile(FILE);
  if (!file) { knownSha = null; return null; }
  knownSha = file.sha;
  try {
    return normalise(JSON.parse(file.text));
  } catch (e) {
    throw new Error("data.json in the repo isn't valid JSON.");
  }
}

/* Merge whatever is local into whatever is remote, and write the
   result back. The sha is what makes this safe: if the other device
   pushed while we were thinking, GitHub refuses and we start again
   with its version rather than flattening it. */
async function pushNow() {
  if (pushing) { again = true; return; }
  if (!gh.isLinked()) { setStatus({ state: "offline", pending: false }); return; }

  pushing = true;
  setStatus({ state: "syncing", error: null });

  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const local = readLocal();
      if (!local) break;

      const remote = await pull(); // also refreshes knownSha
      const merged = remote ? merge(local, remote) : normalise(local);

      writeLocal(merged);

      // nothing worth a commit — someone opened the app and changed nothing
      if (remote && !differs(merged, remote)) {
        setStatus({ state: "synced", at: nowISO(), pending: false, error: null });
        pushing = false;
        if (again) { again = false; schedule(); }
        return;
      }

      try {
        knownSha = await gh.writeFile(
          FILE,
          JSON.stringify(merged, null, 1),
          knownSha,
          `dayload: ${merged.sessions.length} sessions`
        );
        setStatus({ state: "synced", at: nowISO(), pending: false, error: null });
        pushing = false;
        if (again) { again = false; schedule(); }
        return;
      } catch (e) {
        if (!e.conflict || attempt === 2) throw e;
        // the other device won the race; loop, re-read, re-merge
      }
    }
    throw new Error("Gave up after three attempts — another device is writing constantly.");
  } catch (e) {
    setStatus({ state: "error", error: e.message, pending: true });
    pushing = false;
  }
}

function schedule() {
  if (!gh.isLinked()) return;
  setStatus({ pending: true });
  clearTimeout(timer);
  timer = setTimeout(pushNow, QUIET_MS);
}

/* ---------- what the app uses ---------- */

export const store = {
  /* Remote first, local as the fallback. A device that has never seen
     this repo gets the full history; a device with no signal gets
     whatever it had, and pushes when it can. */
  async load() {
    const local = readLocal();

    if (!gh.isLinked()) {
      setStatus({ state: "offline" });
      return local ? normalise(local) : null;
    }

    setStatus({ state: "syncing", error: null });
    try {
      const remote = await pull();
      if (!remote) {
        // first run against an empty repo: local becomes the seed
        setStatus({ state: "synced", at: nowISO(), error: null });
        if (local) schedule();
        return local ? normalise(local) : null;
      }

      const merged = local ? merge(local, remote) : remote;
      writeLocal(merged);
      setStatus({ state: "synced", at: nowISO(), error: null });
      if (differs(merged, remote)) schedule(); // local had something new
      return merged;
    } catch (e) {
      setStatus({ state: "error", error: e.message });
      return local ? normalise(local) : null;
    }
  },

  /* Immediate locally, eventual remotely. */
  async save(value) {
    const ok = writeLocal(value);
    schedule();
    return ok;
  },

  /* Settings uses these directly. */
  async syncNow() {
    clearTimeout(timer);
    await pushNow();
  },

  /* Pull without merging local — for "this device is wrong, take
     what's in the repo". Destructive on purpose. */
  async takeRemote() {
    const remote = await pull();
    if (remote) writeLocal(remote);
    return remote;
  },
};

/* Ask the browser not to evict the cache. Browsers may refuse, and iOS
   clears script storage after ~7 days of not visiting unless the app is
   installed to the home screen. Less critical now that the repo holds
   the truth, but a cold start still wants a warm cache. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (e) {
    /* not supported */
  }
  return false;
}
