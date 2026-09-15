import React, { useState, useEffect, useMemo, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import * as math from "mathjs";
import {
  Plus, Trash2, Pencil, Download, Upload, Copy, Check, X, Search,
  ChevronRight, ChevronDown, ChevronLeft, ChevronUp, Link as LinkIcon,
  CalendarDays, BarChart3, Settings2, Save, Star, CopyPlus, Bookmark,
} from "lucide-react";

import { store } from "./storage.js";

/* ================================================================== */
/* helpers                                                            */
/* ================================================================== */

const uid = () => Math.random().toString(36).slice(2, 10);
const fmtISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayISO = () => fmtISO(new Date());
const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x; };
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const dayDiff = (a, b) => Math.round((parseISO(a) - parseISO(b)) / 86400000);
const round = (v, n = 1) => (v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 10 ** n) / 10 ** n);
const num = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

const asHours = (mins) => `${round(mins / 60, 2)}h`;
const withHours = (mins) => `${round(mins, 0)} min (${asHours(mins)})`;

/* ================================================================== */
/* look and feel — add entries to these tables to offer more choices  */
/* ================================================================== */

const THEMES = {
  dark:  { label: "Dark",  bg: "#000000", surface: "#0B0B0B", field: "#000000", line: "#262626", text: "#FFFFFF", muted: "#B4B4B4", faint: "#7A7A7A", accentBg: "#FFFFFF", accentText: "#000000", grid: "#1C1C1C" },
  light: { label: "Light", bg: "#FFFFFF", surface: "#F6F6F4", field: "#FFFFFF", line: "#E3E3DE", text: "#141414", muted: "#4B4B4B", faint: "#8A8A85", accentBg: "#141414", accentText: "#FFFFFF", grid: "#EAEAE6" },
};

const FONTS = {
  system: { label: "Neutral", stack: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
  serif:  { label: "Serif",   stack: "ui-serif, Georgia, Cambria, Times New Roman, serif" },
  mono:   { label: "Mono",    stack: "ui-monospace, SFMono-Regular, Menlo, monospace" },
};

const DENSITY = {
  comfortable: { label: "Comfortable", col: 200 },
  compact:     { label: "Compact",     col: 140 },
};

const theme = (settings) => THEMES[settings?.theme] || THEMES.dark;

function ThemeStyle({ settings }) {
  const t = theme(settings);
  const f = FONTS[settings?.font] || FONTS.system;
  const css = `
.dl-root{--bg:${t.bg};--surface:${t.surface};--field:${t.field};--line:${t.line};--text:${t.text};--muted:${t.muted};--faint:${t.faint};--abg:${t.accentBg};--atext:${t.accentText};font-family:${f.stack};}
.dl-bg{background:var(--bg);}
.dl-surface{background:var(--surface);}
.dl-field{background:var(--field);}
.dl-text{color:var(--text);}
.dl-muted{color:var(--muted);}
.dl-faint{color:var(--faint);}
.dl-line{border-color:var(--line);}
.dl-accent{background:var(--abg);color:var(--atext);}
.dl-root input,.dl-root textarea,.dl-root select{color:var(--text);}
.dl-root input[type=date]{color-scheme:${settings?.theme === "light" ? "light" : "dark"};}
`;
  return <style>{css}</style>;
}

/* ================================================================== */
/* what can be recorded                                               */
/* ================================================================== */

const FIELDS = {
  load:     { label: "Training load", short: "TL", unit: "TL", step: 1 },
  duration: { label: "Duration", short: "Time", unit: "min", step: 1 },
  elapsed:  { label: "Elapsed time", short: "Elapsed", unit: "min", step: 1 },
  distance: { label: "Distance", short: "Distance", unit: "km", step: 0.1 },
  elevPos:  { label: "Elevation gain", short: "Elev +", unit: "m", step: 1 },
  elevNeg:  { label: "Elevation loss", short: "Elev −", unit: "m", step: 1 },
  calories: { label: "Calories", short: "Calories", unit: "kcal", step: 1 },
  // averaged fields: never summed. dir -1 means lower is better.
  pace:     { label: "Average pace", short: "Pace", unit: "min/km", step: 0.01, kind: "avg", dir: -1, weight: "distance", fmt: "pace" },
  adjPace:  { label: "Adjusted pace", short: "Adj. pace", unit: "min/km", step: 0.01, kind: "avg", dir: -1, weight: "distance", fmt: "pace" },
  hrMean:   { label: "Mean heart rate", short: "Mean HR", unit: "bpm", step: 1, kind: "avg", dir: 0, weight: "duration" },
};

// pace is stored as decimal minutes per km and shown as m:ss
function paceStr(m) {
  if (m === null || m === undefined || !Number.isFinite(Number(m))) return "NA";
  const t = Math.round(Number(m) * 60);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
function parsePace(txt) {
  if (txt === null || txt === undefined) return null;
  const s = String(txt).trim();
  if (!s) return null;
  if (s.includes(":")) {
    const [a, b] = s.split(":");
    const mm = Number(a), ss = Number(b);
    if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null;
    return mm + ss / 60;
  }
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}
const isTime = (id) => id === "duration" || id === "elapsed";

// a variable is stored in one canonical unit — minutes, min/km, km/h — and only
// the display is converted, so switching units can never alter your data
const UNIT_CHOICES = {
  duration: ["both", "min", "h"],
  elapsed:  ["both", "min", "h"],
  pace:     ["min/km", "km/h"],
  adjPace:  ["min/km", "km/h"],
};
let UNIT_PREFS = {};
function unitOf(id) {
  const choices = UNIT_CHOICES[id];
  if (!choices) return FIELDS[id] ? FIELDS[id].unit : "";
  return choices.includes(UNIT_PREFS[id]) ? UNIT_PREFS[id] : choices[0];
}
// what to print after the number; "both" already carries its own units
function unitLabel(id) {
  if (!UNIT_CHOICES[id]) return FIELDS[id] ? FIELDS[id].unit : "";
  const u = unitOf(id);
  return u === "both" ? "" : u;
}
function fmtMetric(v, met) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "NA";
  const id = met.id;
  const u = unitOf(id);
  if (isTime(id)) return u === "min" ? String(round(v, 2)) : u === "h" ? String(round(v / 60, 2)) : withHours(v);
  if (id === "pace" || id === "adjPace") return u === "km/h" ? String(round(60 / v, 2)) : paceStr(v);
  const f = FIELDS[id] || {};
  if (f.fmt === "pace") return paceStr(v);
  return round(v, 2);
}
// an averaged field is weighted by distance or by time, never a mean of means
function weightFor(s, met) {
  const w = FIELDS[met.id] ? FIELDS[met.id].weight : null;
  if (!w) return 1;
  const v = num(s.values ? s.values[w] : null);
  return v === null || !(v > 0) ? 1 : v;
}

const BUILTIN_SLIDERS = [
  { key: "motivation", label: "Motivation before", short: "Motivation", hint: "flat → eager" },
  { key: "freshness",  label: "Freshness before",  short: "Freshness",  hint: "wrecked → fresh" },
  { key: "rpe",        label: "Effort (RPE)",      short: "RPE",        hint: "easy → maximal" },
  { key: "injury",     label: "Niggle / pain",     short: "Niggle",     hint: "none → serious" },
];

const ALL_SLIDERS = ["motivation", "freshness", "rpe", "injury"];

function slidersOf(type, settings, hide = true) {
  if (!type) return [];
  const off = hide ? settings?.slidersOff || [] : [];
  const order = settings?.sliderOrder || ALL_SLIDERS;
  const built = (type.sliders || [])
    .map((k) => BUILTIN_SLIDERS.find((b) => b.key === k))
    .filter(Boolean)
    .filter((b) => !off.includes(b.key))
    .map((b) => ({ ...b, orderKey: b.key }));
  const own = (type.customSliders || [])
    .filter((c) => !off.includes(`cs:${c.name}`))
    .map((c) => ({ key: c.id, label: c.name, hint: c.hint || "", own: true, orderKey: `cs:${c.name}` }));
  const rank = (x) => { const i = order.indexOf(x.orderKey); return i < 0 ? 999 : i; };
  return [...built, ...own].sort((a, b) => rank(a) - rank(b));
}

// every slider in the whole file, built-in and custom, as {key,label}
function allSliderKeys(types) {
  const out = BUILTIN_SLIDERS.map((b) => ({ key: b.key, label: b.short }));
  (types || []).forEach((t) => (t.customSliders || []).forEach((c) => {
    if (c.name && !out.some((x) => x.key === `cs:${c.name}`)) out.push({ key: `cs:${c.name}`, label: c.name });
  }));
  return out;
}

const DEFAULT_SETTINGS = {
  theme: "dark",
  font: "system",
  density: "comfortable",
  ranges: ["7", "30", "12w", "1y", "custom"],
  metrics: ["activity", "load", "duration", "distance", "elevPos", "rpe", "motivation", "freshness", "injury"],
  corosMap: {},
  units: {},
  showRatio: true,
  showSubs: true,
  showStats: true,
  showDayTotals: true,
  calendarFixed: true,
  sliderValues: true,
  sliderHints: false,
  sliderOrder: ["motivation", "freshness", "rpe", "injury"],
  slidersOff: [],
  fieldOrder: ["load", "duration", "elapsed", "distance", "elevPos", "elevNeg", "pace", "adjPace", "hrMean", "calories"],
  fieldsOff: [],
};

const seed = () => ({
  version: 3,
  settings: { ...DEFAULT_SETTINGS },
  templates: [],
  types: [
    {
      id: "run", name: "Running", color: "#FF6B3D",
      fields: ["load", "duration", "elapsed", "distance", "elevPos", "elevNeg", "pace", "adjPace", "hrMean", "calories"],
      custom: [], sliders: ALL_SLIDERS, customSliders: [], boxes: [], formulas: [],
      children: [
        { id: uid(), name: "Trail", children: [] },
        { id: uid(), name: "Road", children: [] },
        { id: uid(), name: "Track", children: [] },
      ],
    },
    { id: "hike", name: "Hiking", color: "#9BCB5B",
      fields: ["load", "duration", "elapsed", "distance", "elevPos", "elevNeg", "pace", "hrMean", "calories"],
      custom: [], sliders: ALL_SLIDERS, customSliders: [], boxes: [], formulas: [], children: [] },
    { id: "bike", name: "Cycling", color: "#3FA9E0",
      fields: ["load", "duration", "elapsed", "distance", "elevPos", "elevNeg", "pace", "hrMean", "calories"],
      custom: [], sliders: ALL_SLIDERS, customSliders: [], boxes: [], formulas: [], children: [] },
    { id: "climb", name: "Climbing", color: "#F2C230", fields: ["duration"], custom: [], sliders: ["freshness", "rpe", "injury"], customSliders: [], boxes: [], formulas: [], children: [
      { id: uid(), name: "Bouldering", children: [] },
      { id: uid(), name: "Lead", children: [] },
    ]},
    { id: "gym", name: "Strength", color: "#B57BE0", fields: ["duration"], custom: [], sliders: ["freshness", "rpe", "injury"], customSliders: [],
      boxes: [{ id: uid(), name: "Upper body" }, { id: uid(), name: "Lower body" }, { id: uid(), name: "Core" }], formulas: [], children: [] },
  ],
  sessions: [],
});

// bring older saves up to the current shape without losing anything
function migrate(d) {
  const settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  const types = (d.types || []).map((t) => ({
    ...t,
    sliders: t.sliders || ALL_SLIDERS,
    customSliders: t.customSliders || [],
    boxes: t.boxes || [],
    formulas: t.formulas || [],
    custom: t.custom || [],
  }));
  let sessions = (d.sessions || []).map((s) => {
    const out = { ...s, boxes: s.boxes || [] };
    if (!out.sliders) {
      const sl = {};
      for (const k of ALL_SLIDERS) if (s[k] !== null && s[k] !== undefined) sl[k] = s[k];
      out.sliders = sl;
    }
    return out;
  });
  const known = Object.keys(FIELDS);
  settings.fieldOrder = [...(settings.fieldOrder || []).filter((k) => known.includes(k)),
                         ...known.filter((k) => !(settings.fieldOrder || []).includes(k))];
  const sliderKeys = allSliderKeys(types).map((x) => x.key);
  settings.sliderOrder = [...(settings.sliderOrder || []).filter((k) => sliderKeys.includes(k)),
                          ...sliderKeys.filter((k) => !(settings.sliderOrder || []).includes(k))];
  settings.slidersOff = settings.slidersOff || [];
  // the first Lab build handed every distance activity all six new fields,
  // including ones Coros never sends for that sport. put that right once
  // Coros files everything as trail, so Road and Track are only ever set by
  // hand — but they should exist to be set
  if (!settings.runSubsSeeded2) {
    settings.runSubsSeeded2 = true;
    const wanted = { run: ["Trail", "Road", "Track", "Treadmill"], bike: ["Road", "Indoor"] };
    types.forEach((t) => {
      if (!wanted[t.id]) return;
      const kids = [...(t.children || [])];
      wanted[t.id].forEach((nm) => {
        const has = kids.some((c) => {
          const a = (c.name || "").trim().toLowerCase(), b = nm.toLowerCase();
          return a === b || a.startsWith(b) || b.startsWith(a);
        });
        if (!has) kids.push({ id: uid(), name: nm, children: [] });
      });
      t.children = kids;
    });
  }
  if (!settings.pathIdsFixed) {
    settings.pathIdsFixed = true;
    const resolve = (root, path) => {
      let level = root.children || [];
      const out = [];
      for (const step of path) {
        const want = String(step).trim().toLowerCase();
        const hit = level.find((c) => c.id === step)
          || level.find((c) => {
            const nm = (c.name || "").trim().toLowerCase();
            return nm === want || nm.startsWith(want) || want.startsWith(nm);
          });
        if (!hit) break;
        out.push(hit.id);
        level = hit.children || [];
      }
      return out;
    };
    sessions = sessions.map((x) => {
      if (!x.path || !x.path.length) return x;
      const root = types.find((t) => t.id === x.typeId);
      if (!root) return x;
      const fixed = resolve(root, x.path);
      return fixed.join("|") === x.path.join("|") ? x : { ...x, path: fixed };
    });
  }
  if (!settings.adjPaceRestored) {
    settings.adjPaceRestored = true;
    types.forEach((t) => {
      if (t.id === "run" && !(t.fields || []).includes("adjPace"))
        t.fields = [...(t.fields || []), "adjPace"];
    });
  }
  if (!settings.speedMerged) {
    settings.speedMerged = true;
    const swap = (t) => {
      if ((t.fields || []).includes("speed"))
        t.fields = [...t.fields.filter((k) => k !== "speed"), ...(t.fields.includes("pace") ? [] : ["pace"])];
      (t.children || []).forEach(swap);
    };
    types.forEach(swap);
    sessions.forEach((x) => {
      const sp = num(x.values ? x.values.speed : null);
      if (sp !== null) {
        if (num(x.values.pace) === null && sp > 0) x.values = { ...x.values, pace: 60 / sp };
        const v = { ...x.values }; delete v.speed; x.values = v;
      }
    });
  }
  if (!settings.repsDropped) {
    settings.repsDropped = true;
    const strip = (t) => {
      if ((t.fields || []).includes("reps")) t.fields = t.fields.filter((k) => k !== "reps");
      (t.children || []).forEach(strip);
    };
    types.forEach(strip);
  }
  if (!settings.fieldsTidied) {
    settings.fieldsTidied = true;
    const canon = {
      run: ["load", "duration", "elapsed", "distance", "elevPos", "elevNeg", "pace", "adjPace", "hrMean", "calories"],
      hike: ["load", "duration", "elapsed", "distance", "elevPos", "elevNeg", "pace", "hrMean", "calories"],
      bike: ["load", "duration", "elapsed", "distance", "elevPos", "elevNeg", "pace", "hrMean", "calories"],
    };
    types.forEach((t) => { if (canon[t.id]) t.fields = canon[t.id]; });
  }
  return { ...d, version: 4, settings, types, sessions, templates: d.templates || [] };
}

/* ================================================================== */
/* activity tree                                                      */
/* ================================================================== */

const findRoot = (types, id) => types.find((t) => t.id === id) || null;

function childrenAt(root, path) {
  let nodes = root ? root.children || [] : [];
  for (const id of path || []) {
    const n = nodes.find((c) => c.id === id);
    if (!n) return [];
    nodes = n.children || [];
  }
  return nodes;
}

function pathNames(root, path) {
  const out = [];
  let nodes = root ? root.children || [] : [];
  for (const id of path || []) {
    const n = nodes.find((c) => c.id === id);
    if (!n) break;
    out.push(n.name);
    nodes = n.children || [];
  }
  return out;
}

const labelFor = (types, s) => {
  const root = findRoot(types, s.typeId);
  return root ? [root.name, ...pathNames(root, s.path)].join(" › ") : "Deleted activity";
};

const colorFor = (types, s) => {
  const root = findRoot(types, s.typeId);
  return root ? root.color : "#888";
};

/* ================================================================== */
/* filtering, down to sub-subtypes                                    */
/* ================================================================== */

const EMPTY_FILTER = { off: [], paths: {} };

function matchesFilter(s, filter) {
  if (!filter) return true;
  if ((filter.off || []).includes(s.typeId)) return false;
  const sel = (filter.paths || {})[s.typeId];
  if (!sel || !sel.length) return true;
  const key = (s.path || []).join("/");
  return sel.some((k) => key === k || key.startsWith(k + "/"));
}

const filterIsAll = (f) => !f || ((!f.off || !f.off.length) && !Object.values(f.paths || {}).some((a) => a.length));

/* ================================================================== */
/* Coros                                                              */
/* ================================================================== */

// where each Coros sport code lands by default. overridable in settings.corosMap
// EU Training Hub. the path is a guess until one real activity URL confirms it,
// so it is editable rather than hard-wired
const COROS_LINK = "https://trainingeu.coros.com/activity-detail?labelId={id}&sportType={sport}";
function corosLink(s, settings) {
  if (s.url) return s.url;
  const pat = (settings && settings.corosLink) || COROS_LINK;
  return pat.replace("{id}", s.corosLabelId || "").replace("{sport}", s.corosSportType || "");
}

// Coros puts the workout name in the location field. most of the time it is
// just the sport ("Run", "Trail", "Vélo de route") and worth ignoring, but a
// named session — "Interval (6r, 5k pace)", "Pyramid ∆" — makes a good title
const COROS_GENERIC = [
  "run", "running", "outdoor run", "trail", "trail run", "track run", "course",
  "hike", "randonnée", "walk", "cycling", "road bike", "vélo de route", "indoor bike",
];
const corosTitle = (loc) => {
  const t = String(loc || "").trim();
  return !t || COROS_GENERIC.includes(t.toLowerCase()) ? "" : t;
};

const COROS_MAP = (() => {
  const m = {
    100: { type: "run", sub: "Road" },
    101: { type: "run", sub: "Treadmill" },   // Coros "indoor run"
    102: { type: "run", sub: "Trail" },
    103: { type: "run", sub: "Track" },
    104: { type: "hike", sub: null },
    105: { type: "hike", sub: null },
  };
  [200, 202, 299].forEach((c) => { m[c] = { type: "bike", sub: "Road" }; });
  m[201] = { type: "bike", sub: "Indoor" };          // Coros "indoor bike"
  [203, 204, 205].forEach((c) => { m[c] = { type: "bike", sub: null }; });  // gravel, MTB
  return m;
})();

// Coros sends 65535 and -1 where a value is missing; 655.35 is the same marker
// scaled by 100. importing those as numbers would poison every average
const bad = (v) => v === null || v === undefined || !Number.isFinite(v)
  || v === -1 || v === 655.35 || v === 6553.5 || v === 65535;

function corosText(t) {
  let s = String(t || "").trim();
  if (s.includes("\\n")) s = s.replace(/\\n/g, "\n");
  return s.replace(/^"+/, "").replace(/"+$/, "");
}
function hms(str) {
  const p = String(str).trim().split(":").map(Number);
  if (p.some((x) => !Number.isFinite(x))) return null;
  if (p.length === 3) return p[0] * 60 + p[1] + p[2] / 60;
  if (p.length === 2) return p[0] + p[1] / 60;
  return null;
}
function km(str) {
  const m = String(str).match(/([\d.]+)\s*(km|m)\b/);
  if (!m) return null;
  return m[2] === "km" ? Number(m[1]) : Number(m[1]) / 1000;
}
const firstNum = (str) => { const m = String(str).match(/-?[\d.]+/); return m ? Number(m[0]) : null; };
const paceOf = (str) => parsePace(String(str).replace(/\/km/, "").trim());

// Coros label -> DayLoad field. this table is the whole mapping
const COROS_FIELDS = {
  "Training Load": ["load", firstNum],
  "Workout Time": ["duration", hms],
  "Total Time": ["elapsed", hms],
  "Distance": ["distance", km],
  "Average Pace": ["pace", paceOf],
  "Adjusted Pace": ["adjPace", paceOf],
  "Average Speed": ["pace", (v) => { const k = firstNum(v); return k && k > 0 ? 60 / k : null; }],
  "Average Heart Rate": ["hrMean", firstNum],
  "Calories": ["calories", firstNum],
};

// the querySportRecords listing: one numbered block per activity
function parseCorosList(text) {
  const out = [];
  const blocks = corosText(text).split(/\n(?=\s*\d+\.\s)/);
  for (let b of blocks) {
    const idAt = b.indexOf("LabelId:");
    if (idAt < 0) continue;
    const eol = b.indexOf("\n", idAt);
    b = b.slice(0, eol < 0 ? b.length : eol);
    const id = b.match(/LabelId:\s*(\S+)\s*\|\s*SportType:\s*(\d+)/);
    if (!id) continue;
    const date = b.match(/—\s*(\d{4}-\d{2}-\d{2})/);
    if (!date) continue;
    const values = {};
    const dur = b.match(/Duration:\s*([\d:]+)/);
    if (dur) values.duration = hms(dur[1]);
    const dist = b.match(/Distance:\s*([\d.]+\s*k?m)/);
    if (dist) values.distance = km(dist[1]);
    const pace = b.match(/Average Pace:\s*([\d:]+)/);
    if (pace) values.pace = paceOf(pace[1]);
    const spd = b.match(/Average Speed:\s*([\d.]+)/);
    if (spd && Number(spd[1]) > 0) values.pace = 60 / Number(spd[1]);
    const hr = b.match(/Avg HR:\s*(\d+)/);
    if (hr) values.hrMean = Number(hr[1]);
    const kcal = b.match(/Calories:\s*(\d+)/);
    if (kcal) values.calories = Number(kcal[1]);
    const loc = b.match(/Location:\s*(.+)/);
    out.push({
      labelId: id[1], sportType: Number(id[2]), date: date[1],
      location: loc ? loc[1].trim() : "", values, raw: b.trim(),
    });
  }
  return out;
}

// a getActivityDetail block. labelId comes from a "### id sport" line when
// present, otherwise the block is matched on its time and distance
function parseCorosDetail(text) {
  const s = corosText(text);
  const out = [];
  const raw = s.split(/\n(?=###\s|.{0,40}Activity Details)/);
  // a "### id sport" line splits off on its own, so glue it back onto the
  // block it labels before anything else looks at it
  const blocks = [];
  for (let i = 0; i < raw.length; i++) {
    if (/^\s*###/.test(raw[i]) && !/Activity Details/.test(raw[i]) && raw[i + 1] !== undefined) {
      blocks.push(raw[i] + "\n" + raw[i + 1]);
      i++;
    } else blocks.push(raw[i]);
  }
  for (const b of blocks) {
    if (!/Activity Details/.test(b)) continue;
    const hdr = b.match(/###\s*(\S+)\s+(\d+)/);
    const values = {}, unmapped = [];
    let note = "";
    for (const line of b.split("\n")) {
      const m = line.match(/^\s*([A-Za-z][A-Za-z .\/]+):\s*(.+?)\s*$/);
      if (!m) continue;
      const label = m[1].trim(), val = m[2].trim();
      if (label === "Workout Note") { note = val; continue; }
      if (label === "Elevation Gain / Loss") {
        const e = val.match(/(-?[\d.]+)\s*m\s*\/\s*(-?[\d.]+)\s*m/);
        if (e) { values.elevPos = Number(e[1]); values.elevNeg = Number(e[2]); }
        continue;
      }
      const hit = COROS_FIELDS[label];
      if (!hit) { if (!/^(Best|Moving|Max|Average Cadence|Average Stride|Average Power|Aerobic|Anaerobic|Training Focus|Perceived|Efficiency Factor|Variation|Performance)/.test(label)) unmapped.push(label); continue; }
      const v = hit[1](val);
      if (!bad(v)) values[hit[0]] = v;
    }
    Object.keys(values).forEach((k) => { if (bad(values[k])) delete values[k]; });
    out.push({
      labelId: hdr ? hdr[1] : null, sportType: hdr ? Number(hdr[2]) : null,
      values, unmapped, note, raw: b.trim(),
    });
  }
  return out;
}

// pair a detail block with a list entry when it carries no id of its own
function matchDetail(d, entries) {
  if (d.labelId) return entries.find((e) => e.labelId === d.labelId) || null;
  const near = (a, b, tol) => a !== undefined && b !== undefined && a !== null && b !== null && Math.abs(a - b) <= tol;
  const hits = entries.filter((e) =>
    near(e.values.duration, d.values.duration, 0.05) && near(e.values.distance, d.values.distance, 0.02));
  return hits.length === 1 ? hits[0] : null;
}

/* ================================================================== */
/* metrics                                                            */
/* ================================================================== */

const METRICS = [
  { id: "activity",   label: "Activity",   kind: "fixed", unit: "" },
  { id: "load",       label: "TL",         kind: "sum",   unit: "TL" },
  { id: "duration",   label: "Time",       kind: "sum",   unit: "min" },
  { id: "distance",   label: "Distance",   kind: "sum",   unit: "km" },
  { id: "elevPos",    label: "Elev +",     kind: "sum",   unit: "m" },
  { id: "elevNeg",    label: "Elev −",     kind: "sum",   unit: "m" },
  { id: "elapsed",    label: "Elapsed",    kind: "sum",   unit: "min" },
  { id: "calories",   label: "Calories",   kind: "sum",   unit: "kcal" },
  { id: "pace",       label: "Pace",       kind: "avg",   unit: "min/km" },
  { id: "adjPace",    label: "Adj. pace",  kind: "avg",   unit: "min/km" },
  { id: "hrMean",     label: "Mean HR",    kind: "avg",   unit: "bpm" },
  { id: "rpe",        label: "RPE",        kind: "sum",   unit: "RPE" },
  { id: "motivation", label: "Motivation", kind: "level", unit: "" },
  { id: "freshness",  label: "Freshness",  kind: "level", unit: "" },
  { id: "injury",     label: "Niggle",     kind: "level", unit: "" },
];

function formulaScope(s, root) {
  const scope = {};
  for (const k of Object.keys(FIELDS)) { const v = num(s.values?.[k]); if (v !== null) scope[k] = v; }
  for (const k of ALL_SLIDERS) { const v = s.sliders?.[k]; if (v !== null && v !== undefined) scope[k] = v; }
  (root?.custom || []).forEach((c) => {
    const v = num(s.custom?.[c.id]);
    if (v !== null) scope[c.name.replace(/[^A-Za-z0-9_]/g, "_")] = v;
  });
  return scope;
}

function formulaValue(s, root, f) {
  try {
    const r = math.evaluate(f.expr, formulaScope(s, root));
    return Number.isFinite(r) ? r : null;
  } catch (e) { return null; }
}

function metricValue(s, metric, types) {
  if (metric === "activity") return 1;
  if (FIELDS[metric]) return num(s.values?.[metric]);
  const root = findRoot(types || [], s.typeId);
  if (metric.startsWith("cs:")) {
    const c = (root?.customSliders || []).find((x) => x.name === metric.slice(3));
    const v = c ? s.sliders?.[c.id] : null;
    return v === null || v === undefined ? null : v;
  }
  if (metric.startsWith("fx:")) {
    const f = (root?.formulas || []).find((x) => x.name === metric.slice(3));
    return f ? formulaValue(s, root, f) : null;
  }
  const v = s.sliders?.[metric];
  return v === null || v === undefined ? null : v;
}

// muting in Variables & sliders governs the calendar and the summary only.
// the log and the session card always show everything the activity records,
// so those pass hide = false
function orderedFields(keys, settings, hide = true) {
  const order = settings?.fieldOrder || Object.keys(FIELDS);
  const off = hide ? settings?.fieldsOff || [] : [];
  return order.filter((k) => keys.includes(k) && !off.includes(k));
}

function metricsFor(types, settings) {
  const off = settings?.fieldsOff || [];
  const order = settings?.fieldOrder || Object.keys(FIELDS);
  const sliderOff = settings?.slidersOff || [];
  const base = METRICS.filter((m) => !off.includes(m.id) && !sliderOff.includes(m.id));
  const sliderNames = [], formulaNames = [];
  (types || []).forEach((t) => {
    (t.customSliders || []).forEach((c) => {
      if (c.name && !sliderNames.includes(c.name) && !sliderOff.includes(`cs:${c.name}`)) sliderNames.push(c.name);
    });
    (t.formulas || []).forEach((f) => { if (f.name && !formulaNames.includes(f.name)) formulaNames.push(f.name); });
  });
  const sliderOrder = settings?.sliderOrder || ALL_SLIDERS;
  const head = base.filter((m) => m.id === "activity");
  // only offer variables that some visible activity actually records: unticking
  // a field everywhere should remove it from the metric row and the summary too
  const used = new Set();
  (types || []).forEach((t) => { if (!t.muted) (t.fields || []).forEach((k) => used.add(k)); });
  const fieldMetrics = order.map((k) => base.find((m) => m.id === k)).filter((m) => m && used.has(m.id));
  const rest = base
    .filter((m) => m.id !== "activity" && !FIELDS[m.id])
    .sort((a, b) => {
      const ia = sliderOrder.indexOf(a.id), ib = sliderOrder.indexOf(b.id);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
  return [
    ...head, ...fieldMetrics, ...rest,
    ...formulaNames.map((n) => ({ id: `fx:${n}`, label: n, kind: "sum", unit: "" })),
    ...sliderNames
      .map((n) => ({ id: `cs:${n}`, label: n, kind: "level", unit: "" }))
      .sort((a, b) => {
        const ia = sliderOrder.indexOf(a.id), ib = sliderOrder.indexOf(b.id);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      }),
  ];
}

const sessionTL = (s) => num(s.values?.load);

// does this session match a saved preset, field for field?
function matchesTemplate(s, templates) {
  const same = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});
  return (templates || []).some((t) =>
    t.typeId === s.typeId
    && (t.path || []).join("/") === (s.path || []).join("/")
    && same(t.values, s.values) && same(t.sliders, s.sliders)
    && same([...(t.boxes || [])].sort(), [...(s.boxes || [])].sort()));
}

// sessions belonging to muted activities are kept in storage but shown nowhere
const liveSessions = (data) => data.sessions.filter((s) => !findRoot(data.types, s.typeId)?.muted);

function acwrSeries(sessions, fromISO, toISO) {
  const map = {};
  for (const s of sessions) { const l = sessionTL(s); if (l !== null) map[s.date] = (map[s.date] || 0) + l; }
  const daily = [];
  let d = addDays(parseISO(fromISO), -28);
  const end = parseISO(toISO);
  while (d <= end) { const iso = fmtISO(d); daily.push({ date: iso, load: map[iso] || 0 }); d = addDays(d, 1); }
  return daily.map((p, i) => {
    const acute = daily.slice(Math.max(0, i - 6), i + 1).reduce((a, b) => a + b.load, 0);
    const chronic = daily.slice(Math.max(0, i - 27), i + 1).reduce((a, b) => a + b.load, 0) / 4;
    return { date: p.date, ratio: chronic > 0 ? round(acute / chronic, 2) : null };
  }).filter((p) => p.date >= fromISO);
}

/* ================================================================== */
/* primitives                                                         */
/* ================================================================== */

const card = "rounded-2xl border dl-line dl-surface";
const inputCls = "w-full rounded-xl border dl-line dl-field px-3 py-3 text-base tabular-nums focus:outline-none";
const smallInput = "rounded-lg border dl-line dl-field px-2 py-2 text-sm";

// horizontal swipe, with a short guard so the gesture doesn't also count as a tap
function useSwipe(onLeft, onRight) {
  const start = useRef(null);
  const swiped = useRef(false);
  return {
    swiped,
    handlers: {
      onTouchStart: (e) => { const t = e.touches[0]; start.current = { x: t.clientX, y: t.clientY }; },
      onTouchEnd: (e) => {
        if (!start.current) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.current.x;
        const dy = t.clientY - start.current.y;
        start.current = null;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          swiped.current = true;
          setTimeout(() => { swiped.current = false; }, 350);
          if (dx < 0) onLeft(); else onRight();
        }
      },
    },
  };
}

function Field({ label, unit, children }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm dl-muted">{label}</span>
        {unit ? <span className="text-xs dl-faint">{unit}</span> : null}
      </div>
      {children}
    </label>
  );
}

function PaceInput({ value, onChange }) {
  const [txt, setTxt] = useState(value === null || value === undefined ? "" : paceStr(value));
  useEffect(() => { setTxt(value === null || value === undefined ? "" : paceStr(value)); }, [value]);
  const commit = () => { const v = parsePace(txt); onChange(v === null ? null : v); };
  return (
    <input type="text" inputMode="numeric" className={inputCls} placeholder="5:37"
      value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={commit} />
  );
}

function NumInput({ value, onChange, step = 1, placeholder = "" }) {
  return (
    <input type="number" inputMode="decimal" step={step} className={inputCls}
      value={value ?? ""} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />
  );
}

function Slider({ label, hint, value, color, onChange, showValue = true, showHint = false }) {
  const set = value !== null && value !== undefined;
  const [armed, setArmed] = useState(false);
  const track = useRef(null);
  const timer = useRef(null);
  const startY = useRef(0);

  const valueAt = (x) => {
    const r = track.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (x - r.left) / r.width));
    return Math.round(ratio * 100) / 10;
  };

  const down = (e) => {
    const x = e.clientX, id = e.pointerId;
    startY.current = e.clientY;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setArmed(true);
      try { track.current.setPointerCapture(id); } catch (err) { /* ignore */ }
      if (navigator.vibrate) { try { navigator.vibrate(10); } catch (err) { /* ignore */ } }
      onChange(valueAt(x));
    }, 350);
  };

  const move = (e) => {
    if (armed) { onChange(valueAt(e.clientX)); return; }
    if (Math.abs(e.clientY - startY.current) > 8) clearTimeout(timer.current);
  };

  const up = () => { clearTimeout(timer.current); setArmed(false); };

  return (
    <div className="py-2">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm dl-muted">{label}</span>
        <span className="flex items-center gap-2">
          {(!set || showValue) && (
            <span className="text-base tabular-nums" style={{ color: set ? color : "var(--faint)" }}>
              {set ? (showValue ? value.toFixed(1) : "") : "NA"}
            </span>
          )}
          {set && <button type="button" onClick={() => onChange(null)} className="dl-faint" aria-label="Back to NA"><X size={14} /></button>}
        </span>
      </div>

      <div ref={track} onPointerDown={down} onPointerMove={move} onPointerUp={up}
        onPointerCancel={up} onPointerLeave={up}
        className="relative w-full rounded-full"
        style={{
          height: 28, background: "var(--line)", touchAction: "pan-y",
          outline: armed ? "2px solid var(--text)" : "none",
        }}>
        <div className="absolute inset-y-0 left-0"
          style={{
            width: `${(set ? value : 0) * 10}%`,
            background: set ? color : "transparent",
            opacity: armed ? 1 : 0.9,
            borderRadius: value >= 9.9 ? 14 : "14px 2px 2px 14px",
          }} />
        {set && (
          <div className="absolute"
            style={{
              left: `calc(${value * 10}% - 2px)`, top: -3, width: 4, height: 34,
              borderRadius: 2, background: "var(--text)",
            }} />
        )}
      </div>

      {showHint && hint && <div className="mt-1 text-xs dl-faint">{hint}</div>}
    </div>
  );
}

function Chip({ on, color, onClick, children, small }) {
  return (
    <button onClick={onClick} className={`rounded-full border ${small ? "px-3 py-1 text-sm" : "px-3 py-2 text-sm"}`}
      style={{
        borderColor: on ? color || "var(--text)" : "var(--line)",
        background: on && color ? color + "26" : "transparent",
        color: on ? color || "var(--text)" : "var(--muted)",
      }}>
      {children}
    </button>
  );
}

function Note({ text, limit = 220 }) {
  const [open, setOpen] = useState(false);
  const long = text.length > limit;
  return (
    <div className="mt-3">
      <p className="whitespace-pre-wrap text-sm dl-muted">
        {long && !open ? text.slice(0, limit).trimEnd() + "…" : text}
      </p>
      {long && (
        <button onClick={() => setOpen(!open)} className="mt-1 text-xs underline dl-faint">
          {open ? "show less" : "show the whole note"}
        </button>
      )}
    </div>
  );
}

function Section({ title, hint, open, onToggle, children }) {
  return (
    <div className={card}>
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left">
        <span className="flex-1 font-medium">{title}</span>
        {hint ? <span className="text-xs dl-faint">{hint}</span> : null}
        {open ? <ChevronDown size={16} className="dl-faint" /> : <ChevronRight size={16} className="dl-faint" />}
      </button>
      {open && <div className="space-y-3 border-t dl-line p-3">{children}</div>}
    </div>
  );
}

/* ================================================================== */
/* shell                                                              */
/* ================================================================== */

export default function DayLoad() {
  const [data, setData] = useState(null);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState("calendar");
  const [sheet, setSheet] = useState(null);

  useEffect(() => {
    let live = true;
    store.load().then((d) => {
      if (!live) return;
      const raw = d && d.types ? d : seed();
      let next;
      try {
        next = migrate(raw);
      } catch (err) {
        console.error("migration failed, loading your log as it stands", err);
        next = raw;
      }
      setData(next);
      setReady(true);
    }).catch((err) => {
      console.error("could not read your log", err);
      if (live) { setData(seed()); setReady(true); }
    });
    return () => { live = false; };
  }, []);

  useEffect(() => { if (ready && data) store.save(data); }, [data, ready]);

  UNIT_PREFS = (data && data.settings && data.settings.units) || {};

  if (!data) return <div className="p-8 text-center">Loading your log…</div>;

  const update = (patch) => setData((d) => ({ ...d, ...patch }));

  const saveSession = (s) => {
    setData((d) => {
      const exists = d.sessions.some((x) => x.id === s.id);
      const sessions = exists ? d.sessions.map((x) => (x.id === s.id ? s : x)) : [...d.sessions, s];
      sessions.sort((a, b) => (a.date < b.date ? 1 : -1));
      return { ...d, sessions };
    });
    setSheet(null);
  };

  const deleteSession = (id) => setData((d) => ({ ...d, sessions: d.sessions.filter((x) => x.id !== id) }));

  const addTemplate = (s) =>
    setData((d) => ({
      ...d,
      templates: [...(d.templates || []), {
        id: uid(), name: s.title || labelFor(d.types, s), typeId: s.typeId, path: s.path,
        values: s.values, custom: s.custom, sliders: s.sliders, boxes: s.boxes, title: s.title || "",
      }],
    }));

  const toggleFav = (id) =>
    setData((d) => ({ ...d, sessions: d.sessions.map((x) => (x.id === id ? { ...x, fav: !x.fav } : x)) }));

  const pages = [
    { id: "calendar", label: "Calendar", icon: CalendarDays },
    { id: "summary", label: "Summary", icon: BarChart3 },
    { id: "params", label: "Parameters", icon: Settings2 },
  ];

  return (
    <div className="dl-root dl-bg dl-text min-h-screen pb-24">
      <ThemeStyle settings={data.settings} />

      <main className="mx-auto max-w-2xl px-3 py-3">
        {page === "calendar" && (
          <Calendar data={data} onAdd={(date) => setSheet({ date })}
            onOpen={(s) => setSheet({ session: s })} onDelete={deleteSession} onFav={toggleFav}
            onDuplicate={(s) => setSheet({ session: { ...s, id: uid(), date: todayISO(), fav: false, _dup: true } })}
            onTemplate={addTemplate} />
        )}
        {page === "summary" && <Summary data={data} />}
        {page === "params" && <Parameters data={data} update={update} />}
      </main>

      <nav className="dl-bg fixed inset-x-0 bottom-0 border-t dl-line">
        <div className="mx-auto flex max-w-2xl">
          {pages.map((p) => {
            const Icon = p.icon;
            const on = page === p.id;
            return (
              <button key={p.id} onClick={() => setPage(p.id)}
                className={`flex flex-1 flex-col items-center gap-1 py-3 ${on ? "dl-text" : "dl-faint"}`}>
                <Icon size={20} />
                <span className="text-xs">{p.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {sheet && (
        <SessionSheet types={data.types} initial={sheet.session} date={sheet.date}
          settings={data.settings} templates={data.templates || []}
          onSave={saveSession} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}

/* ================================================================== */
/* filter panel, shared by calendar and summary                       */
/* ================================================================== */

function collectSubs(type) {
  const out = [];
  const walk = (nodes, prefix, names) => {
    nodes.forEach((n) => {
      const key = [...prefix, n.id].join("/");
      out.push({ typeId: type.id, key, label: [...names, n.name].join(" › "), color: type.color });
      if (n.children?.length) walk(n.children, [...prefix, n.id], [...names, n.name]);
    });
  };
  walk(type.children || [], [], []);
  return out;
}

function FilterPanel({ types, sessions, filter, setFilter, allowSubs }) {
  const [openSubs, setOpenSubs] = useState(false);

  // an activity with nothing logged against it can't filter anything, so it stays out
  const used = useMemo(() => new Set(sessions.map((s) => s.typeId)), [sessions]);
  const subUsed = useMemo(() => {
    const set = new Set();
    sessions.forEach((s) => {
      const p = s.path || [];
      for (let i = 1; i <= p.length; i++) set.add(s.typeId + "|" + p.slice(0, i).join("/"));
    });
    return set;
  }, [sessions]);

  const shown = types.filter((t) => used.has(t.id) && !t.muted);
  const isOn = (id) => !(filter.off || []).includes(id);
  const enabled = shown.filter((t) => isOn(t.id));
  const subs = enabled.flatMap(collectSubs).filter((x) => subUsed.has(x.typeId + "|" + x.key));
  const picked = Object.values(filter.paths || {}).flat();

  const toggleType = (id) =>
    setFilter((f) => {
      const off = (f.off || []).includes(id) ? f.off.filter((x) => x !== id) : [...(f.off || []), id];
      const paths = { ...(f.paths || {}) };
      if (off.includes(id)) delete paths[id];
      return { ...f, off, paths };
    });

  const togglePath = (typeId, key) =>
    setFilter((f) => {
      const cur = (f.paths || {})[typeId] || [];
      const next = cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key];
      return { ...f, paths: { ...(f.paths || {}), [typeId]: next } };
    });

  return (
    <div className="space-y-2">
      <div className={`${card} p-3`}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm dl-muted">Activities</span>
          <div className="flex items-center gap-3 text-xs">
            <button onClick={() => setFilter((f) => ({ ...f, off: [], paths: {} }))} className="underline dl-muted">All</button>
            <button onClick={() => setFilter((f) => ({ ...f, off: types.map((t) => t.id), paths: {} }))} className="underline dl-faint">None</button>
          </div>
        </div>
        {shown.length ? (
          <div className="flex flex-wrap gap-2">
            {shown.map((t) => (
              <Chip key={t.id} small on={isOn(t.id)} color={t.color} onClick={() => toggleType(t.id)}>{t.name}</Chip>
            ))}
            <Chip small on={!!filter.merge} onClick={() => setFilter((f) => ({ ...f, merge: !f.merge }))}>Merged</Chip>
          </div>
        ) : (
          <p className="text-xs dl-faint">Activities appear here once you've logged one.</p>
        )}
      </div>

      {allowSubs && subs.length > 0 && (
        <div className={`${card} p-3`}>
          <div className="flex items-center justify-between">
            <button onClick={() => setOpenSubs(!openSubs)} className="flex flex-1 items-center gap-2 text-left text-sm dl-muted">
              Subactivities
              {picked.length ? <span className="text-xs dl-faint">{picked.length} ticked</span> : null}
              {openSubs ? <ChevronDown size={14} className="dl-faint" /> : <ChevronRight size={14} className="dl-faint" />}
            </button>
            {openSubs && picked.length > 0 && (
              <button onClick={() => setFilter((f) => ({ ...f, paths: {} }))} className="text-xs underline dl-faint">clear</button>
            )}
          </div>
          {openSubs && (
            <>
              <div className="mt-2 flex flex-wrap gap-2">
                {subs.map((x) => (
                  <Chip key={x.typeId + x.key} small color={x.color}
                    on={((filter.paths || {})[x.typeId] || []).includes(x.key)}
                    onClick={() => togglePath(x.typeId, x.key)}>
                    {x.label}
                  </Chip>
                ))}
              </div>
              {!picked.length && <p className="mt-2 text-xs dl-faint">None ticked means every subactivity counts.</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// three figures for a set of values, shared by the calendar week and the summary
function statsFor(vals, met, nDays, wts) {
  const sum = vals.reduce((a, b) => a + b, 0);
  if (met.kind === "avg") {
    const W = wts && wts.length === vals.length ? wts : vals.map(() => 1);
    const tot = W.reduce((a, b) => a + b, 0);
    const mean = vals.length && tot ? vals.reduce((a, v, i) => a + v * W[i], 0) / tot : null;
    const dir = FIELDS[met.id] && FIELDS[met.id].dir !== undefined ? FIELDS[met.id].dir : 0;
    const hi = vals.length ? Math.max(...vals) : null;
    const lo = vals.length ? Math.min(...vals) : null;
    const best = dir < 0 ? lo : hi;
    const worst = dir < 0 ? hi : lo;
    const wLabel = FIELDS[met.id] && FIELDS[met.id].weight ? `mean by ${FIELDS[met.id].weight}` : "mean";
    return [
      { v: mean === null ? "NA" : fmtMetric(mean, met), l: wLabel },
      { v: best === null ? "NA" : fmtMetric(best, met), l: dir === 0 ? "highest" : "best" },
      { v: worst === null ? "NA" : fmtMetric(worst, met), l: dir === 0 ? "lowest" : "worst" },
    ];
  }
  if (met.kind === "level")
    return [
      { v: vals.length ? round(sum / vals.length, 1) : "NA", l: `mean ${met.label.toLowerCase()}` },
      { v: vals.length ? round(Math.max(...vals), 1) : "NA", l: "highest" },
      { v: vals.length ? round(Math.min(...vals), 1) : "NA", l: "lowest" },
    ];
  const fmt = (x) => (isTime(met.id) ? withHours(x) : round(x, 2) ?? 0);
  return [
    { v: fmt(sum), l: isTime(met.id) ? "total time" : `total ${met.unit || "activities"}` },
    { v: isTime(met.id) ? withHours(sum / nDays) : round(sum / nDays, 2) ?? 0, l: "per day" },
    { v: vals.length ? (isTime(met.id) ? withHours(sum / vals.length) : round(sum / vals.length, 2)) : 0, l: "per activity" },
  ];
}

/* ================================================================== */
/* A. calendar                                                        */
/* ================================================================== */

function Calendar({ data, onAdd, onOpen, onDelete, onFav, onDuplicate, onTemplate }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [metric, setMetric] = useState("activity");
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [picked, setPicked] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const metrics = useMemo(() => metricsFor(data.types, data.settings), [data.types, data.settings]);
  const met = metrics.find((m) => m.id === metric) || metrics[0] || METRICS[0];
  const COL = (DENSITY[data.settings?.density] || DENSITY.comfortable).col;

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => fmtISO(addDays(weekStart, i))), [weekStart]);
  const live = useMemo(() => liveSessions(data), [data]);

  const byDay = useMemo(() => {
    const map = {};
    days.forEach((d) => { map[d] = []; });
    for (const s of live) if (map[s.date] && matchesFilter(s, filter)) map[s.date].push(s);
    return map;
  }, [live, days, filter]);

  const scaleMax = useMemo(() => {
    if (met.kind !== "sum") return 10;
    const from = fmtISO(addDays(weekStart, -49));
    const to = days[6];
    const totals = {};
    for (const s of live) {
      if (s.date < from || s.date > to || !matchesFilter(s, filter)) continue;
      const v = metricValue(s, met.id, data.types);
      if (v !== null) totals[s.date] = (totals[s.date] || 0) + v;
    }
    return Math.max(1, ...Object.values(totals));
  }, [live, data.types, weekStart, met, filter, days]);

  // averaged metrics have no meaningful zero, so bars are scaled across the
  // trailing eight weeks and flipped when lower is better — taller stays better
  const avgRange = useMemo(() => {
    if (met.kind !== "avg") return null;
    const from = fmtISO(addDays(weekStart, -49));
    const to = days[6];
    const vs = [];
    for (const s of live) {
      if (s.date < from || s.date > to || !matchesFilter(s, filter)) continue;
      const v = metricValue(s, met.id, data.types);
      if (v !== null) vs.push(v);
    }
    return vs.length ? { lo: Math.min(...vs), hi: Math.max(...vs) } : null;
  }, [live, data.types, weekStart, met, filter, days]);

  const heightFor = (v) => {
    if (met.kind === "fixed") return 26;
    if (v === null) return 6;
    if (met.kind === "level") return Math.max(8, (v / 10) * (COL / 3));
    if (met.kind === "avg") {
      if (!avgRange || avgRange.hi === avgRange.lo) return Math.max(10, COL / 3);
      let t = (v - avgRange.lo) / (avgRange.hi - avgRange.lo);
      const dir = FIELDS[met.id] && FIELDS[met.id].dir !== undefined ? FIELDS[met.id].dir : 0;
      if (dir < 0) t = 1 - t;
      return Math.max(10, 12 + t * (COL - 12));
    }
    return Math.max(10, (v / scaleMax) * COL);
  };

  const weekTotal = days.reduce((a, d) => {
    for (const s of byDay[d]) { const v = metricValue(s, met.id, data.types); if (v !== null) a += v; }
    return a;
  }, 0);

  const swipe = useSwipe(() => setWeekStart(addDays(weekStart, 7)), () => setWeekStart(addDays(weekStart, -7)));

  const weekPairs = days
    .flatMap((d) => byDay[d].map((s) => ({ v: metricValue(s, met.id, data.types), w: weightFor(s, met) })))
    .filter((p) => p.v !== null);
  const weekVals = weekPairs.map((p) => p.v);
  const weekStats = statsFor(weekVals, met, 7, weekPairs.map((p) => p.w));

  const thisWeek = fmtISO(startOfWeek(new Date())) === fmtISO(weekStart);
  const label = `${parseISO(days[0]).getDate()} ${parseISO(days[0]).toLocaleDateString(undefined, { month: "short" })} – ${parseISO(days[6]).getDate()} ${parseISO(days[6]).toLocaleDateString(undefined, { month: "short" })}`;
  const footer =
    met.kind === "fixed" ? `${weekTotal} activit${weekTotal === 1 ? "y" : "ies"} this week`
    : met.kind === "sum" ? (isTime(met.id) ? `${fmtMetric(weekTotal, met)} ${unitLabel(met.id)} this week` : `${round(weekTotal, 0)} ${unitLabel(met.id) || met.label} this week`)
    : met.kind === "avg" ? `${met.label}, weighted by ${(FIELDS[met.id] && FIELDS[met.id].weight) || "session"} — never summed`
    : `${met.label}, each session on its own 0–10 scale`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded-xl border dl-line p-2 dl-muted"><ChevronLeft size={18} /></button>
        <div className="flex-1 text-center">
          <div className="text-base font-medium">{label}</div>
          {thisWeek
            ? <span className="text-xs dl-faint">this week</span>
            : <button onClick={() => setWeekStart(startOfWeek(new Date()))} className="text-xs dl-muted underline">Back to this week</button>}
        </div>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded-xl border dl-line p-2 dl-muted"><ChevronRight size={18} /></button>
        <button onClick={() => onAdd(thisWeek ? todayISO() : days[0])} className="dl-accent rounded-xl p-2" aria-label="Log an activity"><Plus size={20} /></button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {metrics.map((m) => (
          <button key={m.id} onClick={() => setMetric(m.id)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${met.id === m.id ? "dl-accent" : "dl-faint"}`}>
            {m.label}
          </button>
        ))}
      </div>

      <div className={`${card} p-3`} {...swipe.handlers}>
        <div className="flex items-end justify-between gap-1"
          style={data.settings?.calendarFixed === false
            ? { minHeight: COL + 40 }
            : { height: COL + 40, overflow: "hidden" }}>
          {days.map((d, i) => {
            const list = byDay[d];
            const isToday = d === todayISO();
            return (
              <div key={d} className="flex flex-1 flex-col items-center">
                <button onClick={() => { if (swipe.swiped.current) return; onAdd(d); }} className="flex w-full flex-col-reverse items-center gap-1 pb-2"
                  style={data.settings?.calendarFixed === false ? { minHeight: COL } : { height: COL, overflow: "hidden" }}
                  aria-label={`Log an activity on ${d}`}>
                  {filter.merge
                    ? (() => {
                        if (!list.length) return null;
                        const vals = list.map((s) => metricValue(s, met.id, data.types)).filter((v) => v !== null);
                        const h =
                          met.kind === "fixed" ? Math.min(COL, 26 * list.length)
                          : !vals.length ? 6
                          : met.kind === "level" ? heightFor(vals.reduce((a, b) => a + b, 0) / vals.length)
                          : heightFor(vals.reduce((a, b) => a + b, 0));
                        return <span className="w-full rounded" style={{ height: h, background: "var(--text)", opacity: vals.length || met.kind === "fixed" ? 0.85 : 0.3 }} />;
                      })()
                    : list.map((s) => {
                        const v = metricValue(s, met.id, data.types);
                        const c = colorFor(data.types, s);
                        return (
                          <span key={s.id} onClick={(e) => { e.stopPropagation(); setPicked(picked === s.id ? null : s.id); }}
                            className="w-full rounded"
                            style={{
                              height: heightFor(v), background: c,
                              opacity: v === null ? 0.3 : picked && picked !== s.id ? 0.4 : 1,
                              outline: picked === s.id ? "2px solid var(--text)" : "none",
                            }} />
                        );
                      })}
                  {data.settings?.showDayTotals !== false && list.length > 0 && (() => {
                    const pairs = list
                      .map((x) => ({ v: metricValue(x, met.id, data.types), w: weightFor(x, met) }))
                      .filter((p) => p.v !== null);
                    const vals = pairs.map((p) => p.v);
                    const wTot = pairs.reduce((a, p) => a + p.w, 0);
                    const shownVal =
                      met.kind === "fixed" ? list.length
                      : !vals.length ? null
                      : met.kind === "level" ? round(vals.reduce((a, b) => a + b, 0) / vals.length, 1)
                      : met.kind === "avg" ? (wTot ? fmtMetric(pairs.reduce((a, p) => a + p.v * p.w, 0) / wTot, met) : null)
                      : fmtMetric(vals.reduce((a, b) => a + b, 0), met);
                    return shownVal === null ? null : (
                      <span className="tabular-nums dl-muted" style={{ fontSize: 10, lineHeight: "12px" }}>{shownVal}</span>
                    );
                  })()}
                </button>
                <div className={`text-xs dl-muted ${isToday ? "font-semibold" : ""}`}>{DAY_LETTERS[i]}</div>
                <div className={`text-xs tabular-nums dl-muted ${isToday ? "font-semibold" : ""}`}>{parseISO(d).getDate()}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 border-t dl-line pt-2 text-center text-xs dl-muted tabular-nums">{footer}</div>
      </div>

      {data.settings?.showStats !== false && (
        <div className="grid grid-cols-3 gap-2">
          {weekStats.map((x) => <Tile key={x.l} value={x.v} label={x.l} />)}
        </div>
      )}

      {picked && (() => {
        const s = data.sessions.find((x) => x.id === picked);
        if (!s) return null;
        const root = findRoot(data.types, s.typeId);
        const c = colorFor(data.types, s);
        return (
          <div className={card} style={{ borderLeftColor: c, borderLeftWidth: 4 }}>
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs dl-faint tabular-nums">{s.date}</div>
                  <div className="font-medium">{s.title || labelFor(data.types, s)}</div>
                  {s.title && <div className="text-xs dl-faint">{labelFor(data.types, s)}</div>}
                  {s.source === "coros" && (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="rounded-full border dl-line px-2 py-0.5 text-xs dl-faint">COROS</span>
                      <a href={corosLink(s, data.settings)} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 text-xs dl-muted">
                        <LinkIcon size={12} /> Open
                      </a>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => onFav(s.id)} aria-label="Favourite" className={s.fav ? "" : "dl-faint"}>
                    <Star size={18} fill={s.fav ? "#F2C230" : "none"} color={s.fav ? "#F2C230" : "currentColor"} />
                  </button>
                  <button onClick={() => setPicked(null)} className="dl-faint"><X size={16} /></button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
                {orderedFields((root && root.fields) || [], data.settings, false).map((f) => {
                  const v = num(s.values?.[f]);
                  if (v === null) return null;
                  return (
                    <div key={f}><span className="dl-faint">{FIELDS[f].short}: </span>
                      <span className="tabular-nums">{fmtMetric(v, { id: f, kind: FIELDS[f].kind || "sum" })} {unitLabel(f)}</span></div>
                  );
                })}
                {(root?.formulas || []).map((f) => {
                  const v = formulaValue(s, root, f);
                  return v === null ? null : (
                    <div key={f.id}><span className="dl-faint">{f.name}: </span>
                      <span className="tabular-nums">{round(v, 1)} {f.unit}</span></div>
                  );
                })}
                {slidersOf(root, data.settings, false).map((f) => {
                  const v = s.sliders?.[f.key];
                  if (v === null || v === undefined) return null;
                  return (
                    <div key={f.key}><span className="dl-faint">{f.short || f.label}: </span>
                      <span className="tabular-nums">{v.toFixed(1)}</span></div>
                  );
                })}
              </div>

              {(s.boxes || []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {(s.boxes || []).map((id) => {
                    const b = (root?.boxes || []).find((x) => x.id === id);
                    return b ? <span key={id} className="rounded-full border dl-line px-2 py-1 text-xs dl-muted">{b.name}</span> : null;
                  })}
                </div>
              )}

              {s.note && <Note text={s.note} />}
              {s.url && (
                <a href={s.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm underline">
                  <LinkIcon size={14} /> Open in Coros
                </a>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => onOpen(s)} className="flex items-center gap-2 rounded-xl border dl-line px-3 py-2 text-sm dl-muted">
                  <Pencil size={14} /> Edit
                </button>
                <button onClick={() => onDuplicate(s)} className="flex items-center gap-2 rounded-xl border dl-line px-3 py-2 text-sm dl-muted">
                  <CopyPlus size={14} /> Duplicate
                </button>
                {(() => {
                  const saved = matchesTemplate(s, data.templates);
                  return (
                    <button onClick={() => { if (!saved) onTemplate(s); }} disabled={saved}
                      className="flex items-center gap-2 rounded-xl border dl-line px-3 py-2 text-sm dl-muted">
                      <Bookmark size={14} fill={saved ? "currentColor" : "none"} />
                      {saved ? "Saved as preset" : "Save as preset"}
                    </button>
                  );
                })()}
                <button onClick={() => setConfirmDel(s)} className="flex items-center gap-2 rounded-xl border dl-line px-3 py-2 text-sm" style={{ color: "#F2546B" }}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {confirmDel && (
        <div className="dl-root fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className={`${card} w-full max-w-sm p-5`}>
            <div className="font-medium">Delete this session?</div>
            <p className="mt-2 text-sm dl-muted">
              {confirmDel.date} · {confirmDel.title || labelFor(data.types, confirmDel)}
            </p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setConfirmDel(null)} className="flex-1 rounded-xl border dl-line py-3 text-sm">Cancel</button>
              <button onClick={() => { onDelete(confirmDel.id); setConfirmDel(null); setPicked(null); }}
                className="flex-1 rounded-xl py-3 text-sm font-medium" style={{ background: "#F2546B", color: "#fff" }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <FilterPanel types={data.types} sessions={live} filter={filter} setFilter={setFilter}
        allowSubs={data.settings?.showSubs !== false} />

      <History data={data} filter={filter}
        onPick={(s) => { setWeekStart(startOfWeek(parseISO(s.date))); setPicked(s.id); }} />
    </div>
  );
}

/* ================================================================== */
/* history — modular search under the calendar                        */
/* ================================================================== */

const OPS = ["<", ">", "="];

function searchFields(types) {
  const out = [
    { id: "date", label: "Date", kind: "date" },
    { id: "type", label: "Activity", kind: "type" },
    { id: "subtype", label: "Subactivity", kind: "text" },
    { id: "fav", label: "Favourite", kind: "bool" },
    { id: "source", label: "Source", kind: "src" },
  ];
  Object.keys(FIELDS).forEach((k) => out.push({ id: k, label: FIELDS[k].label, kind: "num" }));
  BUILTIN_SLIDERS.forEach((b) => out.push({ id: b.key, label: b.short, kind: "num" }));
  const seenF = [], seenS = [];
  (types || []).forEach((t) => {
    (t.formulas || []).forEach((f) => { if (f.name && !seenF.includes(f.name)) { seenF.push(f.name); out.push({ id: `fx:${f.name}`, label: f.name, kind: "num" }); } });
    (t.customSliders || []).forEach((c) => { if (c.name && !seenS.includes(c.name)) { seenS.push(c.name); out.push({ id: `cs:${c.name}`, label: c.name, kind: "num" }); } });
  });
  out.push({ id: "box", label: "Tick box", kind: "text" });
  out.push({ id: "note", label: "Notes", kind: "text" });
  return out;
}

function condMatch(s, c, types, defs) {
  if (!c.field) return true;
  const def = defs.find((d) => d.id === c.field);
  if (!def) return true;
  if (def.kind === "type") return !c.value || s.typeId === c.value;
  if (def.kind === "bool") return c.value === "no" ? !s.fav : !!s.fav;
  if (def.kind === "src") return c.value === "manual" ? s.source !== "coros" : s.source === "coros";
  if (def.kind === "text") {
    const needle = (c.value || "").toLowerCase();
    if (!needle) return true;
    if (c.field === "note") return (s.note || "").toLowerCase().includes(needle);
    if (c.field === "subtype") {
      const root = findRoot(types, s.typeId);
      return pathNames(root, s.path).join(" ").toLowerCase().includes(needle);
    }
    const root = findRoot(types, s.typeId);
    const names = (s.boxes || []).map((id) => (root?.boxes || []).find((b) => b.id === id)?.name || "").join(" ").toLowerCase();
    return names.includes(needle);
  }
  if (def.kind === "date") {
    if (!c.value) return true;
    return c.op === "<" ? s.date < c.value : c.op === ">" ? s.date > c.value : s.date === c.value;
  }
  const v = metricValue(s, c.field, types);
  const t = num(c.value);
  if (v === null || t === null) return false;
  return c.op === "<" ? v < t : c.op === ">" ? v > t : v === t;
}

function History({ data, filter, onPick }) {
  const [open, setOpen] = useState(false);
  const [conds, setConds] = useState([]);
  const [text, setText] = useState("");
  const defs = useMemo(() => searchFields(data.types), [data.types]);

  const results = useMemo(() => {
    if (!open) return [];
    const needle = text.trim().toLowerCase();
    return liveSessions(data)
      .filter((s) => matchesFilter(s, filter)
        && (!needle || `${s.title || ""} ${s.note || ""}`.toLowerCase().includes(needle))
        && conds.every((c) => condMatch(s, c, data.types, defs)))
      .slice(0, 60);
  }, [open, data, filter, conds, defs, text]);

  const setCond = (i, patch) => setConds((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <Section title="History" hint={open ? `${results.length} shown` : "search"} open={open} onToggle={() => setOpen(!open)}>
      <div className="flex items-center gap-2">
        <Search size={16} className="dl-faint" />
        <input type="text" className={`${smallInput} flex-1`} placeholder="search titles and notes"
          value={text} onChange={(e) => setText(e.target.value)} />
        {text && <button onClick={() => setText("")} className="dl-faint"><X size={14} /></button>}
      </div>
      <p className="text-xs dl-faint">Conditions stack — all of them have to hold. The activity filter above applies too.</p>

      {conds.map((c, i) => {
        const def = defs.find((d) => d.id === c.field);
        return (
          <div key={c.id} className="flex flex-wrap items-center gap-2">
            <select className={smallInput} value={c.field} onChange={(e) => setCond(i, { field: e.target.value, value: "" })}>
              {defs.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
            {(def?.kind === "num" || def?.kind === "date") && (
              <select className={smallInput} value={c.op} onChange={(e) => setCond(i, { op: e.target.value })}>
                {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            {def?.kind === "bool" ? (
              <select className={`${smallInput} flex-1`} value={c.value || "yes"} onChange={(e) => setCond(i, { value: e.target.value })}>
                <option value="yes">starred</option>
                <option value="no">not starred</option>
              </select>
            ) : def?.kind === "src" ? (
              <select className={`${smallInput} flex-1`} value={c.value || "coros"} onChange={(e) => setCond(i, { value: e.target.value })}>
                <option value="coros">from Coros</option>
                <option value="manual">logged by hand</option>
              </select>
            ) : def?.kind === "type" ? (
              <select className={`${smallInput} flex-1`} value={c.value} onChange={(e) => setCond(i, { value: e.target.value })}>
                <option value="">any</option>
                {data.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            ) : def?.kind === "date" ? (
              <input type="date" className={`${smallInput} flex-1`} value={c.value} onChange={(e) => setCond(i, { value: e.target.value })} />
            ) : def?.kind === "text" ? (
              <input type="text" placeholder="contains…" className={`${smallInput} flex-1`} value={c.value} onChange={(e) => setCond(i, { value: e.target.value })} />
            ) : (
              <input type="number" inputMode="decimal" className={`${smallInput} w-24`} value={c.value} onChange={(e) => setCond(i, { value: e.target.value })} />
            )}
            <button onClick={() => setConds((cs) => cs.filter((_, j) => j !== i))} className="dl-faint"><Trash2 size={14} /></button>
          </div>
        );
      })}

      <button onClick={() => setConds((cs) => [...cs, { id: uid(), field: "distance", op: "<", value: "" }])}
        className="flex items-center gap-2 rounded-xl border border-dashed dl-line px-3 py-2 text-sm dl-muted">
        <Search size={14} /> Add a condition
      </button>

      <div className="space-y-1">
        {results.map((s) => {
          const c = colorFor(data.types, s);
          return (
            <button key={s.id} onClick={() => onPick(s)} className="flex w-full items-center gap-3 rounded-xl border dl-line px-3 py-2 text-left">
              <span className="h-8 w-1 rounded" style={{ background: c }} />
              <span className="flex-1">
                <span className="block text-xs dl-faint tabular-nums">{s.date}</span>
                <span className="block text-sm">{s.title || labelFor(data.types, s)}</span>
                {s.title && <span className="block text-xs dl-faint">{labelFor(data.types, s)}</span>}
              </span>
              <span className="flex items-center gap-2 text-xs dl-faint tabular-nums">
                {s.values?.distance ? `${s.values.distance} km` : s.values?.duration ? `${s.values.duration} min` : ""}
                {s.fav && <Star size={12} fill="#F2C230" color="#F2C230" />}
              </span>
            </button>
          );
        })}
        {open && !results.length && <p className="text-sm dl-faint">Nothing matches.</p>}
      </div>
    </Section>
  );
}

/* ================================================================== */
/* logging sheet                                                      */
/* ================================================================== */

function SessionSheet({ types, initial, date, onSave, onClose, settings, templates, onTemplate }) {
  const [s, setS] = useState(
    initial || { id: uid(), date: date || todayISO(), typeId: null, path: [], values: {}, custom: {}, sliders: {}, boxes: [], title: "", url: "", note: "" }
  );
  const root = findRoot(types, s.typeId);
  const color = root ? root.color : "var(--text)";
  const set = (patch) => setS((x) => ({ ...x, ...patch }));

  const levels = [];
  for (let i = 0; i <= (s.path || []).length; i++) {
    const opts = childrenAt(root, (s.path || []).slice(0, i));
    if (!opts.length) break;
    const names = pathNames(root, s.path);
    levels.push({ depth: i, opts, parent: i === 0 ? root.name : names[i - 1] });
  }

  return (
    <div className="dl-root dl-bg dl-text fixed inset-0 z-50 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 pb-10">
        <div className="dl-bg sticky top-0 z-10 flex items-center justify-between border-b dl-line py-4">
          <button onClick={onClose} className="dl-muted">Cancel</button>
          <span className="flex items-center gap-2 font-medium">
            {initial?._dup ? "Duplicate" : initial ? "Edit activity" : "Log an activity"}
            <button onClick={() => set({ fav: !s.fav })} aria-label="Favourite" className={s.fav ? "" : "dl-faint"}>
              <Star size={18} fill={s.fav ? "#F2C230" : "none"} color={s.fav ? "#F2C230" : "currentColor"} />
            </button>
          </span>
          <button disabled={!root} onClick={() => { const { _dup, ...clean } = s; onSave(clean); }}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${root ? "dl-accent" : "dl-faint"}`}>
            <Save size={16} /> Save
          </button>
        </div>

        <div className="space-y-4 pt-4">
          {(templates || []).length > 0 && !initial && (
            <div className={`${card} p-4`}>
              <div className="mb-2 text-sm dl-muted">Presets</div>
              <div className="flex flex-wrap gap-2">
                {templates.map((tpl) => {
                  const t = findRoot(types, tpl.typeId);
                  return (
                    <Chip key={tpl.id} small color={t?.color}
                      onClick={() => setS((x) => ({
                        ...x, typeId: tpl.typeId, path: tpl.path || [],
                        values: { ...(tpl.values || {}) }, custom: { ...(tpl.custom || {}) },
                        sliders: { ...(tpl.sliders || {}) }, boxes: [...(tpl.boxes || [])],
                        title: tpl.title || x.title,
                      }))}>
                      {tpl.name}
                    </Chip>
                  );
                })}
              </div>
            </div>
          )}

          <div className={`${card} p-4`}>
            <Field label="Date">
              <input type="date" className={inputCls} value={s.date} onChange={(e) => set({ date: e.target.value })} />
            </Field>
            <div className="mt-4 mb-2 text-sm dl-muted">Activity</div>
            <div className="flex flex-wrap gap-2">
              {types.filter((t) => !t.muted || t.id === s.typeId).map((t) => (
                <Chip key={t.id} on={s.typeId === t.id} color={t.color}
                  onClick={() => set({ typeId: t.id, path: [], values: {}, custom: {}, sliders: {}, boxes: [] })}>
                  {t.name}
                </Chip>
              ))}
            </div>
            {levels.map((lv) => (
              <div key={lv.depth} className="mt-4">
                <div className="mb-2 flex items-center gap-2 text-sm dl-faint">
                  <span style={{ color }}>{lv.parent}</span><ChevronRight size={14} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {lv.opts.map((o) => {
                    const on = (s.path || [])[lv.depth] === o.id;
                    return (
                      <Chip key={o.id} small on={on} color={color}
                        onClick={() => set({ path: on ? s.path.slice(0, lv.depth) : [...s.path.slice(0, lv.depth), o.id] })}>
                        {o.name}
                      </Chip>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {!root && <div className={`${card} p-6 text-center text-sm dl-muted`}>Pick an activity and its own fields appear here.</div>}

          {root && (
            <>
              {(root.boxes || []).length > 0 && (
                <div className={`${card} p-4`}>
                  <div className="mb-2 text-sm dl-muted">What it involved</div>
                  <div className="flex flex-wrap gap-2">
                    {root.boxes.map((b) => {
                      const on = (s.boxes || []).includes(b.id);
                      return (
                        <Chip key={b.id} small on={on} color={color}
                          onClick={() => set({ boxes: on ? s.boxes.filter((x) => x !== b.id) : [...(s.boxes || []), b.id] })}>
                          {b.name}
                        </Chip>
                      );
                    })}
                  </div>
                </div>
              )}

              {(root.fields.length || root.custom?.length || root.formulas?.length) ? (
                <div className={`${card} p-4`}>
                  <div className="grid grid-cols-2 gap-3">
                    {orderedFields(root.fields, settings, false).map((f) => (
                      <Field key={f} label={FIELDS[f].label} unit={FIELDS[f].unit}>
                        {FIELDS[f].fmt === "pace"
                          ? <PaceInput value={s.values[f]}
                              onChange={(v) => setS((x) => ({ ...x, values: { ...x.values, [f]: v } }))} />
                          : <NumInput value={s.values[f]} step={FIELDS[f].step}
                              onChange={(v) => setS((x) => ({ ...x, values: { ...x.values, [f]: v } }))} />}
                      </Field>
                    ))}
                    {(root.custom || []).map((c) => (
                      <Field key={c.id} label={c.name} unit={c.unit}>
                        <NumInput value={s.custom?.[c.id]} step={0.1}
                          onChange={(v) => setS((x) => ({ ...x, custom: { ...x.custom, [c.id]: v } }))} />
                      </Field>
                    ))}
                  </div>
                  {(root.formulas || []).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-3 border-t dl-line pt-3 text-sm">
                      {root.formulas.map((f) => {
                        const v = formulaValue(s, root, f);
                        return (
                          <span key={f.id} className="dl-faint">
                            {f.name}: <span className="tabular-nums" style={{ color }}>{v === null ? "NA" : round(v, 1)}</span> {f.unit}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}

              {slidersOf(root, settings, false).length > 0 && (
                <div className={`${card} p-4`}>
                  {slidersOf(root, settings, false).map((f) => (
                    <Slider key={f.key} label={f.label} hint={f.hint}
                      color={f.key === "injury" ? "#F2546B" : color}
                      showValue={settings?.sliderValues !== false}
                      showHint={settings?.sliderHints === true}
                      value={s.sliders?.[f.key] ?? null}
                      onChange={(v) => setS((x) => ({ ...x, sliders: { ...x.sliders, [f.key]: v } }))} />
                  ))}
                </div>
              )}

              <div className={`${card} space-y-3 p-4`}>
                <Field label="Title">
                  <input type="text" className={inputCls} placeholder="hill reps with Marie…" value={s.title || ""}
                    onChange={(e) => set({ title: e.target.value })} />
                </Field>
                <Field label="Link to the Coros activity">
                  <input type="url" className={inputCls} placeholder="https://…" value={s.url || ""} onChange={(e) => set({ url: e.target.value })} />
                </Field>
                <Field label="Notes">
                  <textarea rows={3} className={inputCls} value={s.note || ""} onChange={(e) => set({ note: e.target.value })} />
                </Field>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* B. summary                                                         */
/* ================================================================== */

const RANGES = [
  { id: "7", label: "7 days", days: 7, bucket: "day" },
  { id: "30", label: "30 days", days: 30, bucket: "day" },
  { id: "12w", label: "12 weeks", days: 84, bucket: "week" },
  { id: "1y", label: "Year", days: 365, bucket: "month" },
  { id: "custom", label: "Custom", days: null, bucket: null },
];

const bucketKey = (iso, b) => (b === "day" ? iso : b === "week" ? fmtISO(startOfWeek(parseISO(iso))) : fmtISO(startOfMonth(parseISO(iso))));
const bucketLabel = (k, b) => {
  const d = parseISO(k);
  return b === "month" ? String(d.getMonth() + 1) : `${d.getDate()}/${d.getMonth() + 1}`;
};

function Summary({ data }) {
  const ranges = RANGES.filter((r) => (data.settings?.ranges || DEFAULT_SETTINGS.ranges).includes(r.id));
  const [range, setRange] = useState("12w");
  const [metric, setMetric] = useState("load");
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [offset, setOffset] = useState(0); // how many periods back from now
  const th = theme(data.settings);

  const metrics = useMemo(() => metricsFor(data.types, data.settings), [data.types, data.settings]);
  const met = metrics.find((m) => m.id === metric) || metrics[0] || METRICS[0];
  const r = ranges.find((x) => x.id === range) || ranges[0] || RANGES[2];

  const useCustom = r.id === "custom" && custom.from && custom.to;
  const len = r.days || 84;
  const toISO = useCustom ? custom.to : fmtISO(addDays(new Date(), -len * offset));
  const fromISO = useCustom ? custom.from : fmtISO(addDays(new Date(), -len * offset - len + 1));
  const span = Math.abs(dayDiff(toISO, fromISO));
  const bucket = useCustom ? (span > 200 ? "month" : span > 60 ? "week" : "day") : r.bucket || "day";

  const stacked = met.kind === "sum" || met.kind === "fixed";
  const live = useMemo(() => liveSessions(data), [data]);
  const shownTypes = data.types.filter((t) => !t.muted && !(filter.off || []).includes(t.id));
  const inRange = live.filter((s) => s.date >= fromISO && s.date <= toISO && matchesFilter(s, filter));

  const rows = useMemo(() => {
    const keys = [];
    let d = parseISO(fromISO);
    const end = parseISO(toISO);
    while (d <= end) { const k = bucketKey(fmtISO(d), bucket); if (!keys.includes(k)) keys.push(k); d = addDays(d, 1); }
    const out = keys.map((k) => ({ key: k, label: bucketLabel(k, bucket) }));
    const byKey = {}; out.forEach((x) => { byKey[x.key] = x; });
    const acc = {};
    for (const s of inRange) {
      const k = bucketKey(s.date, bucket);
      const v = metricValue(s, met.id, data.types);
      if (v === null || !byKey[k]) continue;
      if (stacked) {
        const lane = filter.merge ? "total" : s.typeId;
        byKey[k][lane] = (byKey[k][lane] || 0) + v;
      }
      else {
        acc[k] = acc[k] || { n: 0, t: 0 };
        const w = met.kind === "avg" ? weightFor(s, met) : 1;
        acc[k].n += w; acc[k].t += v * w;
      }
    }
    if (!stacked) out.forEach((x) => { x.avg = acc[x.key] && acc[x.key].n ? round(acc[x.key].t / acc[x.key].n, 2) : null; });
    return out;
  }, [inRange, data.types, fromISO, toISO, bucket, met, stacked, filter.merge]);

  const acwr = useMemo(
    () => acwrSeries(live.filter((s) => matchesFilter(s, filter)), fromISO, toISO)
      .map((p) => ({ ...p, label: bucketLabel(p.date, "day") })),
    [live, filter, fromISO, toISO]
  );
  const latest = acwr.length ? acwr[acwr.length - 1] : null;

  const statPairs = inRange
    .map((s) => ({ v: metricValue(s, met.id, data.types), w: weightFor(s, met) }))
    .filter((p) => p.v !== null);
  const vals = statPairs.map((p) => p.v);
  const nDays = Math.max(1, span + 1);
  const stats = statsFor(vals, met, nDays, statPairs.map((p) => p.w));

  // hold the chart to unlock its time axis, then drag it across
  const [axisArmed, setAxisArmed] = useState(false);
  const pressTimer = useRef(null);
  const dragging = useRef(false);
  const dragFrom = useRef({ x: 0, offset: 0 });

  const startPress = () => {
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      setAxisArmed(true);
      if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* ignore */ } }
    }, 450);
  };
  const cancelPress = () => clearTimeout(pressTimer.current);

  const axisHandlers = useCustom ? {} : {
    onPointerDown: (e) => {
      if (axisArmed) { dragging.current = true; dragFrom.current = { x: e.clientX, offset }; }
      else startPress();
    },
    onPointerMove: (e) => {
      if (!axisArmed) { cancelPress(); return; }
      if (!dragging.current) return;
      const steps = Math.round((e.clientX - dragFrom.current.x) / 60);
      const next = Math.max(0, dragFrom.current.offset + steps);
      if (next !== offset) setOffset(next);
    },
    onPointerUp: () => { cancelPress(); dragging.current = false; },
    onPointerCancel: () => { cancelPress(); dragging.current = false; },
    onPointerLeave: () => { cancelPress(); dragging.current = false; },
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {ranges.map((x) => <Chip key={x.id} small on={r.id === x.id} onClick={() => { setRange(x.id); setOffset(0); }}>{x.label}</Chip>)}
      </div>

      {!useCustom && (
        <div className="flex items-center gap-2">
          <button onClick={() => setOffset((o) => o + 1)} className="rounded-xl border dl-line p-2 dl-muted"><ChevronLeft size={18} /></button>
          <div className="flex-1 text-center">
            <div className="text-sm tabular-nums">{fromISO} → {toISO}</div>
            {offset > 0
              ? <button onClick={() => setOffset(0)} className="text-xs dl-muted underline">Back to now</button>
              : <span className="text-xs dl-faint">hold the chart to drag the window</span>}
          </div>
          <button onClick={() => setOffset((o) => Math.max(0, o - 1))} disabled={offset === 0}
            className="rounded-xl border dl-line p-2 dl-muted" style={{ opacity: offset === 0 ? 0.35 : 1 }}>
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {r.id === "custom" && (
        <div className={`${card} grid grid-cols-2 gap-3 p-4`}>
          <Field label="From"><input type="date" className={inputCls} value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></Field>
          <Field label="To"><input type="date" className={inputCls} value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></Field>
        </div>
      )}

      <FilterPanel types={data.types} sessions={live} filter={filter} setFilter={setFilter}
        allowSubs={data.settings?.showSubs !== false} />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {metrics.map((m) => (
          <button key={m.id} onClick={() => setMetric(m.id)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${met.id === m.id ? "dl-accent" : "dl-faint"}`}>
            {m.label}
          </button>
        ))}
      </div>

      <div className={`${card} p-3`} {...axisHandlers}
        style={{
          outline: axisArmed ? "2px solid var(--text)" : "none",
          touchAction: axisArmed ? "none" : "auto",
        }}>
        {axisArmed && (
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs dl-faint">Drag across to move the window</span>
            <button onClick={() => { setAxisArmed(false); dragging.current = false; }} className="dl-accent rounded-xl px-3 py-1 text-sm font-medium">
              Done
            </button>
          </div>
        )}
        <div style={{ height: 230 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <CartesianGrid stroke={th.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: th.faint, fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis domain={stacked ? [0, "auto"] : [0, 10]} tick={{ fill: th.faint, fontSize: 11 }} />
              <Tooltip content={<Panel th={th} />} cursor={{ fill: th.grid }} />
              {stacked
                ? (filter.merge
                    ? <Bar dataKey="total" fill={th.text} name="all activities" />
                    : shownTypes.map((t) => <Bar key={t.id} dataKey={t.id} stackId="a" fill={t.color} name={t.name} />))
                : <Bar dataKey="avg" fill={th.text} name={`${met.label} (average)`} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
        {!stacked && <p className="mt-2 text-xs dl-faint">Average across the sessions in each bar.</p>}
      </div>

      {data.settings?.showStats !== false && (
        <div className="grid grid-cols-3 gap-2">
          {stats.map((x) => <Tile key={x.l} value={x.v} label={x.l} />)}
        </div>
      )}

      {data.settings?.showRatio !== false && (
        <div className={`${card} p-3`}>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-sm dl-muted">Recent vs habitual load</span>
            <span className="text-2xl tabular-nums">{latest?.ratio ?? "NA"}</span>
          </div>
          <p className="mb-3 text-xs dl-faint">Last 7 days of TL against your 28-day weekly average.</p>
          <div style={{ height: 140 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={acwr} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                <CartesianGrid stroke={th.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: th.faint, fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: th.faint, fontSize: 11 }} />
                <Tooltip content={<Panel th={th} />} cursor={{ fill: th.grid }} />
                <ReferenceLine y={1.5} stroke="#F2546B" strokeDasharray="4 4" />
                <ReferenceLine y={0.8} stroke={th.line} strokeDasharray="4 4" />
                <Bar dataKey="ratio" fill={th.muted} name="ratio" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ value, label }) {
  return (
    <div className={`${card} p-3 text-center`}>
      <div className="text-xl tabular-nums">{value}</div>
      <div className="text-xs dl-faint">{label}</div>
    </div>
  );
}

function Panel({ active, payload, label, th }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border px-3 py-2 text-xs" style={{ background: th.bg, borderColor: th.line, color: th.text }}>
      <div className="mb-1" style={{ color: th.faint }}>{label}</div>
      {payload.filter((p) => p.value).map((p) => (
        <div key={p.name} className="tabular-nums" style={{ color: p.color }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
}

/* ================================================================== */
/* C. parameters                                                      */
/* ================================================================== */

const PALETTE = [
  "#FF5C5C", "#FF6B3D", "#F2A23C", "#F2C230", "#C9D14A", "#9BCB5B", "#4ED9B4",
  "#35C3D6", "#3FA9E0", "#6C8BE0", "#B57BE0", "#E07BC8", "#F2546B", "#D4D4D4",
];

function Parameters({ data, update }) {
  const [section, setSection] = useState(null);
  const [open, setOpen] = useState(null);
  const [armed, setArmed] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const pressTimer = useRef(null);
  const dragging = useRef(false);
  const suppressClick = useRef(false);
  const rowRefs = useRef({});
  const settings = data.settings || DEFAULT_SETTINGS;
  const setSettings = (patch) => update({ settings: { ...settings, ...patch } });
  const setTypes = (fn) => update({ types: fn(data.types) });

  const editNode = (rootId, path, fn) =>
    setTypes((ts) => ts.map((t) => {
      if (t.id !== rootId) return t;
      if (!path.length) return fn(t);
      const walk = (nodes, depth) =>
        nodes.map((n) => (n.id !== path[depth] ? n : depth === path.length - 1 ? fn(n) : { ...n, children: walk(n.children || [], depth + 1) }));
      return { ...t, children: walk(t.children || [], 0) };
    }));

  const removeNode = (rootId, path) => {
    if (!path.length) { setTypes((ts) => ts.filter((t) => t.id !== rootId)); return; }
    setTypes((ts) => ts.map((t) => {
      if (t.id !== rootId) return t;
      const walk = (nodes, depth) =>
        depth === path.length - 1 ? nodes.filter((n) => n.id !== path[depth])
          : nodes.map((n) => (n.id === path[depth] ? { ...n, children: walk(n.children || [], depth + 1) } : n));
      return { ...t, children: walk(t.children || [], 0) };
    }));
  };

  const moveType = (i, dir) =>
    setTypes((ts) => {
      const j = i + dir;
      if (j < 0 || j >= ts.length) return ts;
      const a = [...ts];
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });

  const moveTo = (from, to) =>
    setTypes((ts) => {
      if (to < 0 || to >= ts.length || from === to) return ts;
      const a = [...ts];
      const [m] = a.splice(from, 1);
      a.splice(to, 0, m);
      return a;
    });

  // hold a row for a moment to unlock it; nothing is destructive here
  const startPress = (id) => {
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      setArmed(id);
      suppressClick.current = true;
      if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* ignore */ } }
    }, 450);
  };
  const cancelPress = () => clearTimeout(pressTimer.current);

  const dragTo = (e) => {
    if (!armed || !dragging.current) return;
    const from = data.types.findIndex((t) => t.id === armed);
    if (from < 0) return;
    const y = e.clientY;
    let to = from;
    data.types.forEach((t, i) => {
      const el = rowRefs.current[t.id];
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (y > r.top && y < r.bottom) to = i;
    });
    if (to !== from) moveTo(from, to);
  };

  const addChild = (rootId, path) =>
    editNode(rootId, path, (n) => ({ ...n, children: [...(n.children || []), { id: uid(), name: "New", children: [] }] }));

  const Branch = ({ rootId, nodes, path }) => (
    <div className="ml-2 border-l dl-line pl-3">
      {nodes.map((n) => (
        <div key={n.id} className="py-1">
          <div className="flex items-center gap-2">
            <input className={`${smallInput} flex-1`} value={n.name}
              onChange={(e) => editNode(rootId, [...path, n.id], (x) => ({ ...x, name: e.target.value }))} />
            <button onClick={() => addChild(rootId, [...path, n.id])} className="dl-faint"><Plus size={16} /></button>
            <button onClick={() => removeNode(rootId, [...path, n.id])} className="dl-faint"><Trash2 size={14} /></button>
          </div>
          {n.children?.length ? <Branch rootId={rootId} nodes={n.children} path={[...path, n.id]} /> : null}
        </div>
      ))}
    </div>
  );

  const derived = metricsFor(data.types, { metrics: [] });

  const pending = data.types.find((t) => t.id === confirming);

  return (
    <div className="space-y-3">
      {pending && (
        <div className="dl-root fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className={`${card} w-full max-w-sm p-5`}>
            <div className="font-medium">Delete {pending.name}?</div>
            <p className="mt-2 text-sm dl-muted">
              {(() => {
                const n = data.sessions.filter((x) => x.typeId === pending.id).length;
                return n
                  ? `${n} session${n === 1 ? "" : "s"} recorded under it will lose their activity. Muting keeps them intact.`
                  : "Nothing has been logged under it.";
              })()}
            </p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setConfirming(null)} className="flex-1 rounded-xl border dl-line py-3 text-sm">Cancel</button>
              <button onClick={() => { removeNode(pending.id, []); setConfirming(null); setOpen(null); }}
                className="flex-1 rounded-xl py-3 text-sm font-medium" style={{ background: "#F2546B", color: "#fff" }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-2 mt-5 px-1 text-xs uppercase tracking-wide dl-faint">Activity settings</div>
      <Section title="Activities" hint={`${data.types.length} defined`}
        open={section === "activities"} onToggle={() => setSection(section === "activities" ? null : "activities")}>
        <p className="text-xs dl-faint">Tap to open. Press and hold to move or mute.</p>
        {data.types.map((t, i) => (
          <div key={t.id} ref={(el) => { rowRefs.current[t.id] = el; }} className={card}
            style={{
              borderLeftColor: t.color, borderLeftWidth: 4,
              opacity: t.muted && armed !== t.id ? 0.5 : 1,
              outline: armed === t.id ? "2px solid var(--text)" : "none",
              transform: armed === t.id ? "scale(1.02)" : "none",
              transition: "transform 120ms ease",
              touchAction: armed === t.id ? "none" : "auto",
            }}
            onPointerDown={(ev) => { if (armed === t.id) { dragging.current = true; } else if (!armed) { startPress(t.id); } }}
            onPointerMove={(ev) => { if (armed === t.id && dragging.current) dragTo(ev); else cancelPress(); }}
            onPointerUp={() => { cancelPress(); dragging.current = false; }}
            onPointerCancel={() => { cancelPress(); dragging.current = false; }}
            onPointerLeave={() => { cancelPress(); }}
          >
            {armed === t.id ? (
              <div className="space-y-2 p-3">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: t.color }} />
                  <span className="flex-1 font-medium">{t.name}</span>
                  <button onClick={() => { setArmed(null); dragging.current = false; }} className="dl-accent rounded-xl px-4 py-2 text-sm font-medium">
                    Done
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <Chip small on={!!t.muted} onClick={() => editNode(t.id, [], (x) => ({ ...x, muted: !x.muted }))}>
                    {t.muted ? "Muted" : "Mute"}
                  </Chip>
                  <button onClick={() => moveType(i, -1)} disabled={i === 0}
                    className="rounded-xl border dl-line px-4 py-2" aria-label="Move up">
                    <ChevronUp size={18} style={{ opacity: i === 0 ? 0.3 : 1 }} />
                  </button>
                  <button onClick={() => moveType(i, 1)} disabled={i === data.types.length - 1}
                    className="rounded-xl border dl-line px-4 py-2" aria-label="Move down">
                    <ChevronDown size={18} style={{ opacity: i === data.types.length - 1 ? 0.3 : 1 }} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (suppressClick.current) { suppressClick.current = false; return; }
                  setOpen(open === t.id ? null : t.id);
                }}
                className="flex w-full items-center gap-3 p-4 text-left">
                <span className="h-3 w-3 rounded-full" style={{ background: t.color }} />
                <span className="flex-1 font-medium">{t.name}</span>
                {t.muted && <span className="text-xs dl-faint">muted</span>}
                {open === t.id ? <ChevronDown size={16} className="dl-faint" /> : <ChevronRight size={16} className="dl-faint" />}
              </button>
            )}

            {open === t.id && armed !== t.id && (
              <div className="space-y-4 border-t dl-line p-4">
                <Field label="Name">
                  <input className={inputCls} value={t.name} onChange={(e) => editNode(t.id, [], (x) => ({ ...x, name: e.target.value }))} />
                </Field>

                <div>
                  <div className="mb-2 text-sm dl-muted">Colour</div>
                  <div className="flex flex-wrap gap-2">
                    {PALETTE.map((c) => (
                      <button key={c} onClick={() => editNode(t.id, [], (x) => ({ ...x, color: c }))}
                        className="h-8 w-8 rounded-full border-2"
                        style={{ background: c, borderColor: t.color === c ? "var(--text)" : "transparent" }} />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm dl-muted">Numbers it records</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(FIELDS).map((f) => {
                      const on = t.fields.includes(f);
                      // Coros only computes an adjusted pace for running, so it
                      // is offered on whichever activity the running sport codes
                      // map to — and stays visible anywhere it is already ticked
                      if (f === "adjPace" && !on) {
                        const map = settings.corosMap || {};
                        const runs = [100, 101, 102, 103].some((c) =>
                          (map[c] !== undefined ? map[c] : COROS_MAP[c] && COROS_MAP[c].type) === t.id);
                        if (!runs) return null;
                      }
                      return (
                        <Chip key={f} small on={on}
                          onClick={() => editNode(t.id, [], (x) => ({ ...x, fields: on ? x.fields.filter((y) => y !== f) : [...x.fields, f] }))}>
                          {FIELDS[f].label}
                        </Chip>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm dl-muted">Numbers of your own</span>
                    <button className="dl-faint" onClick={() => editNode(t.id, [], (x) => ({ ...x, custom: [...(x.custom || []), { id: uid(), name: "New measure", unit: "" }] }))}>
                      <Plus size={16} />
                    </button>
                  </div>
                  {!(t.custom || []).length && <p className="text-xs dl-faint">Anything the list above doesn't cover.</p>}
                  {(t.custom || []).map((c, i) => (
                    <div key={c.id} className="mt-2 flex gap-2">
                      <input className={`${smallInput} flex-1`} value={c.name}
                        onChange={(e) => editNode(t.id, [], (x) => ({ ...x, custom: x.custom.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) }))} />
                      <input className={`${smallInput} w-20`} placeholder="unit" value={c.unit || ""}
                        onChange={(e) => editNode(t.id, [], (x) => ({ ...x, custom: x.custom.map((y, j) => (j === i ? { ...y, unit: e.target.value } : y)) }))} />
                      <button className="dl-faint" onClick={() => editNode(t.id, [], (x) => ({ ...x, custom: x.custom.filter((y, j) => j !== i) }))}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm dl-muted">Sliders it asks for</span>
                    <button className="dl-faint" onClick={() => editNode(t.id, [], (x) => ({ ...x, customSliders: [...(x.customSliders || []), { id: uid(), name: "New slider", hint: "" }] }))}>
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {BUILTIN_SLIDERS.map((b) => {
                      const on = (t.sliders || []).includes(b.key);
                      return (
                        <Chip key={b.key} small on={on}
                          onClick={() => editNode(t.id, [], (x) => ({ ...x, sliders: on ? (x.sliders || []).filter((y) => y !== b.key) : [...(x.sliders || []), b.key] }))}>
                          {b.short}
                        </Chip>
                      );
                    })}
                  </div>
                  {(t.customSliders || []).map((c, i) => (
                    <div key={c.id} className="mt-2 flex gap-2">
                      <input className={`${smallInput} flex-1`} value={c.name}
                        onChange={(e) => editNode(t.id, [], (x) => ({ ...x, customSliders: x.customSliders.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) }))} />
                      <input className={`${smallInput} w-28`} placeholder="low → high" value={c.hint || ""}
                        onChange={(e) => editNode(t.id, [], (x) => ({ ...x, customSliders: x.customSliders.map((y, j) => (j === i ? { ...y, hint: e.target.value } : y)) }))} />
                      <button className="dl-faint" onClick={() => editNode(t.id, [], (x) => ({ ...x, customSliders: x.customSliders.filter((y, j) => j !== i) }))}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm dl-muted">Tick boxes</span>
                    <button className="dl-faint" onClick={() => editNode(t.id, [], (x) => ({ ...x, boxes: [...(x.boxes || []), { id: uid(), name: "New box" }] }))}>
                      <Plus size={16} />
                    </button>
                  </div>
                  <p className="mb-2 text-xs dl-faint">Several can be ticked on one session — muscle groups, drills, whatever you want.</p>
                  {(t.boxes || []).map((b, i) => (
                    <div key={b.id} className="mt-2 flex gap-2">
                      <input className={`${smallInput} flex-1`} value={b.name}
                        onChange={(e) => editNode(t.id, [], (x) => ({ ...x, boxes: x.boxes.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) }))} />
                      <button className="dl-faint" onClick={() => editNode(t.id, [], (x) => ({ ...x, boxes: x.boxes.filter((y, j) => j !== i) }))}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm dl-muted">Formulas</span>
                    <button className="dl-faint" onClick={() => editNode(t.id, [], (x) => ({ ...x, formulas: [...(x.formulas || []), { id: uid(), name: "New", unit: "", expr: "" }] }))}>
                      <Plus size={16} />
                    </button>
                  </div>
                  <p className="mb-2 text-xs dl-faint">
                    An expression over this activity's own fields. Available: {(t.fields || []).join(", ") || "none yet"}
                    {(t.sliders || []).length ? `, ${(t.sliders || []).join(", ")}` : ""}. Example: distance + elevPos / 100
                  </p>
                  {(t.formulas || []).map((f, i) => (
                    <div key={f.id} className="mt-2 space-y-2">
                      <div className="flex gap-2">
                        <input className={`${smallInput} flex-1`} placeholder="name" value={f.name}
                          onChange={(e) => editNode(t.id, [], (x) => ({ ...x, formulas: x.formulas.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) }))} />
                        <input className={`${smallInput} w-20`} placeholder="unit" value={f.unit}
                          onChange={(e) => editNode(t.id, [], (x) => ({ ...x, formulas: x.formulas.map((y, j) => (j === i ? { ...y, unit: e.target.value } : y)) }))} />
                        <button className="dl-faint" onClick={() => editNode(t.id, [], (x) => ({ ...x, formulas: x.formulas.filter((y, j) => j !== i) }))}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <input className={`${smallInput} w-full`} placeholder="distance + elevPos / 100" value={f.expr}
                        onChange={(e) => editNode(t.id, [], (x) => ({ ...x, formulas: x.formulas.map((y, j) => (j === i ? { ...y, expr: e.target.value } : y)) }))} />
                      <FormulaCheck expr={f.expr} />
                    </div>
                  ))}
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm dl-muted">Subtypes</span>
                    <button onClick={() => addChild(t.id, [])} className="dl-faint"><Plus size={16} /></button>
                  </div>
                  <Branch rootId={t.id} nodes={t.children || []} path={[]} />
                </div>

                <button onClick={() => setConfirming(t.id)} className="text-sm" style={{ color: "#F2546B" }}>Delete this activity</button>
              </div>
            )}
          </div>
        ))}

        <button
          onClick={() => update({ types: [...data.types, { id: uid(), name: "New activity", color: PALETTE[data.types.length % PALETTE.length], fields: ["duration"], custom: [], sliders: [], customSliders: [], boxes: [], formulas: [], children: [] }] })}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed dl-line py-4 dl-muted">
          <Plus size={18} /> Add an activity
        </button>
      </Section>

      <Section title="Presets" hint={`${(data.templates || []).length} saved`}
        open={section === "presets"} onToggle={() => setSection(section === "presets" ? null : "presets")}>
        {!(data.templates || []).length && (
          <p className="text-xs dl-faint">Open a session on the calendar and use "Save as preset" to keep it here.</p>
        )}
        {(data.templates || []).map((tpl, i) => (
          <div key={tpl.id} className="flex items-center gap-2">
            <input className={`${smallInput} flex-1`} value={tpl.name}
              onChange={(e) => update({ templates: data.templates.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) })} />
            <button className="dl-faint" onClick={() => update({ templates: data.templates.filter((y, j) => j !== i) })}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </Section>

      <Section title="Units" hint="how values are shown"
        open={section === "units"} onToggle={() => setSection(section === "units" ? null : "units")}>
        <p className="mb-2 text-xs dl-faint">
          Display only. Values are stored in minutes, min/km and km/h whatever you pick here,
          and the logging form always takes the stored unit.
        </p>
        {Object.keys(UNIT_CHOICES).map((k) => (
          <div key={k} className="mb-2 flex items-center gap-2">
            <span className="flex-1 text-sm">{FIELDS[k] ? FIELDS[k].label : k}</span>
            <select className={smallInput} value={(settings.units || {})[k] || UNIT_CHOICES[k][0]}
              onChange={(e) => setSettings({ units: { ...(settings.units || {}), [k]: e.target.value } })}>
              {UNIT_CHOICES[k].map((u) => <option key={u} value={u}>{u === "both" ? "min and h" : u}</option>)}
            </select>
          </div>
        ))}
      </Section>

      <div className="mb-2 mt-5 px-1 text-xs uppercase tracking-wide dl-faint">Calendar & summary</div>
      <Section title="Summary options" hint="what appears there"
        open={section === "summary"} onToggle={() => setSection(section === "summary" ? null : "summary")}>
        <div>
          <div className="mb-2 text-sm dl-muted">Periods offered</div>
          <div className="flex flex-wrap gap-2">
            {RANGES.map((x) => {
              const on = (settings.ranges || []).includes(x.id);
              return (
                <Chip key={x.id} small on={on}
                  onClick={() => setSettings({ ranges: on ? settings.ranges.filter((y) => y !== x.id) : [...settings.ranges, x.id] })}>
                  {x.label}
                </Chip>
              );
            })}
          </div>
        </div>

        <p className="text-xs dl-faint">
          Which metrics exist, and in what order, is set in Variables &amp; sliders.
        </p>

        <div>
          <div className="mb-2 text-sm dl-muted">Panels shown</div>
          <div className="flex flex-wrap gap-2">
            <Chip small on={settings.showStats !== false} onClick={() => setSettings({ showStats: settings.showStats === false })}>
              Total / mean figures
            </Chip>
            <Chip small on={settings.showSubs !== false} onClick={() => setSettings({ showSubs: settings.showSubs === false })}>
              Subactivity filter
            </Chip>
            <Chip small on={settings.showDayTotals !== false} onClick={() => setSettings({ showDayTotals: settings.showDayTotals === false })}>
              Daily figure on calendar
            </Chip>
            <Chip small on={settings.showRatio !== false} onClick={() => setSettings({ showRatio: settings.showRatio === false })}>
              Recent vs habitual load
            </Chip>
          </div>
          <p className="mt-2 text-xs dl-faint">The first three apply to the calendar as well.</p>
        </div>
      </Section>

      <Section title="Variables & sliders" hint="order, muting, slider display"
        open={section === "vars"} onToggle={() => setSection(section === "vars" ? null : "vars")}>
        <div>
          <div className="mb-2 text-sm dl-muted">Order and muting</div>
          {(settings.fieldOrder || Object.keys(FIELDS)).map((k, i, arr) => {
            const off = (settings.fieldsOff || []).includes(k);
            return (
              <div key={k} className="mb-2 flex items-center gap-2">
                <span className="flex-1 text-sm" style={{ opacity: off ? 0.45 : 1 }}>{FIELDS[k].label}</span>
                <Chip small on={!off}
                  onClick={() => setSettings({ fieldsOff: off ? settings.fieldsOff.filter((x) => x !== k) : [...(settings.fieldsOff || []), k] })}>
                  {off ? "Muted" : "Shown"}
                </Chip>
                <button className="rounded-xl border dl-line px-3 py-2" disabled={i === 0}
                  onClick={() => { const a = [...arr]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setSettings({ fieldOrder: a }); }}>
                  <ChevronUp size={16} style={{ opacity: i === 0 ? 0.3 : 1 }} />
                </button>
                <button className="rounded-xl border dl-line px-3 py-2" disabled={i === arr.length - 1}
                  onClick={() => { const a = [...arr]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; setSettings({ fieldOrder: a }); }}>
                  <ChevronDown size={16} style={{ opacity: i === arr.length - 1 ? 0.3 : 1 }} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="border-t dl-line pt-3">
          <div className="mb-2 text-sm dl-muted">Sliders</div>
          {(() => {
            const all = allSliderKeys(data.types);
            const order = settings.sliderOrder || all.map((x) => x.key);
            const rows = [...order.map((k) => all.find((x) => x.key === k)).filter(Boolean),
                          ...all.filter((x) => !order.includes(x.key))];
            const keys = rows.map((x) => x.key);
            const reorder = (i, dir) => {
              const a = [...keys];
              const j = i + dir;
              if (j < 0 || j >= a.length) return;
              [a[i], a[j]] = [a[j], a[i]];
              setSettings({ sliderOrder: a });
            };
            return rows.map((row, i) => {
              const off = (settings.slidersOff || []).includes(row.key);
              return (
                <div key={row.key} className="mb-2 flex items-center gap-2">
                  <span className="flex-1 text-sm" style={{ opacity: off ? 0.45 : 1 }}>{row.label}</span>
                  <Chip small on={!off}
                    onClick={() => setSettings({ slidersOff: off ? settings.slidersOff.filter((x) => x !== row.key) : [...(settings.slidersOff || []), row.key] })}>
                    {off ? "Muted" : "Shown"}
                  </Chip>
                  <button className="rounded-xl border dl-line px-3 py-2" disabled={i === 0} onClick={() => reorder(i, -1)}>
                    <ChevronUp size={16} style={{ opacity: i === 0 ? 0.3 : 1 }} />
                  </button>
                  <button className="rounded-xl border dl-line px-3 py-2" disabled={i === rows.length - 1} onClick={() => reorder(i, 1)}>
                    <ChevronDown size={16} style={{ opacity: i === rows.length - 1 ? 0.3 : 1 }} />
                  </button>
                </div>
              );
            });
          })()}
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip small on={settings.sliderValues !== false} onClick={() => setSettings({ sliderValues: settings.sliderValues === false })}>
              Show the number
            </Chip>
            <Chip small on={settings.sliderHints === true} onClick={() => setSettings({ sliderHints: settings.sliderHints !== true })}>
              Show the description
            </Chip>
          </div>
        </div>
      </Section>

      <Section title="Visual settings"
        hint={`${theme(settings).label.toLowerCase()}, ${(FONTS[settings.font] || FONTS.system).label.toLowerCase()}`}
        open={section === "visual"} onToggle={() => setSection(section === "visual" ? null : "visual")}>
        <div>
          <div className="mb-2 text-sm dl-muted">Theme</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(THEMES).map(([k, v]) => (
              <Chip key={k} small on={settings.theme === k} onClick={() => setSettings({ theme: k })}>{v.label}</Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm dl-muted">Typeface</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(FONTS).map(([k, v]) => (
              <Chip key={k} small on={settings.font === k} onClick={() => setSettings({ font: k })}>{v.label}</Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm dl-muted">Calendar size</div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Chip small on={settings.calendarFixed !== false} onClick={() => setSettings({ calendarFixed: true })}>Fixed</Chip>
            <Chip small on={settings.calendarFixed === false} onClick={() => setSettings({ calendarFixed: false })}>Dynamic</Chip>
          </div>
          <div className="mb-2 text-sm dl-muted">Calendar height</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(DENSITY).map(([k, v]) => (
              <Chip key={k} small on={(settings.density || "comfortable") === k} onClick={() => setSettings({ density: k })}>{v.label}</Chip>
            ))}
          </div>
        </div>
        <p className="text-xs dl-faint">More themes and typefaces get added in one place: the THEMES and FONTS tables at the top of the file.</p>
      </Section>

      <div className="mb-2 mt-5 px-1 text-xs uppercase tracking-wide dl-faint">Data</div>
      <Section title="Coros import" hint="paste from the connector"
        open={section === "coros"} onToggle={() => setSection(section === "coros" ? null : "coros")}>
        <CorosImport data={data} update={update} />
      </Section>

      <Section title="Your data" hint="export & restore"
        open={section === "data"} onToggle={() => setSection(section === "data" ? null : "data")}>
        <Backup data={data} />
      </Section>
    </div>
  );
}

function FormulaCheck({ expr }) {
  if (!expr) return null;
  let msg = "";
  try {
    const probe = {};
    for (const k of Object.keys(FIELDS)) probe[k] = 1;
    for (const k of ALL_SLIDERS) probe[k] = 1;
    const r = math.evaluate(expr, probe);
    msg = Number.isFinite(r) ? "reads fine" : "does not return a number";
  } catch (e) {
    msg = "can't be read — check the field names";
  }
  return <div className="text-xs dl-faint">{msg}</div>;
}

function CorosImport({ data, update }) {
  const [paste, setPaste] = useState("");
  const [read, setRead] = useState(null);
  const [map, setMap] = useState({});
  const [done, setDone] = useState("");
  const [redo, setRedo] = useState(false);

  const doRead = () => {
    setDone("");
    const entries = parseCorosList(paste);
    const details = parseCorosDetail(paste);
    const merged = entries.map((e) => ({ ...e, values: { ...e.values } }));
    let matched = 0, orphan = 0;
    const unmapped = [];
    for (const d of details) {
      const hit = matchDetail(d, merged);
      if (!hit) { orphan++; continue; }
      matched++;
      Object.assign(hit.values, d.values);
      if (d.note) hit.note = d.note;
      hit.detail = d.raw;
      d.unmapped.forEach((u) => { if (!unmapped.includes(u)) unmapped.push(u); });
    }
    const codes = [];
    merged.forEach((e) => { if (!codes.includes(e.sportType)) codes.push(e.sportType); });
    const guess = {};
    codes.forEach((c) => {
      const saved = (data.settings?.corosMap || {})[c];
      guess[c] = saved !== undefined ? saved : (COROS_MAP[c] ? COROS_MAP[c].type : "");
    });
    setMap(guess);
    const known = new Set((data.sessions || []).map((s) => s.corosLabelId).filter(Boolean));
    setRead({
      entries: merged, codes, matched, orphan, unmapped,
      fresh: merged.filter((e) => !known.has(e.labelId)).length,
      again: merged.filter((e) => known.has(e.labelId)).length,
    });
  };

  const doImport = () => {
    const byId = {};
    (data.sessions || []).forEach((s) => { if (s.corosLabelId) byId[s.corosLabelId] = s; });
    const kept = [];
    let added = 0, updated = 0, skipped = 0;
    for (const e of read.entries) {
      const typeId = map[e.sportType];
      if (!typeId) { skipped++; continue; }
      const type = (data.types || []).find((t) => t.id === typeId);
      const subName = COROS_MAP[e.sportType] ? COROS_MAP[e.sportType].sub : null;
      // match loosely so a renamed "Trail running" still catches
      const child = subName && type
        ? (type.children || []).find((c) => {
            const a = (c.name || "").trim().toLowerCase(), b = subName.toLowerCase();
            return a === b || a.startsWith(b) || b.startsWith(a);
          })
        : null;
      const clean = {};
      Object.keys(e.values).forEach((k) => { if (!bad(e.values[k])) clean[k] = e.values[k]; });
      const old = byId[e.labelId];
      if (old && !redo) { skipped++; continue; }
      if (old) {
        updated++;
        // Coros owns its own fields; sliders, title, notes and boxes are yours
        kept.push({ ...old, date: e.date, values: { ...old.values, ...clean },
          note: old.note || e.note || "",
          coros: { raw: e.raw, detail: e.detail || (old.coros ? old.coros.detail : ""), at: todayISO() } });
      } else {
        added++;
        kept.push({
          id: uid(), date: e.date, typeId, path: child ? [child.id] : [],
          values: clean, custom: {}, sliders: {}, boxes: [],
          title: corosTitle(e.location), url: "", note: e.note || "",
          source: "coros", corosLabelId: e.labelId, corosSportType: e.sportType,
          coros: { raw: e.raw, detail: e.detail || "", at: todayISO() },
        });
      }
    }
    const untouched = (data.sessions || []).filter((s) => !s.corosLabelId || !kept.some((k) => k.corosLabelId === s.corosLabelId));
    update({ sessions: [...untouched, ...kept], settings: { ...data.settings, corosMap: map } });
    setDone(`${added} added, ${updated} updated${skipped ? `, ${skipped} left alone` : ""}.`);
    setRead(null);
    setPaste("");
  };

  return (
    <div className="space-y-3">
      <p className="text-xs dl-faint">
        Paste the Sport Records listing and any activity detail blocks together. Detail blocks
        are matched on time and distance, or on a <span className="tabular-nums">### labelId sportType</span> line if you add one.
      </p>
      <textarea className={`${inputCls} h-40 font-mono`} placeholder="Sport Records — …"
        value={paste} onChange={(e) => setPaste(e.target.value)} />
      <div>
        <div className="mb-1 text-xs dl-faint">Link pattern for the Open button — {"{id}"} and {"{sport}"} are filled in</div>
        <input type="text" className={smallInput + " w-full"} value={data.settings?.corosLink || COROS_LINK}
          onChange={(e) => update({ settings: { ...data.settings, corosLink: e.target.value } })} />
      </div>
      <div className="flex gap-2">
        <button onClick={doRead} disabled={!paste.trim()}
          className="flex-1 rounded-xl border dl-line py-3 text-sm">Read</button>
        {read && read.entries.length > 0 && (
          <button onClick={doImport} className="dl-accent flex-1 rounded-xl py-3 text-sm font-medium">
            Import {redo ? read.entries.length : read.fresh}
          </button>
        )}
      </div>
      {done && <div className="text-sm dl-muted">{done}</div>}
      {read && (
        <div className="space-y-2 text-sm">
          {read.again > 0 && (
            <label className="flex items-start gap-2 rounded-xl border dl-line p-3 text-sm">
              <input type="checkbox" className="mt-0.5" checked={redo} onChange={(e) => setRedo(e.target.checked)} />
              <span>
                Also refresh the {read.again} already in DayLoad
                <span className="block text-xs dl-faint">
                  overwrites their Coros numbers and subactivity; sliders, titles and notes are kept
                </span>
              </span>
            </label>
          )}
          <div className="dl-muted">
            {read.entries.length} activities · {read.fresh} new · {read.again} already here ·
            {" "}{read.matched} with detail{read.orphan ? ` · ${read.orphan} detail block(s) unmatched` : ""}
          </div>
          {read.codes.map((c) => (
            <div key={c} className="flex items-center gap-2">
              <span className="dl-faint w-28 text-xs">Coros {c}</span>
              <select className={`${smallInput} flex-1`} value={map[c] || ""}
                onChange={(e) => setMap({ ...map, [c]: e.target.value })}>
                <option value="">skip</option>
                {(data.types || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          ))}
          {read.unmapped.length > 0 && (
            <div className="text-xs dl-faint">Not mapped to a variable: {read.unmapped.join(", ")}</div>
          )}
        </div>
      )}
    </div>
  );
}

function Backup({ data }) {
  const [copied, setCopied] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [paste, setPaste] = useState("");
  const json = JSON.stringify(data, null, 2);

  const download = () => {
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `DayLoad-${todayISO()}.json`;
    a.click();
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(json); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (e) { setCopied(false); }
  };

  const reset = async () => {
    if (!window.confirm("Clear this Lab and start again from the default activities?")) return;
    await store.save(seed());
    window.location.reload();
  };

  const doImport = async () => {
    try {
      const parsed = JSON.parse(paste);
      if (!parsed.types) throw new Error("bad");
      await store.save(parsed);
      window.location.reload();
    } catch (e) {
      alert("That text isn't a DayLoad backup. Paste the whole file, from the first { to the last }.");
    }
  };

  return (
    <div>
      <p className="mb-3 text-xs dl-faint">Everything stays on this device. Export a copy you control.</p>
      <div className="flex flex-wrap gap-2">
        <button onClick={download} className="flex items-center gap-2 rounded-xl border dl-line px-3 py-2 text-sm dl-muted">
          <Download size={14} /> Export file
        </button>
        <button onClick={copy} className="flex items-center gap-2 rounded-xl border dl-line px-3 py-2 text-sm dl-muted">
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy backup"}
        </button>
        <button onClick={() => setShowImport(!showImport)} className="flex items-center gap-2 rounded-xl border dl-line px-3 py-2 text-sm dl-muted">
          <Upload size={14} /> Restore
        </button>
        <button onClick={reset} className="flex items-center gap-2 rounded-xl border dl-line px-3 py-2 text-sm" style={{ color: "#F2546B" }}>
          <Trash2 size={14} /> Start again
        </button>
      </div>
      {showImport && (
        <div className="mt-3">
          <textarea rows={4} className={inputCls} placeholder="Paste a backup here" value={paste} onChange={(e) => setPaste(e.target.value)} />
          <button onClick={doImport} className="dl-accent mt-2 rounded-xl px-4 py-2 text-sm font-medium">Replace everything with this</button>
        </div>
      )}
    </div>
  );
}
