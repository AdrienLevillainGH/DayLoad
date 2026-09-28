/* ==================================================================
   photos

   Kept out of data.json on purpose. A photo is a hundred times the
   size of a session; putting them in the one file every device reads
   and merges on every open would make each sync crawl.

   So a photo is resized once on the phone, kept in this device's
   IndexedDB, and uploaded as its own file, photos/<id>.jpg, in the
   same private data repo. An entry only stores the id. Another device
   fetches the file the first time it has to show it, then keeps it.

   The untouched original goes up too, to originals/<id>.<ext>. The app
   never shows it and never downloads it unless you ask; it exists so
   the full-resolution file is kept somewhere you own. Once uploaded,
   this device drops its copy — the phone's gallery still has it.

   Offline, the upload waits in a queue and goes the next time the app
   opens with a connection.
   ================================================================== */

import * as gh from "./github.js";

const DB = "dayload-photos";
const STORE = "photos";
const QUEUE = "dayload:photos-pending";
const MAX_SIDE = 1600; // px on the long side — sharp on a phone, ~250 kB
const QUALITY = 0.82;

export const pathOf = (id) => `photos/${id}.jpg`;
const origKey = (id) => `orig:${id}`;

/* ---------- this device's copy ---------- */

let opening = null;
function db() {
  if (!opening) {
    opening = new Promise((resolve) => {
      try {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }
  return opening;
}

const memory = new Map(); // when the browser refuses IndexedDB

async function keep(id, blob) {
  memory.set(id, blob);
  const d = await db();
  if (!d) return;
  await new Promise((res) => {
    try {
      const tx = d.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, id);
      tx.oncomplete = res; tx.onerror = res; tx.onabort = res;
    } catch (e) { res(); }
  });
}

async function drop(id) {
  memory.delete(id);
  const d = await db();
  if (!d) return;
  await new Promise((res) => {
    try {
      const tx = d.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = res; tx.onerror = res; tx.onabort = res;
    } catch (e) { res(); }
  });
}

async function local(id) {
  if (memory.has(id)) return memory.get(id);
  const d = await db();
  if (!d) return null;
  return new Promise((res) => {
    try {
      const req = d.transaction(STORE, "readonly").objectStore(STORE).get(id);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => res(null);
    } catch (e) { res(null); }
  });
}

/* ---------- the upload queue ---------- */

const queued = () => {
  try {
    return JSON.parse(localStorage.getItem(QUEUE) || "[]")
      .map((x) => (typeof x === "string" ? { key: x, path: pathOf(x) } : x));
  } catch (e) { return []; }
};
const watchers = new Set();
let lastError = null;
const tell = () => { const st = pendingState(); for (const fn of watchers) { try { fn(st); } catch (e) { /* ignore */ } } };
const setQueued = (ids) => { try { localStorage.setItem(QUEUE, JSON.stringify(ids)); } catch (e) { /* ignore */ } tell(); };

/* for the Sync panel: how many files are still waiting, and why */
export function pendingState() {
  const q = queued();
  return {
    photos: new Set(q.map((x) => x.key.replace(/^orig:/, ""))).size,
    files: q.length,
    busy: !!flushing,
    error: lastError,
  };
}
export function onPending(fn) { watchers.add(fn); fn(pendingState()); return () => watchers.delete(fn); }

let flushing = null;
export function flushPending() {
  if (flushing || !gh.isLinked()) return flushing;
  lastError = null;
  flushing = (async () => {
    // the small copies first: they are what other devices need to show the note
    const order = [...queued()].sort((a, b) => (a.original ? 1 : 0) - (b.original ? 1 : 0));
    for (const job of order) {
      const done = () => setQueued(queued().filter((x) => x.key !== job.key));
      const blob = await local(job.key);
      if (!blob) { done(); continue; }
      try {
        await gh.writeBytes(job.path, new Uint8Array(await blob.arrayBuffer()));
        done();
        if (job.original) await drop(job.key);
      } catch (e) {
        lastError = e.message || "Upload failed.";
        break; // offline or refused; try again next time
      }
    }
  })().finally(() => { flushing = null; tell(); });
  tell();
  return flushing;
}

/* ---------- adding one ---------- */

function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("That file isn't an image this browser can read."));
    img.src = url;
  });
}

// phones take 12-megapixel photos; nobody needs that to remember a view
async function shrink(file) {
  let img = null;
  try { img = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { img = await loadImage(file); }
  const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const w = Math.round(img.width * k), h = Math.round(img.height * k);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").drawImage(img, 0, 0, w, h);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", QUALITY));
  if (!blob) throw new Error("Could not prepare that photo.");
  return { blob, w, h };
}

/* Returns the attachment to store on the entry. The upload happens in
   the background; the photo shows at once from this device's copy. */
const extOf = (file) => {
  const fromName = (file.name || "").match(/\.([a-z0-9]{2,5})$/i);
  if (fromName) return fromName[1].toLowerCase();
  const fromType = (file.type || "").split("/")[1];
  return fromType ? fromType.replace("jpeg", "jpg") : "jpg";
};

export async function addPhoto(file) {
  // the time goes in the name, so a file can always be dated without asking GitHub
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const { blob, w, h } = await shrink(file);
  const original = `originals/${id}.${extOf(file)}`;
  await keep(id, blob);
  await keep(origKey(id), file);
  setQueued([...queued(),
    { key: id, path: pathOf(id) },
    { key: origKey(id), path: original, original: true }]);
  flushPending();
  return { id, kind: "photo", w, h, original, bytes: file.size };
}

/* The full-resolution file, for when you ask for it: from this device
   if it hasn't gone up yet, otherwise from the repo. Never cached. */
export async function originalURL(a) {
  let blob = await local(origKey(a.id));
  if (!blob && a.original && gh.isLinked()) {
    const bytes = await gh.readRaw(a.original);
    if (bytes) blob = new Blob([bytes]);
  }
  return blob ? URL.createObjectURL(blob) : null;
}

if (typeof window !== "undefined") window.addEventListener("online", () => flushPending());

export const originalPending = (id) => queued().some((x) => x.key === origKey(id));

/* ---------- showing one ---------- */

const urls = new Map();
export async function photoURL(id) {
  if (urls.has(id)) return urls.get(id);
  let blob = await local(id);
  if (!blob && gh.isLinked()) {
    const bytes = await gh.readBytes(pathOf(id)).catch(() => null);
    if (bytes) { blob = new Blob([bytes], { type: "image/jpeg" }); await keep(id, blob); }
  }
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  urls.set(id, u);
  return u;
}
