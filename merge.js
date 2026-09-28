/* ==================================================================
   merge

   Two devices, one file. This decides what happens when both have
   changed something.

   The rules, in one place:

   - Every session carries updatedAt. Between two versions of the same
     session, the later stamp wins. Whole session, not field by field:
     merging halves of a session produces something neither device ever
     had.
   - Deleting does not remove a session, it records a tombstone in
     `graveyard`. Without that, a device holding an old copy resurrects
     whatever the other one deleted.
   - settings, types and templates are stamped as wholes in `stamps`,
     and the later stamp wins. They change rarely and never on two
     devices at once.
   - Sessions are deduplicated on corosLabelId, but only ever by
     dropping a copy with nothing of yours in it. A duplicate holding
     an RPE or a note is left alone for you to sort out.
   - Notebooks and their entries follow exactly the session rules:
     updatedAt per item, later wins, deletes are tombstones in the same
     graveyard. Ids are random, so one graveyard serves all three.
   ================================================================== */

export const nowISO = () => new Date().toISOString();

/* The shape of the data this build understands. Raise it whenever a
   build adds something an older build would drop on merge — the way
   notebooks would have been dropped by a device that had never heard of
   them. A device finding a higher number in the repo stops writing. */
export const SCHEMA = 5;

const at = (s) => (s && s.updatedAt) || "";

/* Bring any dataset up to the shape the merge expects. Safe to run on
   something already normalised, and on a file written before any of
   this existed — which is what your 230 sessions are. */
export function normalise(data, stamp) {
  if (!data) return data;
  const when = stamp || "1970-01-01T00:00:00.000Z";
  return {
    ...data,
    sessions: (data.sessions || []).map((s) => (s.updatedAt ? s : { ...s, updatedAt: when })),
    notebooks: (data.notebooks || []).map((n) => (n.updatedAt ? n : { ...n, updatedAt: when })),
    entries: (data.entries || []).map((e) => (e.updatedAt ? e : { ...e, updatedAt: when })),
    graveyard: Array.isArray(data.graveyard) ? data.graveyard : [],
    stamps: {
      settings: when,
      types: when,
      templates: when,
      ...(data.stamps || {}),
    },
  };
}

/* has the user put anything of their own into this session? */
function hasUserContent(s) {
  if (!s) return false;
  if (s.title || s.note || s.url) return true;
  if (s.sliders && Object.keys(s.sliders).length) return true;
  if (s.custom && Object.keys(s.custom).length) return true;
  if (Array.isArray(s.boxes) && s.boxes.length) return true;
  if (s.fav) return true;
  return false;
}

function dedupeByLabel(sessions) {
  const byLabel = new Map();
  const out = [];
  for (const s of sessions) {
    const key = s.corosLabelId;
    if (!key) { out.push(s); continue; }
    const seen = byLabel.get(key);
    if (!seen) { byLabel.set(key, s); out.push(s); continue; }

    // both refer to one COROS activity; drop the empty one, never both
    const seenHas = hasUserContent(seen);
    const thisHas = hasUserContent(s);
    if (seenHas && thisHas) { out.push(s); continue; } // leave it to the human
    if (thisHas && !seenHas) {
      out.splice(out.indexOf(seen), 1);
      byLabel.set(key, s);
      out.push(s);
    }
    // otherwise keep what we had and drop this one
  }
  return out;
}

/* a and b are interchangeable: merge(a, b) and merge(b, a) agree */
export function merge(a, b) {
  if (!a) return b;
  if (!b) return a;

  const A = normalise(a);
  const B = normalise(b);

  /* ---- tombstones ---- */
  const graves = new Map();
  for (const g of [...A.graveyard, ...B.graveyard]) {
    const prev = graves.get(g.id);
    if (!prev || (g.at || "") > (prev.at || "")) graves.set(g.id, g);
  }

  /* ---- anything kept as a list of stamped items ---- */
  // the later edit wins, and a delete beats an edit only if it happened after it
  const collect = (key) => {
    const byId = new Map();
    for (const x of [...(A[key] || []), ...(B[key] || [])]) {
      const prev = byId.get(x.id);
      if (!prev || at(x) > at(prev)) byId.set(x.id, x);
    }
    const out = [];
    for (const x of byId.values()) {
      const g = graves.get(x.id);
      if (g && (g.at || "") >= at(x)) continue;
      out.push(x);
    }
    return out;
  };

  let sessions = collect("sessions");
  sessions = dedupeByLabel(sessions);
  sessions.sort((x, y) => (x.date < y.date ? 1 : -1));

  const notebooks = collect("notebooks");
  const entries = collect("entries");
  entries.sort((x, y) => (x.date < y.date ? 1 : -1));

  /* ---- the stamped wholes ---- */
  const pick = (key) => {
    const sa = (A.stamps && A.stamps[key]) || "";
    const sb = (B.stamps && B.stamps[key]) || "";
    return sb > sa ? B[key] : A[key];
  };
  const stampOf = (key) => {
    const sa = (A.stamps && A.stamps[key]) || "";
    const sb = (B.stamps && B.stamps[key]) || "";
    return sb > sa ? sb : sa;
  };

  // tombstones older than 90 days have done their job; keeping them
  // forever would grow the file for no reason
  const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString();

  return {
    ...A,
    version: Math.max(A.version || 0, B.version || 0),
    settings: pick("settings"),
    types: pick("types"),
    templates: pick("templates"),
    sessions,
    notebooks,
    entries,
    graveyard: [...graves.values()].filter((g) => (g.at || "") > cutoff),
    stamps: {
      settings: stampOf("settings"),
      types: stampOf("types"),
      templates: stampOf("templates"),
    },
  };
}

/* Did anything meaningful change? Used to avoid pushing a commit that
   says nothing, which would otherwise happen on every app open. */
export function differs(a, b) {
  if (!a || !b) return true;
  return JSON.stringify(strip(a)) !== JSON.stringify(strip(b));
}

function strip(d) {
  return {
    sessions: (d.sessions || []).map((s) => [s.id, s.updatedAt]).sort(),
    notebooks: (d.notebooks || []).map((n) => [n.id, n.updatedAt]).sort(),
    entries: (d.entries || []).map((e) => [e.id, e.updatedAt]).sort(),
    graveyard: (d.graveyard || []).map((g) => [g.id, g.at]).sort(),
    stamps: d.stamps || {},
  };
}
