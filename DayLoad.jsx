import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ComposedChart, Line } from "recharts";
import * as math from "mathjs";
import {
  Plus, Trash2, Pencil, Download, Upload, Copy, Check, X, Search,
  ChevronRight, ChevronDown, ChevronLeft, ChevronUp, Link as LinkIcon,
  CalendarDays, BarChart3, Settings2, Save, Star, CopyPlus, Bookmark, Share2,
  NotebookPen, NotebookText, Mountain, Pin, Archive, BookOpen,
  SquareCheck, List, Heading, Bold, ImagePlus, PenTool, Eraser, Undo2,
  Paperclip, ChevronsUpDown, ChevronsDownUp,
} from "lucide-react";

import { store, subscribe as onSync, syncStatus } from "./storage.js";
import { nowISO, SCHEMA } from "./merge.js";
import * as gh from "./github.js";
import { isConnected, connect, disconnect, sync as corosSync } from "./coros.js";
import { addPhoto, photoURL, originalURL, originalPending, onPending, flushPending } from "./photos.js";

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

/* One dominant hue, stepped surfaces, and a single accent from a
   distant part of the wheel. `mode` drives the native widgets (date
   pickers, scrollbars); everything else is these tokens. Adding a
   theme is adding one row. */
const THEMES = {
  dark:   { label: "Dark",   mode: "dark",  palette: "soft", bg: "#000000", surface: "#0B0B0B", field: "#000000", line: "#262626", text: "#FFFFFF", muted: "#B4B4B4", faint: "#7A7A7A", accentBg: "#FFFFFF", accentText: "#000000", grid: "#1C1C1C" },
  light:  { label: "Light",  mode: "light", palette: "soft", bg: "#FFFFFF", surface: "#F6F6F4", field: "#FFFFFF", line: "#E3E3DE", text: "#141414", muted: "#4B4B4B", faint: "#8A8A85", accentBg: "#141414", accentText: "#FFFFFF", grid: "#EAEAE6" },

  /* black, acid-lime sun */
  midnight:    { label: "Midnight",    mode: "dark", palette: "neon", bg: "#07070B", surface: "#101019", field: "#07070B", line: "#26263A", text: "#F2F2FF", muted: "#A9A9C4", faint: "#6E6E8C", accentBg: "#C2F53C", accentText: "#0A0A0F", grid: "#1A1A2A" },

  /* black and green, pink sun */
  eclipse:     { label: "Eclipse",     mode: "dark", palette: "neon", bg: "#05080A", surface: "#0D1614", field: "#05080A", line: "#1E2E28", text: "#EAF6F0", muted: "#9FB8AE", faint: "#6B8279", accentBg: "#FF3D6B", accentText: "#FFFFFF", grid: "#142220" },

  /* violet and mint */
  ultraviolet: { label: "Ultraviolet", mode: "dark", palette: "neon", bg: "#150B2E", surface: "#1F1142", field: "#150B2E", line: "#33205E", text: "#F3EDFF", muted: "#B9A6E0", faint: "#8470B5", accentBg: "#14E3B2", accentText: "#0B1F1A", grid: "#281652" },

  /* violet-blue and coral */
  cobalt:      { label: "Cobalt",      mode: "dark", palette: "neon", bg: "#090C2A", surface: "#121640", field: "#090C2A", line: "#22285E", text: "#EDF0FF", muted: "#A8B0E0", faint: "#757DB0", accentBg: "#FF4D5E", accentText: "#FFFFFF", grid: "#171C4A" },

  /* the pale ones keep the same accents, against paper */
  emerald:     { label: "Emerald",     mode: "light", palette: "soft", bg: "#F5F2EC", surface: "#FFFFFF", field: "#FFFFFF", line: "#E2DED4", text: "#101613", muted: "#4A5750", faint: "#8A9189", accentBg: "#00A862", accentText: "#FFFFFF", grid: "#E8E4DA" },
  orchid:      { label: "Orchid",      mode: "light", palette: "neon", bg: "#F6F3EF", surface: "#FFFFFF", field: "#FFFFFF", line: "#E4DEE8", text: "#160F1E", muted: "#514860", faint: "#8C8399", accentBg: "#6D28F5", accentText: "#FFFFFF", grid: "#EBE5F0" },
};

const FONTS = {
  /* Helvetica is installed on macOS and iOS; Windows falls through to
     Arial and Android to Roboto, which are close enough that the layout
     does not move. */
  helvetica:{ label: "Helvetica", stack: "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif" },
  system:   { label: "Neutral",  stack: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
  serif:    { label: "Serif",    stack: "ui-serif, Georgia, Cambria, Times New Roman, serif" },
  mono:     { label: "Mono",     stack: "ui-monospace, SFMono-Regular, Menlo, monospace" },

  /* Fetched from Google Fonts, and only the selected one is fetched.
     Every stack keeps a real fallback, so a blocked or offline request
     degrades to a system face instead of to Times New Roman. */
  grotesk:  { label: "Grotesk",  google: "Space+Grotesk:wght@400;500;700", stack: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif" },
  chakra:   { label: "Chakra",   google: "Chakra+Petch:wght@400;500;700",  stack: "'Chakra Petch', ui-sans-serif, system-ui, sans-serif" },
  /* Nothing's own Ndot is licensed for Nothing's brand materials only —
     it cannot be embedded here. This is the nearest open dot-matrix face. */
  dot:      { label: "Dot",      google: "DotGothic16",                    stack: "'DotGothic16', ui-sans-serif, system-ui, sans-serif" },
};

const DENSITY = {
  comfortable: { label: "Comfortable", col: 200 },
  compact:     { label: "Compact",     col: 140 },
};

const theme = (settings) => THEMES[settings?.theme] || THEMES.dark;


/* ================================================================== */
/* the mark                                                           */
/* ================================================================== */

/* Three shapes, six colourways. One function builds an SVG string,
   which is used both for the previews and for the favicon — drawing it
   twice would guarantee the two drift apart.

   Note this does NOT change the installed home-screen icon. Android
   reads that from the manifest at install time and iOS never revisits
   it. That one is frozen in public/ and chosen once. */

const SKINS = {
  emerald:  { label: "Emerald",        sky: "#00A362", tints: ["#4FC79A", "#93DCC0", "#FFFFFF"], sun: "#FF3D77" },
  forest:   { label: "Black & green",  sky: "#101010", tints: ["#0E7A4E", "#22C07E", "#8DF0C2"], sun: "#FF3D6B" },
  neon:     { label: "Black & violet", sky: "#101010", tints: ["#4B32C9", "#7B5BF0", "#B9A6F5"], sun: "#C2F53C" },
  violet:   { label: "Violet & mint",  sky: "#7B2BF5", tints: ["#9A6BFF", "#C4A6FF", "#FFFFFF"], sun: "#14E3B2" },
  indigo:   { label: "Violet-blue",    sky: "#3B35F5", tints: ["#6E6BFF", "#A7A4FF", "#FFFFFF"], sun: "#FF4D5E" },
  azure:    { label: "Blue & yellow",  sky: "#1E5BF5", tints: ["#6E9BFF", "#B0C8FF", "#FFFFFF"], sun: "#FFC93C" },
  azurered: { label: "Blue & red",     sky: "#1E5BF5", tints: ["#6E9BFF", "#B0C8FF", "#FFFFFF"], sun: "#FF3D5E" },
};

/* Traced off the reference artwork, then reduced to the corner points
   the artwork actually has, so every segment between vertices is dead
   straight — the originals contain no curves except the sun. Sun
   position and radius are measured per model and differ; it sits left
   on the full bleed, where the ridge climbs into the right corner. */
const LOGO_TYPES = {
  bleed: {
    label: "Full bleed", sun: [24, 24, 8.8],
    draw: (k) => `
      <polygon points="0,62.7 17,58.7 33.3,63.7 50,51.3 66.3,55.3 83,42 100,41 100,100 0,100" fill="${k.tints[0]}"/>
      <polygon points="0,81.7 16.3,74 33.3,80 49.7,63.3 66.7,70.3 83,54 100,56.3 100,100 0,100" fill="${k.tints[1]}"/>
      <polygon points="0,93.3 16.7,86 33.3,95 50,73.7 66.7,87.7 83.3,66.7 100,75 100,100 0,100" fill="${k.tints[2]}"/>`,
  },
  two: {
    label: "Two peaks", sun: [72, 28, 7.7],
    draw: (k) => `
      <polygon points="22,68.3 34,47 43.7,56.3 58,37.7 78,69.7 78,75 22,75" fill="${k.tints[0]}"/>
      <polygon points="20,74 30.7,60.7 42,67 56,51.3 79,74 79,75 20,75" fill="${k.tints[2]}" stroke="${k.sky}" stroke-width="1.5" stroke-linejoin="miter"/>`,
  },
  three: {
    label: "Three peaks", sun: [72, 29, 6.8],
    draw: (k) => `
      <polygon points="20.3,71.3 34,47 43.7,56.3 58,37.7 79.7,72.3 79.7,75 20.3,75" fill="${k.tints[0]}"/>
      <polygon points="19.7,73.3 30.7,59.7 42,66 56,50.3 77.3,71.3 77.3,75 19.7,75" fill="${k.tints[1]}"/>
      <polygon points="20.3,74.3 32.3,67.7 43.7,71.7 59.3,59.7 80,74.3 80,75 20.3,75" fill="${k.tints[2]}"/>`,
  },
};

/* which colourway a theme implies, when the setting is left on auto */
const THEME_SKIN = {
  dark: "neon", light: "emerald", midnight: "neon", eclipse: "forest",
  ultraviolet: "violet", cobalt: "indigo", emerald: "emerald", orchid: "violet",
};

const skinName = (settings) => {
  const want = settings?.logoSkin || "auto";
  if (want !== "auto" && SKINS[want]) return want;
  return THEME_SKIN[settings?.theme] || "mono";
};

const logoType = (settings) => (LOGO_TYPES[settings?.logo] ? settings.logo : "bleed");

function logoSVG(settings, { rounded = true } = {}) {
  const k = SKINS[skinName(settings)];
  const t = LOGO_TYPES[logoType(settings)];
  const clip = rounded ? `<clipPath id="r"><rect width="100" height="100" rx="22"/></clipPath>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <defs>${clip}</defs>
    <g ${rounded ? 'clip-path="url(#r)"' : ""}>
      <rect width="100" height="100" fill="${k.sky}"/>
      ${t.draw(k)}
      <circle cx="${t.sun[0]}" cy="${t.sun[1]}" r="${t.sun[2]}" fill="${k.sun}"/>
    </g>
  </svg>`;
}

const logoURI = (settings) =>
  `data:image/svg+xml,${encodeURIComponent(logoSVG(settings).replace(/\s+/g, " "))}`;

function Logo({ settings, size = 40 }) {
  return <img src={logoURI(settings)} width={size} height={size} alt="" className="rounded-xl" />;
}

/* Point the page at the chosen icon: the tab favicon and the iOS touch
   icon immediately, and the manifest, which is what Android installs
   from. There is one prebuilt manifest per combination in public/icons,
   each naming its own PNGs — the installed icon cannot be generated in
   the browser, because Google's servers fetch it themselves.

   Android rebuilds an installed app from the manifest roughly daily, so
   a change here reaches the home screen within a day or two rather than
   at once. Reinstalling applies it immediately. iOS never revisits it. */
function Favicon({ settings }) {
  useEffect(() => {
    const key = `${logoType(settings)}-${skinName(settings)}`;
    const dir = `${import.meta.env.BASE_URL}icons/${key}`;

    const set = (selector, make, attrs) => {
      let el = document.querySelector(selector);
      if (!el) { el = make(); document.head.appendChild(el); }
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      return el;
    };

    set("link[rel='icon']", () => Object.assign(document.createElement("link"), { rel: "icon" }),
        { type: "image/svg+xml", href: logoURI(settings) });

    set("link[rel='apple-touch-icon']", () => Object.assign(document.createElement("link"), { rel: "apple-touch-icon" }),
        { href: `${dir}/icon-192.png` });

    set("link[rel='manifest']", () => Object.assign(document.createElement("link"), { rel: "manifest" }),
        { href: `${dir}/manifest.webmanifest` });

    // The system bars follow this. It tracks the app theme, not the icon:
    // the icon is a mark, the theme is the surface the app is drawn on,
    // and having the navigation bar pick up the icon's colour made the
    // app look like it was wearing someone else's trousers.
    set("meta[name='theme-color']", () => Object.assign(document.createElement("meta"), { name: "theme-color" }),
        { content: theme(settings).bg });
  }, [settings?.logo, settings?.logoSkin, settings?.theme]);
  return null;
}

function ThemeStyle({ settings }) {
  const t = theme(settings);
  activePalette = paletteName(settings);
  const f = FONTS[settings?.font] || FONTS.system;
  const css = `${f.google ? `@import url('https://fonts.googleapis.com/css2?family=${f.google}&display=swap');` : ""}
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
.dl-root input[type=date]{color-scheme:${t.mode || "dark"};}
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
  font: "helvetica",
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
  return { ...d, version: Math.max(d.version || 0, SCHEMA), settings, types, sessions, templates: d.templates || [],
           notebooks: d.notebooks || [], entries: d.entries || [] };
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
  return root ? shade(root.color) : "#888";
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

/* A slider is a 0-10 rating, so averaging it is the safe default: summed
   Quality would only reward doing more sessions. But some sliders are a
   burden rather than a level — niggle above all — and for those the
   total over a week is the number that means something, and the one you
   can compare with last week. So it is a per-slider choice. */
const aggOf = (id, settings) => ((settings?.sliderAgg || {})[id] === "sum" ? "sum" : "level");

function withAgg(m, settings) {
  return m.kind === "level" && aggOf(m.id, settings) === "sum" ? { ...m, kind: "sum" } : m;
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
    ...head, ...fieldMetrics, ...rest.map((m) => withAgg(m, settings)),
    ...formulaNames.map((n) => ({ id: `fx:${n}`, label: n, kind: "sum", unit: "" })),
    ...sliderNames
      .map((n) => withAgg({ id: `cs:${n}`, label: n, kind: "level", unit: "" }, settings))
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

/* A collapsible group inside a Section. It keeps its own open state
   rather than routing through Parameters: these are small preferences,
   and only one top-level Section is ever open anyway. */
function SubSection({ title, hint, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border dl-line">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        <span className="flex-1 text-sm dl-muted">{title}</span>
        {hint ? <span className="text-xs dl-faint">{hint}</span> : null}
        {open ? <ChevronDown size={14} className="dl-faint" /> : <ChevronRight size={14} className="dl-faint" />}
      </button>
      {open && <div className="space-y-3 border-t dl-line p-3">{children}</div>}
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
  const [nbOpen, setNbOpen] = useState(null);     // notebook shown in the Notebooks tab
  const [nbFocus, setNbFocus] = useState(null);   // entry to scroll to and outline
  const [entrySheet, setEntrySheet] = useState(null);
  const [calFocus, setCalFocus] = useState(null); // session to show when jumping back to the calendar

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

  // every whole-object change carries a stamp, so the merge between two
  // devices can tell which copy is newer
  const update = (patch) => setData((d) => {
    const stamps = { ...(d.stamps || {}) };
    for (const k of ["settings", "types", "templates"]) {
      if (k in patch) stamps[k] = nowISO();
    }
    return { ...d, ...patch, stamps };
  });

  const saveSession = (raw) => {
    const s = { ...raw, updatedAt: nowISO() };
    setData((d) => {
      const exists = d.sessions.some((x) => x.id === s.id);
      const sessions = exists ? d.sessions.map((x) => (x.id === s.id ? s : x)) : [...d.sessions, s];
      sessions.sort((a, b) => (a.date < b.date ? 1 : -1));
      return { ...d, sessions };
    });
    setSheet(null);
  };

  // a delete has to be recorded, not just applied: another device holding
  // an older copy would otherwise put the session back on the next merge
  const deleteSession = (id) =>
    setData((d) => ({
      ...d,
      sessions: d.sessions.filter((x) => x.id !== id),
      graveyard: [...(d.graveyard || []).filter((g) => g.id !== id), { id, at: nowISO() }],
    }));

  const addTemplate = (s) =>
    setData((d) => ({
      ...d,
      templates: [...(d.templates || []), {
        id: uid(), name: s.title || labelFor(d.types, s), typeId: s.typeId, path: s.path,
        values: s.values, custom: s.custom, sliders: s.sliders, boxes: s.boxes, title: s.title || "",
      }],
    }));

  const toggleFav = (id) =>
    setData((d) => ({ ...d, sessions: d.sessions.map((x) => (x.id === id ? { ...x, fav: !x.fav, updatedAt: nowISO() } : x)) }));

  /* ---- notebooks: same rules as sessions, stamped and tombstoned ---- */
  const upsert = (list, x) => (list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [...list, x]);

  const saveNotebook = (raw) =>
    setData((d) => ({ ...d, notebooks: upsert(d.notebooks || [], { ...raw, updatedAt: nowISO() }) }));

  // a notebook takes its entries with it, and every one of them needs its own tombstone
  const deleteNotebook = (id) => setData((d) => {
    const t = nowISO();
    const gone = (d.entries || []).filter((e) => e.notebookId === id).map((e) => e.id);
    const dead = new Set([id, ...gone]);
    return {
      ...d,
      notebooks: (d.notebooks || []).filter((n) => n.id !== id),
      entries: (d.entries || []).filter((e) => e.notebookId !== id),
      graveyard: [...(d.graveyard || []).filter((g) => !dead.has(g.id)), ...[...dead].map((x) => ({ id: x, at: t }))],
    };
  });

  const saveEntry = (raw) => {
    const e = { ...raw, updatedAt: nowISO() };
    setData((d) => ({ ...d, entries: upsert(d.entries || [], e) }));
    return e;
  };

  const deleteEntry = (id) =>
    setData((d) => ({
      ...d,
      entries: (d.entries || []).filter((e) => e.id !== id),
      graveyard: [...(d.graveyard || []).filter((g) => g.id !== id), { id, at: nowISO() }],
    }));

  const openNotebook = (id, entryId = null) => { setNbOpen(id); setNbFocus(entryId); };

  // the notebook written in most recently is the likeliest one to write in next
  const likelyNotebook = (date) => {
    const open = (data.notebooks || []).filter((n) => n.kind !== "page" && !n.archived);
    const trip = open.find((n) => n.kind === "trip" && n.from && n.to && date >= n.from && date <= n.to);
    if (trip) return trip.id;
    const byUse = [...open].sort((a, b) => {
      const la = (data.entries || []).filter((e) => e.notebookId === a.id).reduce((m, e) => (e.updatedAt > m ? e.updatedAt : m), a.updatedAt || "");
      const lb = (data.entries || []).filter((e) => e.notebookId === b.id).reduce((m, e) => (e.updatedAt > m ? e.updatedAt : m), b.updatedAt || "");
      return lb > la ? 1 : -1;
    });
    return byUse[0] ? byUse[0].id : null;
  };

  const writeEntry = (notebookId, preset = {}) => setEntrySheet({
    isNew: true,
    entry: { id: uid(), notebookId, date: todayISO(), title: "", body: "", value: null, sessionIds: [], createdAt: nowISO(), ...preset },
  });

  const pages = [
    { id: "calendar", label: "Calendar", icon: CalendarDays },
    { id: "summary", label: "Summary", icon: BarChart3 },
    { id: "notebooks", label: "Notebooks", icon: BookOpen },
    { id: "params", label: "Parameters", icon: Settings2 },
  ];

  return (
    <div className="dl-root dl-bg dl-text min-h-screen pb-24">
      <ThemeStyle settings={data.settings} />
      <Favicon settings={data.settings} />

      <main className="mx-auto max-w-2xl px-3 py-3">
        {page === "calendar" && (
          <Calendar data={data} onAdd={(date) => setSheet({ date })}
            onOpen={(s) => setSheet({ session: s })} onDelete={deleteSession} onFav={toggleFav}
            onDuplicate={(s) => setSheet({ session: { ...s, id: uid(), date: todayISO(), fav: false, _dup: true } })}
            onTemplate={addTemplate}
            focus={calFocus} onFocused={() => setCalFocus(null)}
            onWrite={(s) => writeEntry(likelyNotebook(s.date), { date: s.date, sessionIds: [s.id] })}
            onOpenEntry={(e) => { openNotebook(e.notebookId, e.id || null); setPage("notebooks"); }} />
        )}
        {page === "summary" && <Summary data={data} />}
        {page === "notebooks" && (
          <Notebooks data={data} openId={nbOpen} setOpenId={openNotebook} focus={nbFocus}
            onSaveNotebook={saveNotebook} onDeleteNotebook={deleteNotebook}
            onWrite={writeEntry} onSaveEntry={saveEntry}
            onEditEntry={(e) => setEntrySheet({ isNew: false, entry: e })}
            onJump={(s) => { setCalFocus({ id: s.id, date: s.date }); setPage("calendar"); }} />
        )}
        {page === "params" && <Parameters data={data} update={update} />}
      </main>

      <nav className="dl-bg fixed inset-x-0 bottom-0 border-t dl-line">
        <div className="mx-auto flex max-w-2xl">
          {pages.map((p) => {
            const Icon = p.icon;
            const on = page === p.id;
            return (
              <button key={p.id} onClick={() => { if (p.id === "notebooks" && page === "notebooks") openNotebook(null); setPage(p.id); }}
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

      {entrySheet && (
        <EntrySheet data={data} initial={entrySheet.entry} isNew={entrySheet.isNew}
          onClose={() => setEntrySheet(null)}
          onSave={(e) => { saveEntry(e); setEntrySheet(null); openNotebook(e.notebookId, e.id); setPage("notebooks"); }}
          onDelete={(id) => { deleteEntry(id); setEntrySheet(null); }} />
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
      out.push({ typeId: type.id, key, label: [...names, n.name].join(" › "), color: shade(type.color) });
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
              <Chip key={t.id} small on={isOn(t.id)} color={shade(t.color)} onClick={() => toggleType(t.id)}>{t.name}</Chip>
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

function Calendar({ data, onAdd, onOpen, onDelete, onFav, onDuplicate, onTemplate, focus, onFocused, onWrite, onOpenEntry }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [metric, setMetric] = useState("activity");
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [picked, setPicked] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  // arriving from a notebook: show that session's week, with it open
  useEffect(() => {
    if (!focus) return;
    setWeekStart(startOfWeek(parseISO(focus.date)));
    setPicked(focus.id);
    onFocused && onFocused();
  }, [focus]);

  // days something was written about get a dot under their date
  const written = useMemo(() => new Set((data.entries || []).map((e) => e.date)), [data.entries]);

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
                <span className="mt-0.5 h-1 w-1 rounded-full" style={{ background: written.has(d) ? "var(--muted)" : "transparent" }} />
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
              </div>

              {/* what you felt is not what the watch measured: keeping them in
                  one grid made an RPE read like a distance */}
              {(() => {
                const rows = slidersOf(root, data.settings, false)
                  .filter((f) => s.sliders?.[f.key] !== null && s.sliders?.[f.key] !== undefined);
                if (!rows.length) return null;
                return (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t dl-line pt-3">
                    {rows.map((f) => {
                      const v = s.sliders[f.key];
                      const hurt = f.key === "injury" && v > 0;
                      return (
                        <span key={f.key}
                          className="inline-flex items-baseline gap-1 rounded-full border dl-line px-2 py-1 text-xs"
                          style={hurt ? { borderColor: "#F2546B", color: "#F2546B" } : undefined}>
                          <span className={hurt ? "" : "dl-faint"}>{f.short || f.label}</span>
                          <span className="tabular-nums font-medium">{v.toFixed(1)}</span>
                        </span>
                      );
                    })}
                  </div>
                );
              })()}

              {(s.boxes || []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {(s.boxes || []).map((id) => {
                    const b = (root?.boxes || []).find((x) => x.id === id);
                    return b ? <span key={id} className="rounded-full border dl-line px-2 py-1 text-xs dl-muted">{b.name}</span> : null;
                  })}
                </div>
              )}

              {s.note && <Note text={s.note} />}
              <SessionNotes data={data} s={s} onWrite={onWrite} onOpenEntry={onOpenEntry} />
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

      <History data={data} filter={filter} onOpenEntry={onOpenEntry}
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

function History({ data, filter, onPick, onOpenEntry }) {
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

  // words also find what you wrote in notebooks; conditions only apply to sessions
  const noteHits = useMemo(() => {
    const needle = text.trim().toLowerCase();
    if (!open || !needle || conds.length) return [];
    const nbs = data.notebooks || [];
    const hits = (data.entries || [])
      .filter((e) => `${e.title || ""}\n${e.body || ""}`.toLowerCase().includes(needle))
      .map((e) => ({ e, nb: nbs.find((n) => n.id === e.notebookId) }))
      .filter((h) => h.nb);
    const pages = nbs.filter((n) => `${n.name}\n${n.body || ""}`.toLowerCase().includes(needle)).map((nb) => ({ nb }));
    return [...pages, ...hits].slice(0, 20);
  }, [open, data.entries, data.notebooks, text, conds.length]);

  const setCond = (i, patch) => setConds((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <Section title="History" hint={open ? `${results.length + noteHits.length} shown` : "search"} open={open} onToggle={() => setOpen(!open)}>
      <div className="flex items-center gap-2">
        <Search size={16} className="dl-faint" />
        <input type="text" className={`${smallInput} flex-1`} placeholder="search sessions and notebooks"
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

      {noteHits.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs dl-faint">In your notebooks</div>
          {noteHits.map((h) => (
            <button key={h.e ? h.e.id : h.nb.id} onClick={() => onOpenEntry && onOpenEntry(h.e || { notebookId: h.nb.id })}
              className="flex w-full items-center gap-3 rounded-xl border dl-line px-3 py-2 text-left">
              <NotebookText size={16} className="shrink-0" style={{ color: shade(h.nb.color) }} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs dl-faint">{h.nb.name}{h.e ? ` · ${fmtDay(h.e.date)}` : ""}</span>
                <span className="block truncate text-sm">{h.e ? firstLine(h.e) : "Notes"}</span>
              </span>
              <ChevronRight size={14} className="dl-faint" />
            </button>
          ))}
          {results.length > 0 && <div className="pt-2 text-xs dl-faint">Sessions</div>}
        </div>
      )}

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
        {open && !results.length && !noteHits.length && <p className="text-sm dl-faint">Nothing matches.</p>}
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
  const color = root ? shade(root.color) : "var(--text)";
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
                    <Chip key={tpl.id} small color={shade(t?.color)}
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
                <Chip key={t.id} on={s.typeId === t.id} color={shade(t.color)}
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
        const w = met.kind === "avg" ? weightFor(s, met) : 1;
        // overall, and again per activity — an average cannot be stacked
        // (the total would mean nothing) but it can be shown side by side
        acc[k] = acc[k] || { n: 0, t: 0, by: {} };
        acc[k].n += w; acc[k].t += v * w;
        const lane = s.typeId;
        acc[k].by[lane] = acc[k].by[lane] || { n: 0, t: 0 };
        acc[k].by[lane].n += w; acc[k].by[lane].t += v * w;
      }
    }
    if (!stacked) out.forEach((x) => {
      const a = acc[x.key];
      x.avg = a && a.n ? round(a.t / a.n, 2) : null;
      if (a) for (const [lane, p] of Object.entries(a.by)) {
        if (p.n) x[`avg:${lane}`] = round(p.t / p.n, 2);
      }
    });
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
                    : shownTypes.map((t) => <Bar key={t.id} dataKey={t.id} stackId="a" fill={shade(t.color)} name={t.name} />))
                : (filter.merge
                    ? <Bar dataKey="avg" fill={th.text} name={`${met.label} (average)`} />
                    // side by side, not stacked: each bar is that activity's
                    // own average, and the heights are directly comparable
                    : shownTypes.map((t) => (
                        <Bar key={t.id} dataKey={`avg:${t.id}`} fill={shade(t.color)} name={t.name} />
                      )))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        {!stacked && (
          <p className="mt-2 text-xs dl-faint">
            {filter.merge
              ? "Average across the sessions in each bar."
              : "Average per activity. Bars sit side by side rather than stacked, because averages do not add up — use Merged for one figure per period."}
          </p>
        )}
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

/* Two sets to pick activity colours from. Switching set only changes
   what the picker offers: a colour already given to an activity lives
   on that activity and is never rewritten. */
const PALETTES = {
  soft: {
    label: "Soft",
    colors: [
      "#FF5C5C", "#FF6B3D", "#F2A23C", "#F2C230", "#C9D14A", "#9BCB5B", "#4ED9B4",
      "#35C3D6", "#3FA9E0", "#6C8BE0", "#B57BE0", "#E07BC8", "#F2546B", "#D4D4D4",
    ],
  },
  neon: {
    label: "Neon",
    colors: [
      "#FF2D6F", "#FF4D3D", "#FF8A00", "#FFC400", "#C2F53C", "#4BE37A", "#00D68F",
      "#14E3B2", "#00C2FF", "#3B35F5", "#6D28F5", "#B14DFF", "#FF2D9B", "#8E97A8",
    ],
  },
};

/* "auto" means the theme decides, which is what makes switching to
   Midnight turn every pastel into its neon counterpart. */
const paletteName = (settings) => {
  const want = settings?.palette || "auto";
  if (want !== "auto" && PALETTES[want]) return want;
  return (THEMES[settings?.theme] || THEMES.dark).palette || "soft";
};

const paletteOf = (settings) => PALETTES[paletteName(settings)].colors;

/* An activity stores the hex it was given. Rather than rewrite stored
   colours when the theme changes — which would be destructive and
   irreversible — we translate at render time: find the colour's slot in
   whichever palette it came from, and return the same slot in the
   active one. A colour that belongs to no palette (picked by hand, or
   arriving from Coros) passes through untouched.

   activePalette is module state set by ThemeStyle, which renders before
   its siblings. The alternative was threading settings through a dozen
   components that only need it to tint a dot. */
let activePalette = "soft";

const SLOT = (() => {
  const m = new Map();
  for (const [name, p] of Object.entries(PALETTES)) {
    p.colors.forEach((hex, i) => m.set(hex.toUpperCase(), i));
  }
  return m;
})();

function shade(hex) {
  if (!hex) return hex;
  const i = SLOT.get(String(hex).toUpperCase());
  if (i === undefined) return hex;
  const cols = PALETTES[activePalette].colors;
  return cols[i] || hex;
}

// for anywhere a default colour is needed with no settings to hand
const PALETTE = PALETTES.soft.colors;

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
              borderLeftColor: shade(t.color), borderLeftWidth: 4,
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
                  <span className="h-3 w-3 rounded-full" style={{ background: shade(t.color) }} />
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
                <span className="h-3 w-3 rounded-full" style={{ background: shade(t.color) }} />
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
                    {paletteOf(settings).map((c) => (
                      <button key={c} onClick={() => editNode(t.id, [], (x) => ({ ...x, color: c }))}
                        className="h-8 w-8 rounded-full border-2"
                        style={{ background: c, borderColor: shade(t.color) === shade(c) ? "var(--text)" : "transparent" }} />
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
          onClick={() => update({ types: [...data.types, { id: uid(), name: "New activity", color: paletteOf(settings)[data.types.length % paletteOf(settings).length], fields: ["duration"], custom: [], sliders: [], customSliders: [], boxes: [], formulas: [], children: [] }] })}
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
        <SubSection title="Periods offered" hint={`${(settings.ranges || []).length} on`}>
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
        </SubSection>

        <SubSection title="Panels shown">
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
        </SubSection>

        <p className="text-xs dl-faint">
          Which metrics exist, and in what order, is set in Variables &amp; sliders.
        </p>
      </Section>

      <Section title="Variables & sliders" hint="order, muting, slider display"
        open={section === "vars"} onToggle={() => setSection(section === "vars" ? null : "vars")}>
        <SubSection title="Metrics" hint="order and muting">
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
        </SubSection>

        <SubSection title="Sliders" hint="order, muting, display">
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

          <div className="mt-4 border-t dl-line pt-3">
            <div className="mb-2 text-sm dl-muted">How each one adds up</div>
            <div className="space-y-2">
              {[
                // the built-in sliders…
                ...ALL_SLIDERS
                  .filter((k) => !(settings.slidersOff || []).includes(k))
                  .map((k) => ({ key: k, label: (METRICS.find((x) => x.id === k) || {}).label }))
                  .filter((x) => x.label),
                // …and the ones defined on activities, which is where
                // Quality lives
                ...[...new Set((data.types || []).flatMap((t) => (t.customSliders || []).map((c) => c.name)))]
                  .filter((n) => n && !(settings.slidersOff || []).includes(`cs:${n}`))
                  .map((n) => ({ key: `cs:${n}`, label: n })),
              ].map(({ key: k, label }) => {
                const sum = (settings.sliderAgg || {})[k] === "sum";
                return (
                  <div key={k} className="flex items-center gap-2">
                    <span className="flex-1 text-sm dl-muted">{label}</span>
                    <Chip small on={!sum}
                      onClick={() => setSettings({ sliderAgg: { ...(settings.sliderAgg || {}), [k]: "level" } })}>
                      Average
                    </Chip>
                    <Chip small on={sum}
                      onClick={() => setSettings({ sliderAgg: { ...(settings.sliderAgg || {}), [k]: "sum" } })}>
                      Total
                    </Chip>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs dl-faint">
              Total suits anything you want to compare week to week: four sessions at 2 is a worse week
              than one at 3, and an average hides that. The trade-off is that a total rises with the
              number of sessions, so weeks with very different session counts are not directly
              comparable. Average suits a level you want independent of volume.
            </p>
          </div>
        </SubSection>
      </Section>

      <Section title="App icon" hint={`${LOGO_TYPES[logoType(settings)].label.toLowerCase()}, ${SKINS[skinName(settings)].label.toLowerCase()}`}
        open={section === "logo"} onToggle={() => setSection(section === "logo" ? null : "logo")}>
        <div className="flex items-center gap-3">
          <Logo settings={settings} size={64} />
          <p className="flex-1 text-xs dl-faint">
            Applies to the browser tab straight away. On an installed app Android picks the change up
            within a day or two; reinstalling applies it at once.
          </p>
        </div>

        <SubSection title="Shape" hint={LOGO_TYPES[logoType(settings)].label} defaultOpen>
          <div className="flex flex-wrap gap-3">
            {Object.entries(LOGO_TYPES).map(([k, v]) => (
              <button key={k} onClick={() => setSettings({ logo: k })}
                className="flex flex-col items-center gap-1">
                <img src={logoURI({ ...settings, logo: k })} width={52} height={52} alt=""
                  className="rounded-xl" style={{ outline: logoType(settings) === k ? "2px solid var(--text)" : "none", outlineOffset: 2 }} />
                <span className="text-xs dl-faint">{v.label}</span>
              </button>
            ))}
          </div>
        </SubSection>

        <SubSection title="Colours" hint={SKINS[skinName(settings)].label}>
          <div className="mb-3 flex flex-wrap gap-2">
            <Chip small on={(settings.logoSkin || "auto") === "auto"} onClick={() => setSettings({ logoSkin: "auto" })}>
              Follow theme
            </Chip>
          </div>
          <div className="flex flex-wrap gap-3">
            {Object.entries(SKINS).map(([k, v]) => (
              <button key={k} onClick={() => setSettings({ logoSkin: k })}
                className="flex flex-col items-center gap-1">
                <img src={logoURI({ ...settings, logoSkin: k })} width={52} height={52} alt=""
                  className="rounded-xl" style={{ outline: settings.logoSkin === k ? "2px solid var(--text)" : "none", outlineOffset: 2 }} />
                <span className="text-xs dl-faint">{v.label}</span>
              </button>
            ))}
          </div>
        </SubSection>
      </Section>

      <Section title="Visual settings"
        hint={`${theme(settings).label.toLowerCase()}, ${(FONTS[settings.font] || FONTS.system).label.toLowerCase()}`}
        open={section === "visual"} onToggle={() => setSection(section === "visual" ? null : "visual")}>
        <SubSection title="Theme" hint={theme(settings).label} defaultOpen>
          <div className="flex flex-wrap gap-2">
            {Object.entries(THEMES).map(([k, v]) => (
              <Chip key={k} small on={settings.theme === k} onClick={() => setSettings({ theme: k })}>{v.label}</Chip>
            ))}
          </div>
        </SubSection>

        <SubSection title="Typeface" hint={(FONTS[settings.font] || FONTS.system).label}>
          <div className="flex flex-wrap gap-2">
            {Object.entries(FONTS).map(([k, v]) => (
              <Chip key={k} small on={settings.font === k} onClick={() => setSettings({ font: k })}>{v.label}</Chip>
            ))}
          </div>
          <p className="text-xs dl-faint">
            Grotesk, Chakra and Dot are fetched from Google Fonts the first time you pick them.
            The rest are already on the device.
          </p>
        </SubSection>

        <SubSection title="Activity colours" hint={PALETTES[paletteName(settings)].label}>
          <div className="mb-2 flex flex-wrap gap-2">
            <Chip small on={(settings.palette || "auto") === "auto"} onClick={() => setSettings({ palette: "auto" })}>
              Follow theme
            </Chip>
            {Object.entries(PALETTES).map(([k, v]) => (
              <Chip key={k} small on={settings.palette === k} onClick={() => setSettings({ palette: k })}>{v.label}</Chip>
            ))}
          </div>
          <div className="mb-2 flex flex-wrap gap-1">
            {paletteOf(settings).map((c) => (
              <span key={c} className="h-4 w-4 rounded-full" style={{ background: c }} />
            ))}
          </div>
          <p className="text-xs dl-faint">
            Activity colours are stored as slots, not fixed hexes: the same activity shows its pastel
            in Dark and its neon counterpart in Midnight. Nothing is rewritten — switch back and the
            old colours return. A colour picked outside these sets stays exactly as chosen.
          </p>
        </SubSection>

        <SubSection title="Calendar" hint="size and height">
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
        </SubSection>
        <p className="text-xs dl-faint">Themes, typefaces and colour sets are three tables at the top of the file: THEMES, FONTS, PALETTES. One row each. Web typefaces are fetched from Google Fonts on first use.</p>
      </Section>

      <div className="mb-2 mt-5 px-1 text-xs uppercase tracking-wide dl-faint">Data</div>
      <Section title="Sync" hint="this device and the repo"
        open={section === "sync"} onToggle={() => setSection(section === "sync" ? null : "sync")}>
        <SyncPanel />
      </Section>

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
  const [linked, setLinked] = useState(isConnected());
  const [busy, setBusy] = useState("");
  const [trouble, setTrouble] = useState("");
  const days = data.settings?.corosDays || 30;
  const [read, setRead] = useState(null);
  const [map, setMap] = useState({});
  const [done, setDone] = useState("");
  const [redo, setRedo] = useState(false);

  const doRead = (src) => {
    const text = typeof src === "string" ? src : paste;
    setDone("");
    const entries = parseCorosList(text);
    const details = parseCorosDetail(text);
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
    const detailed = new Set((data.sessions || [])
      .filter((s) => s.corosLabelId && s.coros && s.coros.detail)
      .map((s) => s.corosLabelId));
    setRead({
      entries: merged, codes, matched, orphan, unmapped,
      fresh: merged.filter((e) => !known.has(e.labelId)).length,
      again: merged.filter((e) => known.has(e.labelId)).length,
      // already here, but detail has just arrived for them
      refill: merged.filter((e) => e.detail && known.has(e.labelId) && !detailed.has(e.labelId)).length,
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
      const newDetail = Boolean(e.detail) && !(old && old.coros && old.coros.detail);
      if (old && !redo && !newDetail) { skipped++; continue; }
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

  const doSync = async () => {
    setTrouble(""); setDone(""); setBusy("Starting…");
    try {
      // skip activities whose detail block we already hold — not merely the
      // ones that exist, or a second sync would fetch nothing at all
      const known = redo
        ? new Set()
        : new Set((data.sessions || [])
            .filter((s) => s.corosLabelId && s.coros && s.coros.detail)
            .map((s) => s.corosLabelId));
      const r = await corosSync({ days, known, onProgress: setBusy });
      setPaste(r.text);
      doRead(r.text);
      if (!r.total) setTrouble(`No activities in the last ${days} days.`);
    } catch (e) {
      setTrouble(e.message || String(e));
      if (/not connected|connect again/i.test(e.message || "")) setLinked(isConnected());
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-xl border dl-line p-3">
        {linked ? (
          <>
            <div className="flex items-center gap-2">
              <button onClick={doSync} disabled={Boolean(busy)}
                className="dl-accent flex-1 rounded-xl py-3 text-sm font-medium disabled:opacity-60">
                {busy || `Sync last ${days} days`}
              </button>
              <button onClick={() => { disconnect(); setLinked(false); }}
                className="rounded-xl border dl-line px-3 py-3 text-sm dl-muted">Unlink</button>
            </div>
            <div className="flex items-center gap-2 text-xs dl-faint">
              <span>Look back</span>
              <input type="number" min="1" max="365" className={smallInput + " w-20"} value={days}
                onChange={(e) => update({ settings: { ...data.settings, corosDays: Math.max(1, Number(e.target.value) || 30) } })} />
              <span>days · activities already here are left alone</span>
            </div>
          </>
        ) : (
          <>
            <button onClick={() => connect().catch((e) => setTrouble(e.message))}
              className="dl-accent w-full rounded-xl py-3 text-sm font-medium">Connect COROS</button>
            <p className="text-xs dl-faint">
              Opens COROS to sign in. DayLoad only ever reads your activities, and the
              connection lives in this browser — link each device once.
            </p>
          </>
        )}
        {trouble && <div className="text-xs" style={{ color: "#e06c6c" }}>{trouble}</div>}
      </div>

      <p className="text-xs dl-faint">
        Or paste the Sport Records listing and any activity detail blocks together. Detail blocks
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
            Import {redo ? read.entries.length : read.fresh + (read.refill || 0)}
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
            {" "}{read.matched} with detail{read.refill ? ` · ${read.refill} filling in` : ""}{read.orphan ? ` · ${read.orphan} unmatched` : ""}
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

/* ================================================================== */
/* sync panel: the token for this device, and what the repo is doing   */
/* ================================================================== */

function SyncPanel() {
  const [cfg, setCfg] = useState(gh.config());
  const [status, setStatus] = useState(syncStatus());
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(null);
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);

  const [photos, setPhotos] = useState({ photos: 0, files: 0 });
  useEffect(() => onSync(setStatus), []);
  useEffect(() => onPending(setPhotos), []);

  const save = (patch) => setCfg(gh.setConfig(patch));

  const verify = async () => {
    setChecking(true);
    setChecked(null);
    try {
      const r = await gh.check();
      setChecked({ ok: true, text: `${r.name}${r.private ? " (private)" : " \u2014 WARNING: this repo is public"}` });
      await store.syncNow();
    } catch (e) {
      setChecked({ ok: false, text: e.message });
    }
    setChecking(false);
  };

  // fire the workflow, then watch it until it finishes
  const pullFromCoros = async () => {
    setBusy(true);
    try {
      await gh.runSync({ lookbackDays: 30, maxDetails: 25 });
      setRun({ status: "queued" });
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const r = await gh.lastRun();
        setRun(r);
        if (r && r.status === "completed") break;
      }
    } catch (e) {
      setRun({ status: "completed", conclusion: "failure", error: e.message });
    }
    setBusy(false);
  };

  const light =
    status.state === "synced" ? "#4ADE80" :
    status.state === "syncing" ? "#FACC15" :
    status.state === "error" ? "#F2546B" : "#94A3B8";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: light }} />
        <span className="dl-muted">
          {status.state === "synced" && `Up to date${status.pending ? ", saving\u2026" : ""}`}
          {status.state === "syncing" && "Syncing\u2026"}
          {status.state === "offline" && "Not linked \u2014 this device keeps its own copy"}
          {status.state === "error" && status.error}
        </span>
      </div>

      {photos.files > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border dl-line px-3 py-2">
          <span className="text-sm dl-muted">
            {photos.busy ? "Uploading photos…" : `${photos.photos} photo${photos.photos === 1 ? "" : "s"} waiting to upload`}
            {photos.error && !photos.busy && <span className="block text-xs" style={{ color: "#F2546B" }}>{photos.error}</span>}
            {!gh.isLinked() && <span className="block text-xs dl-faint">They go up once this device is linked.</span>}
          </span>
          {gh.isLinked() && !photos.busy && (
            <button onClick={() => flushPending()} className="rounded-lg border dl-line px-3 py-1.5 text-xs dl-muted">Upload now</button>
          )}
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-xs dl-faint">GitHub account</label>
        <input className={inputCls} placeholder="your github username" value={cfg.owner}
          onChange={(e) => save({ owner: e.target.value.trim() })} />

        <label className="block text-xs dl-faint">Data repo</label>
        <input className={inputCls} placeholder="dayload-data" value={cfg.repo}
          onChange={(e) => save({ repo: e.target.value.trim() })} />

        <label className="block text-xs dl-faint">Token for this device</label>
        <input className={inputCls} type="password" placeholder="github_pat_\u2026"
          value={cfg.token} onChange={(e) => save({ token: e.target.value.trim() })} />
        <p className="text-xs dl-faint">
          Fine-grained token, this repo only, Contents and Actions set to read and write.
          It stays in this browser and is never sent anywhere but GitHub.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={verify} disabled={checking}
          className="rounded-xl border dl-line px-3 py-2 text-sm dl-muted">
          {checking ? "Checking\u2026" : "Check and sync"}
        </button>
        <button onClick={() => { store.syncNow(); flushPending(); }}
          className="rounded-xl border dl-line px-3 py-2 text-sm dl-muted">
          Sync now
        </button>
        <button onClick={pullFromCoros} disabled={busy || !gh.isLinked()}
          className="dl-accent rounded-xl px-3 py-2 text-sm font-medium">
          {busy ? "Asking COROS\u2026" : "Fetch from COROS"}
        </button>
      </div>

      {checked && (
        <p className="text-xs" style={{ color: checked.ok ? undefined : "#F2546B" }}>{checked.text}</p>
      )}

      {run && (
        <p className="text-xs dl-faint">
          {run.status !== "completed" && "The robot is talking to COROS\u2026"}
          {run.status === "completed" && run.conclusion === "success" && "COROS run finished. New activities land in the repo."}
          {run.status === "completed" && run.conclusion !== "success" && `COROS run failed. ${run.error || ""}`}
        </p>
      )}

      <button onClick={() => { gh.forgetDevice(); setCfg(gh.config()); }}
        className="text-xs" style={{ color: "#F2546B" }}>
        Forget this device
      </button>
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

/* ================================================================== */
/* D. notebooks                                                       */
/* ================================================================== */

/* Three kinds, because "Achilles rehab", "Madeira, 4 days" and "2026
   goals" are not the same kind of writing. A journal is a thread you
   keep adding to; a trip is a closed stretch of days whose sessions
   appear by themselves; a page is one document you rewrite.

   Entries live in data.entries, not inside the notebook, so that two
   devices writing in the same notebook merge entry by entry instead of
   one overwriting the other. A page's text lives on the notebook
   itself — it is one document, and last write wins. */

const NB_KINDS = {
  journal: { label: "Journal", icon: NotebookPen,  hint: "An ongoing thread you add to over weeks — a rehab, a build-up, a block of training." },
  trip:    { label: "Trip",    icon: Mountain,     hint: "A closed stretch of days. The sessions you logged in that range appear on their own." },
  page:    { label: "Page",    icon: NotebookText, hint: "One living document you rewrite — goals, a race plan, a kit list." },
};

const fmtDay = (iso) => parseISO(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const fmtShort = (iso) => parseISO(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const fmtMonth = (iso) => parseISO(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });

function ago(ts) {
  if (!ts) return "";
  const d = dayDiff(todayISO(), fmtISO(new Date(ts)));
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  return fmtShort(fmtISO(new Date(ts)));
}

const entriesOf = (data, id) => (data.entries || []).filter((e) => e.notebookId === id);

// the last time anything in a notebook moved, which is what the list sorts by
function touchedAt(nb, entries) {
  let t = nb.updatedAt || "";
  for (const e of entries) if (e.notebookId === nb.id && (e.updatedAt || "") > t) t = e.updatedAt;
  return t;
}

const writable = (nb) => nb && nb.kind !== "page" && !nb.archived;

function sessionsBetween(data, from, to) {
  return liveSessions(data).filter((s) => s.date >= from && s.date <= to)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// the two or three numbers that identify a session at a glance
function brief(s) {
  const v = s.values || {};
  const out = [];
  const dist = num(v.distance), up = num(v.elevPos), dur = num(v.duration);
  if (dist) out.push(`${round(dist, 1)} km`);
  if (up) out.push(`${round(up, 0)} m+`);
  if (!out.length && dur) out.push(`${round(dur, 0)} min`);
  return out.join(" · ");
}

function tripTotals(list) {
  let km = 0, up = 0, mins = 0;
  for (const s of list) {
    km += num(s.values?.distance) || 0;
    up += num(s.values?.elevPos) || 0;
    mins += num(s.values?.duration) || 0;
  }
  return { km, up, mins };
}

/* ---------- a small markdown, just enough to write with ---------- */

const CHECK = /^(\s*)[-*] \[( |x|X)\] (.*)$/;

function toggleLine(text, i) {
  const lines = text.split("\n");
  const m = lines[i] && lines[i].match(CHECK);
  if (!m) return text;
  lines[i] = `${m[1]}- [${m[2] === " " ? "x" : " "}] ${m[3]}`;
  return lines.join("\n");
}

function inline(txt, key) {
  const parts = String(txt).split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={`${key}-${i}`} className="font-semibold dl-text">{p.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(p)) return <em key={`${key}-${i}`}>{p.slice(1, -1)}</em>;
    return p;
  });
}

function Prose({ text, onToggle, clamp = 0, color }) {
  const [open, setOpen] = useState(false);
  const all = String(text || "").replace(/\s+$/, "").split("\n");
  const cut = clamp > 0 && !open && all.length > clamp;
  const lines = cut ? all.slice(0, clamp) : all;
  return (
    <div className="space-y-1 text-sm leading-relaxed dl-muted">
      {lines.map((ln, i) => {
        const c = ln.match(CHECK);
        if (c) {
          const done = c[2] !== " ";
          return (
            <button key={i} type="button" disabled={!onToggle}
              onClick={(e) => { e.stopPropagation(); onToggle && onToggle(i); }}
              className="flex w-full items-start gap-2 text-left" style={{ paddingLeft: c[1].length * 8 }}>
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                style={{ borderColor: done ? color || "var(--text)" : "var(--faint)", background: done ? color || "var(--text)" : "transparent" }}>
                {done && <Check size={12} color="var(--bg)" strokeWidth={3} />}
              </span>
              <span className={done ? "line-through dl-faint" : ""}>{inline(c[3], i)}</span>
            </button>
          );
        }
        const h = ln.match(/^(#{1,3}) (.*)$/);
        if (h) return <div key={i} className={`${h[1].length === 1 ? "text-base" : "text-sm"} pt-2 font-semibold dl-text`}>{inline(h[2], i)}</div>;
        const b = ln.match(/^(\s*)[-*] (.*)$/);
        if (b) return <div key={i} className="flex gap-2" style={{ paddingLeft: b[1].length * 8 }}><span className="dl-faint">•</span><span>{inline(b[2], i)}</span></div>;
        const n = ln.match(/^(\s*)(\d+)[.)] (.*)$/);
        if (n) return <div key={i} className="flex gap-2" style={{ paddingLeft: n[1].length * 8 }}><span className="tabular-nums dl-faint">{n[2]}.</span><span>{inline(n[3], i)}</span></div>;
        if (!ln.trim()) return <div key={i} className="h-1" />;
        return <p key={i} className="whitespace-pre-wrap">{inline(ln, i)}</p>;
      })}
      {cut && (
        <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }} className="text-xs underline dl-faint">
          read the rest
        </button>
      )}
    </div>
  );
}

/* ---------- the values a journal follows ---------- */

/* A rehab is followed on more than one number: morning stiffness, pain
   during, pain the day after. A journal holds a list of measures, and an
   entry a value per measure in e.vals. Journals made before this had a
   single track.name and stored it as e.value; that reads as a measure
   called "main", so nothing written earlier is lost or rewritten. */
function measuresOf(nb) {
  if (!nb || !nb.track) return [];
  const ms = nb.track.measures;
  if (ms && ms.length) return ms;
  return [{ id: "main", name: nb.track.name || "Value", lowerBetter: nb.track.lowerBetter !== false }];
}
function valOf(e, m) {
  const v = e.vals ? e.vals[m.id] : undefined;
  if (v !== null && v !== undefined) return v;
  if (m.id === "main" && e.value !== null && e.value !== undefined && !(e.vals && "main" in e.vals)) return e.value;
  return null;
}
const hasVals = (e, nb) => measuresOf(nb).some((m) => valOf(e, m) !== null);

// the first measure wears the notebook's colour; the others take distant slots
const EXTRA_COLORS = ["#3FA9E0", "#F2C230", "#B57BE0", "#4ED9B4"];
function measureColor(nb, i) {
  if (i === 0) return shade(nb.color);
  const own = shade(nb.color);
  const pool = EXTRA_COLORS.map(shade).filter((c) => c !== own);
  return pool[(i - 1) % pool.length];
}

/* ---------- which activities a tracked value is about ---------- */

/* A tendon hurts on runs and hikes, not on the bike. So a tracked value
   is compared against one metric (or nothing), summed per day over only
   the activities it concerns. Activities are keys: "run" is every run,
   "run/<id>" narrows it to one subtype. Nothing chosen means all. */
const sessionKey = (s) => [s.typeId, ...(s.path || [])].join("/");
const concerns = (s, acts) => !acts || !acts.length
  || acts.some((k) => { const sk = sessionKey(s); return sk === k || sk.startsWith(k + "/"); });
const againstOf = (track) => (track && track.against !== undefined ? track.against : "load");

function actsLabel(types, acts) {
  if (!acts || !acts.length) return "all activities";
  return acts.map((k) => {
    const [root, ...path] = k.split("/");
    const t = findRoot(types, root);
    if (!t) return null;
    return path.length ? pathNames(t, path).join(" › ") || t.name : t.name;
  }).filter(Boolean).join(", ").toLowerCase();
}

/* ---------- the tracked value, drawn against what you did ---------- */

/* For a rehab the question is never "what was my pain", it is "what was
   my pain given what I'd been doing". So the value is drawn over faint
   bars of daily training load, on its own 0–10 axis. */
/* Everything the tracked chart draws, worked out once, so the app and
   the exported page cannot disagree. Null when there is too little. */
function trackSeries(data, nb, entries) {
  const ms = measuresOf(nb);
  const acts = nb.track.acts || [];
  const withVals = entries.filter((e) => hasVals(e, nb)).sort((a, b) => (a.date < b.date ? -1 : 1));

  // the session slider, if the journal draws one: a daily mean over the activities it concerns
  const fromKey = nb.track.fromSessions || null;
  const fromLabel = fromKey ? ((allSliderKeys(data.types).find((x) => x.key === fromKey) || {}).label || fromKey) : "";
  const sessDaily = {};
  if (fromKey) {
    const acc = {};
    for (const s of liveSessions(data)) {
      if (!concerns(s, acts)) continue;
      const v = metricValue(s, fromKey, data.types);
      if (v === null || v === undefined) continue;
      (acc[s.date] = acc[s.date] || []).push(v);
    }
    for (const [d, vs] of Object.entries(acc)) sessDaily[d] = vs.reduce((x, y) => x + y, 0) / vs.length;
  }

  // the span: from the first thing written with a value (or the journal's start) to today
  const start = withVals.length ? withVals[0].date
    : entries.length ? entries.reduce((m, e) => (e.date < m ? e.date : m), entries[0].date)
    : nb.createdAt ? fmtISO(new Date(nb.createdAt)) : null;
  if (!start) return null;
  const from = fmtISO(addDays(parseISO(start), -3));
  const lastDate = withVals.length ? withVals[withVals.length - 1].date : todayISO();
  const to = lastDate > todayISO() ? lastDate : todayISO();
  const sessPts = Object.keys(sessDaily).filter((d) => d >= from && d <= to).length;
  if (withVals.length < 2 && sessPts < 2) return null;

  const against = againstOf(nb.track);
  const met = against ? (METRICS.find((m) => m.id === against) || metricsFor(data.types, data.settings).find((m) => m.id === against) || { id: against, label: against, unit: "" }) : null;
  const loads = {};
  if (met) for (const s of liveSessions(data)) {
    if (s.date < from || s.date > to || !concerns(s, acts)) continue;
    const v = metricValue(s, against, data.types);
    if (v !== null) loads[s.date] = (loads[s.date] || 0) + v;
  }
  const metLabel = met ? (FIELDS[against] ? FIELDS[against].label : met.label) : "";
  const unit = met ? unitLabel(against) || met.unit || "" : "";

  const byDate = {};
  for (const e of withVals) byDate[e.date] = e; // the last entry of a day speaks for it
  const rows = [];
  for (let d = parseISO(from); fmtISO(d) <= to; d = addDays(d, 1)) {
    const iso = fmtISO(d);
    const row = { iso, label: fmtShort(iso), load: loads[iso] || 0, sess: sessDaily[iso] ?? null };
    ms.forEach((m) => { row[`m_${m.id}`] = byDate[iso] ? valOf(byDate[iso], m) : null; });
    rows.push(row);
  }

  // first → last for the lead measure, coloured by whether that is progress
  const lead = ms[0];
  const leadPts = withVals.map((e) => valOf(e, lead)).filter((v) => v !== null);
  const first = leadPts[0], last = leadPts[leadPts.length - 1];
  const better = lead.lowerBetter !== false ? last < first : last > first;
  const colors = ms.map((m, i) => measureColor(nb, i));
  return { rows, ms, met, metLabel, unit, fromKey, fromLabel, acts, colors, lead, leadPts, first, last, better };
}

function TrackChart({ data, nb, entries }) {
  const th = theme(data.settings);
  const T = trackSeries(data, nb, entries);
  if (!T) return null;
  const { rows, ms, met, metLabel, unit, fromKey, fromLabel, acts, lead, leadPts, first, last, better } = T;

  return (
    <div className={`${card} p-3`}>
      <div className="mb-1 flex items-baseline justify-between px-1">
        <span className="text-sm dl-muted">{ms.map((m) => m.name).join(" · ")}</span>
        {leadPts.length > 1 && (
          <span className="text-xs tabular-nums dl-faint">
            {lead.name} {round(first, 1)} → <span style={{ color: last === first ? undefined : better ? "#4BE37A" : "#F2546B" }}>{round(last, 1)}</span>
          </span>
        )}
      </div>
      <div style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 6, right: 4, bottom: 0, left: -28 }}>
            <CartesianGrid stroke={th.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: th.faint, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
            <YAxis yAxisId="v" domain={[0, 10]} ticks={[0, 5, 10]} tick={{ fill: th.faint, fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="l" orientation="right" hide />
            <Tooltip cursor={{ fill: th.grid }} content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload;
              return (
                <div className="rounded-xl border px-3 py-2 text-xs" style={{ background: th.bg, borderColor: th.line, color: th.text }}>
                  <div style={{ color: th.faint }}>{label}</div>
                  {ms.map((m, i) => r[`m_${m.id}`] !== null && (
                    <div key={m.id} className="tabular-nums" style={{ color: measureColor(nb, i) }}>{m.name}: {r[`m_${m.id}`]}</div>
                  ))}
                  {r.sess !== null && <div className="tabular-nums" style={{ color: th.muted }}>{fromLabel} (sessions): {round(r.sess, 1)}</div>}
                  {met && r.load > 0 && <div className="tabular-nums" style={{ color: th.faint }}>{metLabel}: {round(r.load, 1)} {unit}</div>}
                </div>
              );
            }} />
            {met && <Bar yAxisId="l" dataKey="load" fill={th.faint} opacity={0.35} radius={[2, 2, 0, 0]} isAnimationActive={false} />}
            {fromKey && <Line yAxisId="v" dataKey="sess" stroke={th.muted} strokeWidth={1.5} strokeDasharray="4 3" connectNulls dot={false} isAnimationActive={false} />}
            {ms.map((m, i) => (
              <Line key={m.id} yAxisId="v" dataKey={`m_${m.id}`} stroke={measureColor(nb, i)} strokeWidth={2} connectNulls
                dot={{ r: 3, fill: measureColor(nb, i), strokeWidth: 0 }} isAnimationActive={false} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs dl-faint">
        {ms.map((m, i) => (
          <span key={m.id} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: measureColor(nb, i) }} />{m.name}
          </span>
        ))}
        {fromKey && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: th.muted }} />{fromLabel} from sessions
          </span>
        )}
        {met && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: th.faint, opacity: 0.5 }} />{metLabel.toLowerCase()} per day
          </span>
        )}
        {(met || fromKey) && <span className="w-full">Counting {actsLabel(data.types, acts)}.</span>}
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */

function SessionChip({ s, types, onClick }) {
  const c = colorFor(types, s);
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick && onClick(s); }}
      className="flex max-w-full items-center gap-2 rounded-full border dl-line px-2.5 py-1 text-left text-xs">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c }} />
      <span className="truncate dl-muted">{s.title || labelFor(types, s)}</span>
      {brief(s) && <span className="shrink-0 tabular-nums dl-faint">{brief(s)}</span>}
    </button>
  );
}

function ValueChip({ name, value, lowerBetter }) {
  if (value === null || value === undefined) return null;
  // coloured by how good it is, not by the notebook: a 7 of pain should look like one
  const t = lowerBetter !== false ? value / 10 : 1 - value / 10;
  const col = t < 0.34 ? "#4BE37A" : t < 0.67 ? "#F2C230" : "#F2546B";
  return (
    <span className="inline-flex shrink-0 items-baseline gap-1 rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: col, color: col }}>
      {name} <span className="tabular-nums font-medium">{round(value, 1)}</span>
    </span>
  );
}

// every value an entry holds; compact shows the first and how many more
function ValueChips({ nb, e, compact = false }) {
  const set = measuresOf(nb).map((m) => ({ m, v: valOf(e, m) })).filter((x) => x.v !== null);
  if (!set.length) return null;
  const shown = compact ? set.slice(0, 1) : set;
  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
      {shown.map(({ m, v }) => <ValueChip key={m.id} name={m.name} value={v} lowerBetter={m.lowerBetter} />)}
      {compact && set.length > 1 && <span className="text-xs dl-faint">+{set.length - 1}</span>}
    </span>
  );
}

// the first thing an entry says, for its closed row
function firstLine(e) {
  if (e.title) return e.title;
  const l = (e.body || "").split("\n").map((x) => x.replace(LIST_PREFIX, "").replace(/\*/g, "").trim()).find(Boolean);
  if (l) return l;
  return (e.attachments || []).length ? "Photo or sketch" : "(empty entry)";
}

/* An entry is a row until it's opened. Closed, it shows its date, its
   first line and its tracked value — enough to scan twenty-five of them.
   Open, it shows everything, and editing is a button rather than a tap
   on the card, so ticking a box or opening a photo can't start an edit. */
function EntryCard({ e, nb, data, focused, open, onOpen, onEdit, onToggle, onJump, showDate = true }) {
  const ref = useRef(null);
  useEffect(() => {
    if (focused && ref.current) ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focused]);
  const linked = (e.sessionIds || []).map((id) => data.sessions.find((s) => s.id === id)).filter(Boolean);
  const nAtt = (e.attachments || []).length;
  return (
    <div ref={ref} className={card}
      style={focused ? { outline: `2px solid ${shade(nb.color) || "var(--text)"}`, outlineOffset: 2 } : undefined}>
      <button type="button" onClick={() => onOpen(e.id)} aria-expanded={open}
        className={`flex w-full items-center gap-3 text-left ${open ? "px-4 pt-4" : "px-4 py-3"}`}>
        <span className="min-w-0 flex-1">
          {showDate && <span className="block text-xs tabular-nums dl-faint">{fmtDay(e.date)}</span>}
          <span className={`block truncate ${e.title ? "font-medium" : "text-sm dl-muted"} ${open && !e.title ? "hidden" : ""}`}>{firstLine(e)}</span>
        </span>
        {!open && nAtt > 0 && <span className="flex shrink-0 items-center gap-0.5 text-xs dl-faint"><Paperclip size={12} />{nAtt}</span>}
        {!open && linked.length > 0 && <span className="flex shrink-0 items-center gap-0.5 text-xs dl-faint"><LinkIcon size={12} />{linked.length}</span>}
        <ValueChips nb={nb} e={e} compact={!open} />
        {open ? <ChevronDown size={16} className="shrink-0 dl-faint" /> : <ChevronRight size={16} className="shrink-0 dl-faint" />}
      </button>
      {open && (
        <div className="px-4 pb-4">
          {e.body && <div className="mt-2"><Prose text={e.body} color={shade(nb.color)} onToggle={(i) => onToggle(e, i)} /></div>}
          <AttachmentStrip items={e.attachments} />
          {linked.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {linked.map((s) => <SessionChip key={s.id} s={s} types={data.types} onClick={onJump} />)}
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <button onClick={() => onEdit(e)} className="flex items-center gap-1 rounded-lg border dl-line px-3 py-1.5 text-sm dl-muted">
              <Pencil size={14} /> Edit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Which rows are open, per notebook view. Arriving at an entry (from the
   calendar or a search) opens it; everything else starts closed. */
function useOpenSet(initial) {
  const [open, setOpen] = useState(() => new Set(initial.filter(Boolean)));
  const add = (...ids) => setOpen((o) => { const n = new Set(o); ids.filter(Boolean).forEach((x) => n.add(x)); return n; });
  return {
    has: (id) => open.has(id),
    flip: (id) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    add,
    set: (ids) => setOpen(new Set(ids)),
    size: open.size,
  };
}

function OpenAllBar({ count, noun, allOpen, onAll, onNone }) {
  if (count < 2) return null;
  return (
    <div className="flex items-center justify-between px-1 pt-1">
      <span className="text-xs dl-faint">{count} {noun}</span>
      <button onClick={allOpen ? onNone : onAll} className="flex items-center gap-1 text-xs dl-muted">
        {allOpen ? <><ChevronsDownUp size={14} /> Close all</> : <><ChevronsUpDown size={14} /> Open all</>}
      </button>
    </div>
  );
}

/* ---------- the tab ---------- */

function Notebooks({ data, openId, setOpenId, focus, onSaveNotebook, onDeleteNotebook, onWrite, onEditEntry, onSaveEntry, onJump }) {
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const notebooks = data.notebooks || [];
  const entries = data.entries || [];

  const open = notebooks.find((n) => n.id === openId);
  if (open) {
    return (
      <>
        <NotebookView key={open.id} data={data} nb={open} focus={focus} onBack={() => setOpenId(null)}
          onEdit={() => setSheet({ nb: open })} onSave={onSaveNotebook}
          onWrite={onWrite} onEditEntry={onEditEntry} onSaveEntry={onSaveEntry} onJump={onJump} />
        {sheet && <NotebookSheet data={data} initial={sheet.nb} onClose={() => setSheet(null)}
          onSave={(n) => { onSaveNotebook(n); setSheet(null); }}
          onDelete={(id) => { onDeleteNotebook(id); setSheet(null); setOpenId(null); }} />}
      </>
    );
  }

  const q = query.trim().toLowerCase();
  const hits = q ? [
    ...notebooks.filter((n) => (n.name || "").toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q))
      .map((n) => ({ kind: "nb", nb: n, text: n.kind === "page" ? n.body || "" : "" })),
    ...entries.filter((e) => `${e.title || ""}\n${e.body || ""}`.toLowerCase().includes(q))
      .map((e) => ({ kind: "entry", e, nb: notebooks.find((n) => n.id === e.notebookId), text: `${e.title ? e.title + " — " : ""}${e.body || ""}` })),
  ].filter((h) => h.nb) : [];

  const snippet = (text) => {
    // search what you'd read, not the markdown underneath it
    const flat = text.split("\n").filter((l) => l.trim()).map((l) => l.replace(/^\s*(#{1,3} |[-*] \[[ xX]\] |[-*] |\d+[.)] )/, "")).join(" · ")
      .replace(/\*\*?([^*]+)\*\*?/g, "$1").replace(/\s+/g, " ");
    const i = flat.toLowerCase().indexOf(q);
    if (i < 0) return flat.slice(0, 90);
    const a = Math.max(0, i - 40);
    return (
      <>
        {a > 0 ? "…" : ""}{flat.slice(a, i)}
        <mark style={{ background: "var(--abg)", color: "var(--atext)", borderRadius: 3, padding: "0 2px" }}>{flat.slice(i, i + q.length)}</mark>
        {flat.slice(i + q.length, i + q.length + 60)}…
      </>
    );
  };

  const sorted = [...notebooks].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return touchedAt(b, entries) > touchedAt(a, entries) ? 1 : -1;
  });
  const active = sorted.filter((n) => !n.archived);
  const archived = sorted.filter((n) => n.archived);

  const starters = [
    { kind: "journal", name: "Achilles rehab", track: { name: "Pain", lowerBetter: true } },
    { kind: "trip", name: "A trip", from: todayISO(), to: fmtISO(addDays(new Date(), 3)) },
    { kind: "page", name: "Season goals", body: "# This season\n- [ ] first goal\n- [ ] second goal" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 text-base font-medium">Notebooks</div>
        <button onClick={() => setSheet({})} className="dl-accent flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium">
          <Plus size={16} /> New
        </button>
      </div>

      {notebooks.length > 0 && (
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 dl-faint" />
          <input className={`${inputCls} pl-9`} placeholder="Search every notebook" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 dl-faint"><X size={16} /></button>}
        </div>
      )}

      {q ? (
        <div className="space-y-2">
          {hits.length === 0 && <div className="py-6 text-center text-sm dl-faint">Nothing matches “{query}”.</div>}
          {hits.map((h, i) => (
            <button key={i} onClick={() => { setQuery(""); setOpenId(h.nb.id, h.kind === "entry" ? h.e.id : null); }}
              className={`${card} block w-full p-3 text-left`} style={{ borderLeftColor: shade(h.nb.color), borderLeftWidth: 4 }}>
              <div className="flex items-baseline justify-between gap-2 text-xs dl-faint">
                <span>{h.nb.name}</span>
                {h.kind === "entry" && <span className="tabular-nums">{fmtDay(h.e.date)}</span>}
              </div>
              {h.text && <div className="mt-1 text-sm dl-muted">{snippet(h.text)}</div>}
            </button>
          ))}
        </div>
      ) : (
        <>
          {notebooks.length === 0 && (
            <div className={`${card} p-5`}>
              <div className="font-medium">Somewhere to keep what the numbers don't</div>
              <p className="mt-1 text-sm dl-muted">Start from one of these, or make your own.</p>
              <div className="mt-4 space-y-2">
                {starters.map((st) => {
                  const Icon = NB_KINDS[st.kind].icon;
                  return (
                    <button key={st.kind} onClick={() => setSheet({ nb: { ...st, _new: true } })}
                      className="flex w-full items-start gap-3 rounded-xl border dl-line p-3 text-left">
                      <Icon size={18} className="mt-0.5 shrink-0 dl-muted" />
                      <span>
                        <span className="block text-sm">{NB_KINDS[st.kind].label}</span>
                        <span className="block text-xs dl-faint">{NB_KINDS[st.kind].hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {active.map((nb) => <NotebookCard key={nb.id} nb={nb} data={data} onOpen={() => setOpenId(nb.id)} />)}

          {archived.length > 0 && (
            <div>
              <button onClick={() => setShowArchived(!showArchived)} className="flex items-center gap-2 py-2 text-sm dl-faint">
                {showArchived ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Archived ({archived.length})
              </button>
              {showArchived && <div className="space-y-3 opacity-70">
                {archived.map((nb) => <NotebookCard key={nb.id} nb={nb} data={data} onOpen={() => setOpenId(nb.id)} />)}
              </div>}
            </div>
          )}
        </>
      )}

      {sheet && <NotebookSheet data={data} initial={sheet.nb} onClose={() => setSheet(null)}
        onSave={(n) => { onSaveNotebook(n); setSheet(null); setOpenId(n.id); }}
        onDelete={(id) => { onDeleteNotebook(id); setSheet(null); }} />}
    </div>
  );
}

function NotebookCard({ nb, data, onOpen }) {
  const K = NB_KINDS[nb.kind] || NB_KINDS.journal;
  const Icon = K.icon;
  const list = entriesOf(data, nb.id);
  const color = shade(nb.color);
  let meta = null, extra = null;

  if (nb.kind === "journal") {
    const last = list.reduce((m, e) => (e.date > m ? e.date : m), "");
    meta = list.length ? `${list.length} entr${list.length === 1 ? "y" : "ies"} · last ${fmtShort(last)}` : "No entries yet";
    if (nb.track) {
      const lead = measuresOf(nb)[0];
      const pts = list.map((e) => ({ date: e.date, value: valOf(e, lead) })).filter((p) => p.value !== null).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-12);
      if (pts.length > 1) {
        const w = 72, h = 22;
        const d = pts.map((e, i) => `${i ? "L" : "M"}${(i / (pts.length - 1)) * w},${h - (e.value / 10) * h}`).join(" ");
        extra = (
          <span className="flex items-center gap-2">
            <svg width={w} height={h + 2} viewBox={`0 -1 ${w} ${h + 2}`} aria-hidden="true">
              <path d={d} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
            <span className="text-xs tabular-nums dl-faint">{lead.name} {round(pts[pts.length - 1].value, 1)}</span>
          </span>
        );
      }
    }
  } else if (nb.kind === "trip") {
    const days = nb.from && nb.to ? dayDiff(nb.to, nb.from) + 1 : 0;
    const ss = nb.from && nb.to ? sessionsBetween(data, nb.from, nb.to) : [];
    const t = tripTotals(ss);
    meta = nb.from ? `${fmtShort(nb.from)} – ${fmtShort(nb.to)} · ${days} day${days === 1 ? "" : "s"}` : "No dates yet";
    if (ss.length) extra = <span className="text-xs tabular-nums dl-faint">{ss.length} session{ss.length === 1 ? "" : "s"}{t.km ? ` · ${round(t.km, 0)} km` : ""}{t.up ? ` · ${round(t.up, 0)} m+` : ""}</span>;
  } else {
    const lines = (nb.body || "").split("\n");
    const boxes = lines.filter((l) => CHECK.test(l));
    const done = boxes.filter((l) => !/\[ \]/.test(l)).length;
    meta = `Edited ${ago(nb.updatedAt)}`;
    if (boxes.length) extra = (
      <span className="flex items-center gap-2">
        <span className="h-1.5 w-16 overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
          <span className="block h-full rounded-full" style={{ width: `${(done / boxes.length) * 100}%`, background: color }} />
        </span>
        <span className="text-xs tabular-nums dl-faint">{done}/{boxes.length} done</span>
      </span>
    );
  }

  return (
    <button onClick={onOpen} className={`${card} block w-full p-4 text-left`} style={{ borderLeftColor: color, borderLeftWidth: 4 }}>
      <div className="flex items-center gap-2">
        <Icon size={16} style={{ color }} className="shrink-0" />
        <span className="flex-1 truncate font-medium">{nb.name || "Untitled"}</span>
        {nb.pinned && <Pin size={14} className="dl-faint" />}
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-xs dl-faint">{K.label} · {meta}</span>
        {extra}
      </div>
    </button>
  );
}

/* ---------- one notebook ---------- */

function NotebookView({ data, nb, focus, onBack, onEdit, onSave, onWrite, onEditEntry, onSaveEntry, onJump }) {
  const [exporting, setExporting] = useState(false);
  const K = NB_KINDS[nb.kind] || NB_KINDS.journal;
  const color = shade(nb.color);
  const list = entriesOf(data, nb.id).sort((a, b) => (a.date === b.date ? ((a.createdAt || "") < (b.createdAt || "") ? 1 : -1) : a.date < b.date ? 1 : -1));
  const toggle = (e, i) => onSaveEntry({ ...e, body: toggleLine(e.body || "", i) });
  const rows = useOpenSet([focus]);
  useEffect(() => { if (focus) rows.add(focus); }, [focus]);
  const allOpen = list.length > 0 && list.every((e) => rows.has(e.id));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="rounded-xl border dl-line p-2 dl-muted" aria-label="All notebooks"><ChevronLeft size={18} /></button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-medium">{nb.name || "Untitled"}</div>
          <div className="text-xs dl-faint" style={{ color }}>
            {K.label}
            {nb.kind === "trip" && nb.from ? ` · ${fmtShort(nb.from)} – ${fmtShort(nb.to)}, ${dayDiff(nb.to, nb.from) + 1} days` : ""}
            {nb.archived ? " · archived" : ""}
          </div>
        </div>
        <button onClick={() => onSave({ ...nb, pinned: !nb.pinned })} className={`rounded-xl border dl-line p-2 ${nb.pinned ? "dl-text" : "dl-faint"}`} aria-label={nb.pinned ? "Unpin" : "Pin to the top"}>
          <Pin size={18} fill={nb.pinned ? "currentColor" : "none"} />
        </button>
        <button onClick={() => setExporting(true)} className="rounded-xl border dl-line p-2 dl-muted" aria-label="Export or share"><Share2 size={18} /></button>
        <button onClick={onEdit} className="rounded-xl border dl-line p-2 dl-muted" aria-label="Notebook settings"><Pencil size={18} /></button>
      </div>
      {exporting && <ExportSheet data={data} nb={nb} onClose={() => setExporting(false)} />}

      {nb.kind === "page" && <DocBody nb={nb} onSave={onSave} startEditing={!nb.body && !(nb.attachments || []).length} />}

      {nb.kind === "journal" && (
        <>
          {nb.track && <TrackChart data={data} nb={nb} entries={list} />}
          <DocBody nb={nb} onSave={onSave} title="Notes" clamp={8}
            empty="Notes for the whole journal — protocol, contacts, what to watch for" />
          {!nb.archived && (
            <button onClick={() => onWrite(nb.id, {})} className="dl-accent flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium">
              <Plus size={16} /> Write an entry
            </button>
          )}
          {list.length === 0 && <div className="py-6 text-center text-sm dl-faint">Nothing written here yet.</div>}
          <OpenAllBar count={list.length} noun="entries" allOpen={allOpen}
            onAll={() => rows.set(list.map((e) => e.id))} onNone={() => rows.set([])} />
          {list.map((e, i) => {
            const month = fmtMonth(e.date);
            const newMonth = i === 0 || fmtMonth(list[i - 1].date) !== month;
            return (
              <React.Fragment key={e.id}>
                {newMonth && <div className="px-1 pt-2 text-xs uppercase tracking-wide dl-faint">{month}</div>}
                <EntryCard e={e} nb={nb} data={data} focused={focus === e.id} open={rows.has(e.id)} onOpen={rows.flip}
                  onEdit={onEditEntry} onToggle={toggle} onJump={onJump} />
              </React.Fragment>
            );
          })}
        </>
      )}

      {nb.kind === "trip" && <TripBody data={data} nb={nb} list={list} focus={focus} rows={rows} onSave={onSave} onWrite={onWrite} onEditEntry={onEditEntry} onToggle={toggle} onJump={onJump} />}
    </div>
  );
}

function TripBody({ data, nb, list, focus, rows, onSave, onWrite, onEditEntry, onToggle, onJump }) {
  if (!nb.from || !nb.to) return <div className={`${card} p-5 text-sm dl-muted`}>Give this trip its dates (pencil, top right) and its sessions will appear here.</div>;
  const color = shade(nb.color);
  const days = [];
  for (let d = parseISO(nb.from); fmtISO(d) <= nb.to; d = addDays(d, 1)) days.push(fmtISO(d));
  const ss = sessionsBetween(data, nb.from, nb.to);
  const t = tripTotals(ss);
  const outside = list.filter((e) => e.date < nb.from || e.date > nb.to).sort((a, b) => (a.date < b.date ? -1 : 1));
  // arriving at an entry inside a day opens that day
  useEffect(() => {
    const e = focus && list.find((x) => x.id === focus);
    if (e) rows.add(`day:${e.date}`);
  }, [focus]);
  const allKeys = [...days.map((d) => `day:${d}`), ...outside.map((e) => e.id)];
  const allOpen = allKeys.every((k) => rows.has(k));

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Tile value={ss.length} label={`session${ss.length === 1 ? "" : "s"}`} />
        <Tile value={t.km ? round(t.km, 1) : "–"} label="km" />
        <Tile value={t.up ? round(t.up, 0) : "–"} label="m climbed" />
      </div>

      <DocBody nb={nb} onSave={onSave} title="Trip notes" clamp={16}
        empty="Notes for the whole trip — plan, packing list, addresses" />

      {!nb.archived && (
        <button onClick={() => onWrite(nb.id, { date: nb.from > todayISO() ? nb.from : todayISO() })}
          className="dl-accent flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium">
          <Plus size={16} /> Write an entry
        </button>
      )}

      <OpenAllBar count={allKeys.length} noun="days and notes" allOpen={allOpen}
        onAll={() => rows.set(allKeys)} onNone={() => rows.set([])} />

      {days.map((d, i) => {
        const daySessions = ss.filter((s) => s.date === d);
        const dayEntries = list.filter((e) => e.date === d);
        const isOpen = rows.has(`day:${d}`);
        const km = tripTotals(daySessions).km;
        const summary = [
          daySessions.length ? `${daySessions.length} session${daySessions.length === 1 ? "" : "s"}${km ? ` · ${round(km, 1)} km` : ""}` : "",
          dayEntries.length ? `${dayEntries.length} note${dayEntries.length === 1 ? "" : "s"}` : "",
        ].filter(Boolean).join(" · ") || "nothing logged";
        return (
          <div key={d} className={card}>
            <div className={`flex items-center gap-2 ${isOpen ? "px-4 pt-4" : "px-4 py-3"}`}>
              <button onClick={() => rows.flip(`day:${d}`)} aria-expanded={isOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className="shrink-0 text-sm font-medium" style={{ color }}>Day {i + 1}</span>
                <span className="shrink-0 text-xs dl-faint">{fmtDay(d)}</span>
                {!isOpen && <span className="min-w-0 truncate text-xs dl-faint">· {summary}</span>}
                <span className="flex-1" />
                {isOpen ? <ChevronDown size={16} className="shrink-0 dl-faint" /> : <ChevronRight size={16} className="shrink-0 dl-faint" />}
              </button>
              {isOpen && !nb.archived && (
                <button onClick={() => onWrite(nb.id, { date: d })}
                  className="flex shrink-0 items-center gap-1 text-xs dl-muted"><Plus size={12} /> Write</button>
              )}
            </div>
            {isOpen && (
              <div className="px-4 pb-4">
                {daySessions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {daySessions.map((s) => <SessionChip key={s.id} s={s} types={data.types} onClick={onJump} />)}
                  </div>
                )}
                {daySessions.length === 0 && dayEntries.length === 0 && <div className="mt-1 text-xs dl-faint">Rest day, or nothing logged.</div>}
                {dayEntries.map((e) => (
                  <div key={e.id} className="mt-3 border-t dl-line pt-3">
                    <EntryInline e={e} nb={nb} data={data} focused={focus === e.id} onEdit={onEditEntry} onToggle={onToggle} onJump={onJump} daySessions={daySessions} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {outside.length > 0 && (
        <>
          <div className="px-1 pt-2 text-xs uppercase tracking-wide dl-faint">Before and after</div>
          {outside.map((e) => <EntryCard key={e.id} e={e} nb={nb} data={data} focused={focus === e.id} open={rows.has(e.id)} onOpen={rows.flip}
            onEdit={onEditEntry} onToggle={onToggle} onJump={onJump} />)}
        </>
      )}
    </>
  );
}

// an entry inside a trip day: the day already says the date and shows its sessions
function EntryInline({ e, nb, data, focused, onEdit, onToggle, onJump, daySessions }) {
  const ref = useRef(null);
  useEffect(() => { if (focused && ref.current) ref.current.scrollIntoView({ behavior: "smooth", block: "center" }); }, [focused]);
  const shown = new Set(daySessions.map((s) => s.id));
  const extra = (e.sessionIds || []).filter((id) => !shown.has(id)).map((id) => data.sessions.find((s) => s.id === id)).filter(Boolean);
  return (
    <div ref={ref} className="rounded-lg"
      style={focused ? { outline: `2px solid ${shade(nb.color)}`, outlineOffset: 4 } : undefined}>
      <div className="mb-1 flex items-start justify-between gap-2">
        {e.title ? <div className="text-sm font-medium">{e.title}</div> : <span />}
        <button onClick={() => onEdit(e)} aria-label="Edit this note" className="shrink-0 dl-faint"><Pencil size={14} /></button>
      </div>
      {e.body ? <Prose text={e.body} clamp={8} color={shade(nb.color)} onToggle={(i) => onToggle(e, i)} />
        : !(e.attachments || []).length && <div className="text-sm dl-faint">(empty entry)</div>}
      <AttachmentStrip items={e.attachments} />
      {extra.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{extra.map((s) => <SessionChip key={s.id} s={s} types={data.types} onClick={onJump} />)}</div>}
    </div>
  );
}

/* The values a journal follows. The first one leads: it names the chart,
   colours the list and draws the sparkline. Removing a measure keeps what
   was written under it in the entries; it just stops being shown. */
function MeasureList({ data, nb, onChange }) {
  const ms = measuresOf(nb);
  const setM = (i, patch) => onChange(ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  return (
    <div className="space-y-2">
      {ms.map((m, i) => (
        <div key={m.id} className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: measureColor(nb, i) }} />
          <input className={`${smallInput} min-w-0 flex-1`} value={m.name} placeholder="Pain, stiffness…"
            onChange={(e) => setM(i, { name: e.target.value })} />
          <Chip small on={m.lowerBetter !== false} onClick={() => setM(i, { lowerBetter: true })}>lower</Chip>
          <Chip small on={m.lowerBetter === false} onClick={() => setM(i, { lowerBetter: false })}>higher</Chip>
          {ms.length > 1 && (
            <button onClick={() => onChange(ms.filter((_, j) => j !== i))} aria-label={`Remove ${m.name}`} className="dl-faint"><X size={16} /></button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between">
        <span className="text-xs dl-faint">"lower" or "higher" is better</span>
        {ms.length < 4 && (
          <button onClick={() => onChange([...ms, { id: uid(), name: "", lowerBetter: true }])} className="flex items-center gap-1 text-xs dl-muted">
            <Plus size={12} /> Add a value
          </button>
        )}
      </div>
    </div>
  );
}

/* What the tracked value is drawn against, and over which activities. */
function TrackAgainst({ data, track, onChange }) {
  const against = againstOf(track);
  const acts = track.acts || [];
  const options = metricsFor(data.types, data.settings).filter((m) => m.kind === "sum");
  const roots = data.types.filter((t) => !t.muted);
  const has = (root) => acts.some((k) => k === root.id || k.startsWith(root.id + "/"));
  const setActs = (next) => onChange({ ...track, acts: next });

  const flipRoot = (t) => setActs(has(t) ? acts.filter((k) => !(k === t.id || k.startsWith(t.id + "/"))) : [...acts, t.id]);
  const flipChild = (t, c) => {
    const key = `${t.id}/${c.id}`;
    let next = acts.filter((k) => k !== t.id);           // choosing a subtype narrows the whole activity
    next = next.includes(key) ? next.filter((k) => k !== key) : [...next, key];
    if (!next.some((k) => k.startsWith(t.id + "/"))) next = [...next, t.id]; // none left: back to all of it
    setActs(next);
  };

  return (
    <div className="space-y-3 border-t dl-line pt-3">
      <div>
        <div className="mb-1.5 text-sm dl-muted">Compare with</div>
        <div className="flex flex-wrap gap-2">
          <Chip small on={!against} onClick={() => onChange({ ...track, against: null })}>Nothing</Chip>
          {options.map((m) => (
            <Chip key={m.id} small on={against === m.id} onClick={() => onChange({ ...track, against: m.id })}>
              {FIELDS[m.id] ? FIELDS[m.id].label : m.label}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-sm dl-muted">Also draw from your sessions</div>
        <div className="flex flex-wrap gap-2">
          <Chip small on={!track.fromSessions} onClick={() => onChange({ ...track, fromSessions: null })}>Nothing</Chip>
          {allSliderKeys(data.types).map((x) => (
            <Chip key={x.key} small on={track.fromSessions === x.key} onClick={() => onChange({ ...track, fromSessions: x.key })}>{x.label}</Chip>
          ))}
        </div>
        <div className="mt-1 text-xs dl-faint">A dashed line of what you already rate on each session, so it needn't be typed twice.</div>
      </div>
      {(against || track.fromSessions) && (
        <div>
          <div className="mb-1.5 text-sm dl-muted">Counting only</div>
          <div className="flex flex-wrap gap-2">
            {roots.map((t) => (
              <Chip key={t.id} small on={has(t)} color={shade(t.color)} onClick={() => flipRoot(t)}>{t.name}</Chip>
            ))}
          </div>
          {roots.filter((t) => has(t) && (t.children || []).length).map((t) => (
            <div key={t.id} className="mt-2 flex flex-wrap items-center gap-2 pl-2">
              <span className="text-xs" style={{ color: shade(t.color) }}>{t.name} ›</span>
              <Chip small on={acts.includes(t.id)} color={shade(t.color)} onClick={() => setActs([...acts.filter((k) => !k.startsWith(t.id + "/") && k !== t.id), t.id])}>all</Chip>
              {t.children.map((c) => (
                <Chip key={c.id} small on={acts.includes(`${t.id}/${c.id}`)} color={shade(t.color)} onClick={() => flipChild(t, c)}>{c.name}</Chip>
              ))}
            </div>
          ))}
          <div className="mt-2 text-xs dl-faint">
            {acts.length ? `Only ${actsLabel(data.types, acts)} count.` : "None picked: every activity counts."}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- making and changing a notebook ---------- */

function NotebookSheet({ data, initial, onSave, onClose, onDelete }) {
  const isNew = !initial || initial._new;
  const colors = paletteOf(data.settings); // the default comes from the theme's own set
  const [n, setN] = useState(() => {
    const { _new, ...rest } = initial || {};
    return {
      id: uid(), kind: "journal", name: "", color: colors[(data.notebooks || []).length * 3 % colors.length],
      pinned: false, archived: false, createdAt: nowISO(), ...rest,
    };
  });
  const [confirm, setConfirm] = useState(false);
  const set = (patch) => setN((x) => ({ ...x, ...patch }));
  const count = entriesOf(data, n.id).length;
  const ok = n.name.trim() && (n.kind !== "trip" || (n.from && n.to && n.to >= n.from));

  return (
    <div className="dl-root dl-bg dl-text fixed inset-0 z-50 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 pb-10">
        <div className="dl-bg sticky top-0 z-10 flex items-center justify-between border-b dl-line py-4">
          <button onClick={onClose} className="dl-muted">Cancel</button>
          <span className="font-medium">{isNew ? "New notebook" : "Notebook"}</span>
          <button disabled={!ok} onClick={() => onSave({ ...n, name: n.name.trim() })}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${ok ? "dl-accent" : "dl-faint"}`}>
            <Save size={16} /> Save
          </button>
        </div>

        <div className="space-y-4 pt-4">
          <div className={`${card} p-4`}>
            <Field label="Name">
              <input autoFocus={isNew} className={inputCls} placeholder="Achilles rehab, Madeira, 2026 goals…" value={n.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
          </div>

          {isNew && (
            <div className={`${card} space-y-2 p-4`}>
              <div className="text-sm dl-muted">Kind</div>
              {Object.entries(NB_KINDS).map(([k, K]) => {
                const Icon = K.icon;
                const on = n.kind === k;
                return (
                  <button key={k} onClick={() => set({ kind: k })}
                    className="flex w-full items-start gap-3 rounded-xl border p-3 text-left"
                    style={{ borderColor: on ? shade(n.color) : "var(--line)", background: on ? shade(n.color) + "1A" : "transparent" }}>
                    <Icon size={18} className="mt-0.5 shrink-0" style={{ color: on ? shade(n.color) : "var(--muted)" }} />
                    <span>
                      <span className="block text-sm">{K.label}</span>
                      <span className="block text-xs dl-faint">{K.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {n.kind === "trip" && (
            <div className={`${card} grid grid-cols-2 gap-3 p-4`}>
              <Field label="From"><input type="date" className={inputCls} value={n.from || ""} onChange={(e) => set({ from: e.target.value, to: n.to && n.to >= e.target.value ? n.to : e.target.value })} /></Field>
              <Field label="To"><input type="date" className={inputCls} value={n.to || ""} min={n.from || undefined} onChange={(e) => set({ to: e.target.value })} /></Field>
            </div>
          )}

          {n.kind === "journal" && (
            <div className={`${card} space-y-3 p-4`}>
              <label className="flex items-center justify-between gap-3">
                <span>
                  <span className="block text-sm">Track values with each entry</span>
                  <span className="block text-xs dl-faint">0–10 sliders on every entry, charted over time — and, if you like, against what you did in the activities they concern.</span>
                </span>
                <input type="checkbox" className="h-5 w-5 shrink-0" checked={!!n.track}
                  onChange={(e) => set({ track: e.target.checked ? { name: "Pain", lowerBetter: true, measures: [{ id: "main", name: "Pain", lowerBetter: true }], against: "load", acts: [], fromSessions: null } : null })} />
              </label>
              {n.track && <MeasureList data={data} nb={n} onChange={(ms) => set({ track: { ...n.track, measures: ms, name: ms[0].name, lowerBetter: ms[0].lowerBetter } })} />}
              {n.track && <TrackAgainst data={data} track={n.track} onChange={(t) => set({ track: t })} />}
            </div>
          )}

          {/* the same 14 as activities, and like them they follow the theme:
              the notebook keeps its slot, the theme decides the shade */}
          <div className={`${card} p-4`}>
            <div className="mb-2 text-sm dl-muted">Colour</div>
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => (
                <button key={c} onClick={() => set({ color: c })} aria-label={c}
                  className="h-8 w-8 rounded-full" style={{ background: c, outline: shade(n.color) === c ? "2px solid var(--text)" : "none", outlineOffset: 2 }} />
              ))}
            </div>
          </div>

          {!isNew && (
            <div className={`${card} space-y-2 p-4`}>
              <button onClick={() => set({ archived: !n.archived })} className="flex w-full items-center gap-2 text-sm dl-muted">
                <Archive size={16} /> {n.archived ? "Bring back from the archive" : "Archive — keep it, but out of the way"}
              </button>
              <button onClick={() => setConfirm(true)} className="flex w-full items-center gap-2 pt-2 text-sm" style={{ color: "#F2546B" }}>
                <Trash2 size={16} /> Delete this notebook
              </button>
            </div>
          )}
        </div>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className={`${card} w-full max-w-sm p-5`}>
            <div className="font-medium">Delete “{n.name}”?</div>
            <p className="mt-2 text-sm dl-muted">
              {count ? `Its ${count} entr${count === 1 ? "y goes" : "ies go"} with it, on every device. ` : ""}Your sessions are not touched. Archiving keeps everything instead.
            </p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setConfirm(false)} className="flex-1 rounded-xl border dl-line py-3 text-sm">Cancel</button>
              <button onClick={() => onDelete(n.id)} className="flex-1 rounded-xl py-3 text-sm font-medium" style={{ background: "#F2546B", color: "#fff" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- writing an entry ---------- */

function EntrySheet({ data, initial, isNew, onSave, onDelete, onClose }) {
  const [e, setE] = useState(initial);
  const [wide, setWide] = useState(false);
  // linking is always optional: the list stays closed unless something is already linked
  const [linking, setLinking] = useState((initial.sessionIds || []).length > 0);
  const [confirm, setConfirm] = useState(false);
  const set = (patch) => setE((x) => ({ ...x, ...patch }));
  const nb = (data.notebooks || []).find((n) => n.id === e.notebookId);
  const choices = (data.notebooks || []).filter((n) => writable(n) || n.id === e.notebookId);
  const color = shade(nb?.color) || "var(--text)";
  const linked = new Set(e.sessionIds || []);

  // sessions near the entry's date, nearest first; linked ones always stay listed
  const span = wide ? 21 : 3;
  const near = liveSessions(data)
    .filter((s) => linked.has(s.id) || Math.abs(dayDiff(s.date, e.date)) <= span)
    .sort((a, b) => Math.abs(dayDiff(a.date, e.date)) - Math.abs(dayDiff(b.date, e.date)) || (a.date < b.date ? 1 : -1));

  const flip = (id) => set({ sessionIds: linked.has(id) ? [...linked].filter((x) => x !== id) : [...linked, id] });
  const ok = !!nb && (e.body?.trim() || e.title?.trim() || hasVals(e, nb) || linked.size || (e.attachments || []).length);
  const tools = useAttachmentTools(e.attachments, (atts) => set({ attachments: atts }));

  return (
    <div className="dl-root dl-bg dl-text fixed inset-0 z-50 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 pb-10">
        <div className="dl-bg sticky top-0 z-10 flex items-center justify-between border-b dl-line py-4">
          <button onClick={onClose} className="dl-muted">Cancel</button>
          <span className="font-medium">{isNew ? "New entry" : "Edit entry"}</span>
          <button disabled={!ok} onClick={() => onSave(e)}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${ok ? "dl-accent" : "dl-faint"}`}>
            <Save size={16} /> Save
          </button>
        </div>

        <div className="space-y-4 pt-4">
          {choices.length === 0 && (
            <div className={`${card} p-5 text-sm dl-muted`}>You have no journal or trip to write in yet. Make one in the Notebooks tab first.</div>
          )}
          {choices.length > 0 && (
            <div className={`${card} p-4`}>
              <div className="mb-2 text-sm dl-muted">In</div>
              <div className="flex flex-wrap gap-2">
                {choices.map((n) => (
                  <Chip key={n.id} small on={n.id === e.notebookId} color={shade(n.color)} onClick={() => set({ notebookId: n.id })}>{n.name}</Chip>
                ))}
              </div>
            </div>
          )}

          <div className={`${card} space-y-3 p-4`}>
            <Field label="Date">
              <input type="date" className={inputCls} value={e.date} onChange={(ev) => set({ date: ev.target.value })} />
            </Field>
            <Field label="Title (optional)">
              <input className={inputCls} placeholder="First run without the tape…" value={e.title || ""} onChange={(ev) => set({ title: ev.target.value })} />
            </Field>
          </div>

          {nb?.track && (
            <div className={`${card} px-4 py-2`}>
              {measuresOf(nb).map((m, i) => (
                <Slider key={m.id} label={m.name} hint={m.lowerBetter !== false ? "none → worst" : "worst → best"}
                  color={measureColor(nb, i)} value={valOf(e, m)}
                  // "main" also keeps the old field, so an older build still reads it
                  onChange={(v) => set({ vals: { ...(e.vals || {}), [m.id]: v }, ...(m.id === "main" ? { value: v } : {}) })}
                  showValue={data.settings?.sliderValues !== false} showHint />
              ))}
            </div>
          )}

          <div className={`${card} p-4`}>
            <WriteBox value={e.body || ""} onChange={(v) => set({ body: v })}
              placeholder="What happened, what you felt, what you'll change…"
              onPhoto={tools.addPhotos} onSketch={tools.newSketch} />
            <Attachments items={e.attachments} onOpen={tools.open} onRemove={tools.remove} />
            {tools.ui}
          </div>

          {!linking ? (
            <button onClick={() => setLinking(true)}
              className="flex w-full items-center gap-2 rounded-2xl border border-dashed dl-line px-4 py-3 text-left text-sm dl-faint">
              <LinkIcon size={16} className="shrink-0" /> Link to a session (optional)
            </button>
          ) : (
          <div className={`${card} p-4`}>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-sm dl-muted">Linked sessions <span className="dl-faint">· optional</span></span>
              <span className="text-xs dl-faint">{linked.size ? `${linked.size} linked` : `within ${span} days`}</span>
            </div>
            {near.length === 0 && <div className="py-2 text-sm dl-faint">No sessions within {span} days of this date.</div>}
            <div className="divide-y dl-line">
              {near.map((s) => {
                const on = linked.has(s.id);
                return (
                  <button key={s.id} onClick={() => flip(s.id)} className="flex w-full items-center gap-3 py-2.5 text-left" style={{ borderColor: "var(--line)" }}>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border"
                      style={{ borderColor: on ? color : "var(--faint)", background: on ? color : "transparent" }}>
                      {on && <Check size={13} color="var(--bg)" strokeWidth={3} />}
                    </span>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorFor(data.types, s) }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{s.title || labelFor(data.types, s)}</span>
                      <span className="block text-xs tabular-nums dl-faint">{fmtDay(s.date)}{brief(s) ? ` · ${brief(s)}` : ""}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {!wide && <button onClick={() => setWide(true)} className="mt-2 text-xs underline dl-faint">Look three weeks either side</button>}
            {linked.size > 0 && <button onClick={() => set({ sessionIds: [] })} className="ml-4 mt-2 text-xs underline dl-faint">Unlink all</button>}
          </div>
          )}

          {!isNew && (
            <button onClick={() => setConfirm(true)} className="flex items-center gap-2 px-1 text-sm" style={{ color: "#F2546B" }}>
              <Trash2 size={16} /> Delete this entry
            </button>
          )}
        </div>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className={`${card} w-full max-w-sm p-5`}>
            <div className="font-medium">Delete this entry?</div>
            <p className="mt-2 text-sm dl-muted">{fmtDay(e.date)}{e.title ? ` · ${e.title}` : ""}</p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setConfirm(false)} className="flex-1 rounded-xl border dl-line py-3 text-sm">Cancel</button>
              <button onClick={() => onDelete(e.id)} className="flex-1 rounded-xl py-3 text-sm font-medium" style={{ background: "#F2546B", color: "#fff" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- the other direction: a session's notes, on the calendar ---------- */

function SessionNotes({ data, s, onOpenEntry, onWrite }) {
  const notebooks = data.notebooks || [];
  const linked = (data.entries || []).filter((e) => (e.sessionIds || []).includes(s.id));
  const trips = notebooks.filter((n) => n.kind === "trip" && n.from && n.to && s.date >= n.from && s.date <= n.to);
  const canWrite = notebooks.some(writable);
  if (!linked.length && !trips.length && !canWrite) return null;

  return (
    <div className="mt-3 border-t dl-line pt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs dl-faint">In your notebooks</span>
        {canWrite && (
          <button onClick={() => onWrite(s)} className="flex items-center gap-1 text-xs dl-muted"><NotebookPen size={12} /> Write about it</button>
        )}
      </div>
      <div className="space-y-1.5">
        {linked.map((e) => {
          const nb = notebooks.find((n) => n.id === e.notebookId);
          if (!nb) return null;
          const line = e.title || (e.body || "").split("\n").find((l) => l.trim()) || "";
          return (
            <button key={e.id} onClick={() => onOpenEntry(e)} className="flex w-full items-center gap-2 rounded-lg border dl-line px-2.5 py-2 text-left">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: shade(nb.color) }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs dl-faint">{nb.name}</span>
                <span className="block truncate text-sm dl-muted">{line.replace(/^[#\-*\s[\]x]+/, "")}</span>
              </span>
              <ValueChips nb={nb} e={e} compact />
            </button>
          );
        })}
        {trips.filter((n) => !linked.some((e) => e.notebookId === n.id)).map((n) => (
          <button key={n.id} onClick={() => onOpenEntry({ notebookId: n.id })} className="flex w-full items-center gap-2 rounded-lg border dl-line px-2.5 py-2 text-left">
            <Mountain size={14} style={{ color: shade(n.color) }} className="shrink-0" />
            <span className="flex-1 truncate text-sm dl-muted">Part of {n.name}</span>
            <ChevronRight size={14} className="dl-faint" />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- writing: a textarea that knows about lists ---------- */

const LIST_PREFIX = /^(\s*)([-*] \[[ xX]\] |[-*] |(\d+)[.)] |#{1,3} )/;

// what to put at the start of the next line when a list line is ended
function nextPrefix(line) {
  const m = line.match(/^(\s*)([-*] \[[ xX]\] |[-*] |(\d+)([.)]) )/);
  if (!m) return null;
  if (m[3]) return `${m[1]}${Number(m[3]) + 1}${m[4]} `;
  if (/\[[ xX]\]/.test(m[2])) return `${m[1]}- [ ] `;
  return `${m[1]}- `;
}

/* The toolbar sits under the text and sticks to the bottom of the
   screen, which on a phone is just above the keyboard. Its buttons
   swallow pointerdown so the textarea keeps focus and the keyboard
   stays up. Enter on a list line starts the next item; Enter on an
   empty item ends the list — handled on the change rather than on the
   key, because Android keyboards don't reliably report Enter. */
function WriteBox({ value, onChange, rows = 9, placeholder, onBlur, autoFocus, onPhoto, onSketch }) {
  const ref = useRef(null);
  const fileRef = useRef(null);
  const text = value || "";

  // Where the caret should go once the new text is on screen. Applied in a
  // layout effect — before the next keystroke can land — rather than a
  // frame later, when fast typing would already have gone to the old spot.
  const caret = useRef(null);
  useLayoutEffect(() => {
    const want = caret.current; if (!want) return;
    caret.current = null;
    const el = ref.current; if (!el) return;
    if (document.activeElement !== el) el.focus();
    try { el.setSelectionRange(want[0], want[1]); } catch (e) { /* ignore */ }
  });
  const place = (a, b = a) => { caret.current = [a, b]; };

  const change = (next) => {
    const el = ref.current;
    const pos = el ? el.selectionStart : next.length;
    // exactly one newline typed?
    if (next.length === text.length + 1 && next[pos - 1] === "\n" && next.slice(0, pos - 1) + next.slice(pos) === text) {
      const lineStart = text.lastIndexOf("\n", pos - 2) + 1;
      const line = text.slice(lineStart, pos - 1);
      const pre = nextPrefix(line);
      if (pre) {
        const bare = line.replace(LIST_PREFIX, "").trim();
        if (!bare) {
          // an empty item: end the list instead of adding another
          const out = text.slice(0, lineStart) + text.slice(pos - 1);
          place(lineStart); onChange(out);
          return;
        }
        const out = next.slice(0, pos) + pre + next.slice(pos);
        place(pos + pre.length); onChange(out);
        return;
      }
    }
    onChange(next);
  };

  // put a prefix on every line the selection touches, or take it off if they all have it
  const toggle = (kind) => {
    const el = ref.current;
    const a = el ? el.selectionStart : text.length, b = el ? el.selectionEnd : text.length;
    const start = text.lastIndexOf("\n", a - 1) + 1;
    let end = text.indexOf("\n", b); if (end < 0) end = text.length;
    const lines = text.slice(start, end).split("\n");
    const want = { box: "- [ ] ", bullet: "- ", heading: "# " }[kind];
    const has = (l) => kind === "box" ? CHECK.test(l)
      : kind === "bullet" ? /^\s*[-*] (?!\[[ xX]\] )/.test(l)
      : /^#{1,3} /.test(l);
    const off = lines.every(has);
    const seg = lines.map((l) => {
      const indent = l.match(/^\s*/)[0];
      const bare = l.replace(LIST_PREFIX, "").replace(/^\s*/, "");
      return off ? indent + bare : indent + want + bare;
    }).join("\n");
    const out = text.slice(0, start) + seg + text.slice(end);
    onChange(out);
    if (lines.length === 1 && a === b) place(Math.max(start, a + (seg.length - (end - start))));
    else place(start, start + seg.length);
  };

  const bold = () => {
    const el = ref.current;
    const a = el ? el.selectionStart : text.length, b = el ? el.selectionEnd : text.length;
    const out = `${text.slice(0, a)}**${text.slice(a, b)}**${text.slice(b)}`;
    onChange(out);
    place(a + 2, b + 2);
  };

  const Btn = ({ onClick, label, children }) => (
    <button type="button" aria-label={label} title={label}
      onPointerDown={(e) => e.preventDefault()} onClick={onClick}
      className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-2 text-xs dl-muted" style={{ minHeight: 36 }}>
      {children}
    </button>
  );

  return (
    <div>
      <textarea ref={ref} rows={rows} autoFocus={autoFocus}
        className={`${inputCls} leading-relaxed`} style={{ fontVariantNumeric: "normal" }}
        placeholder={placeholder} value={text}
        onChange={(e) => change(e.target.value)} onBlur={onBlur} />
      <div className="dl-surface sticky bottom-0 z-10 -mx-1 mt-1 flex items-center gap-0 overflow-x-auto whitespace-nowrap border-t dl-line px-0.5 pt-1">
        <Btn onClick={() => toggle("box")} label="Tick box"><SquareCheck size={16} /> Box</Btn>
        <Btn onClick={() => toggle("bullet")} label="Bullet list"><List size={16} /> List</Btn>
        <Btn onClick={() => toggle("heading")} label="Heading"><Heading size={16} /></Btn>
        <Btn onClick={bold} label="Bold"><Bold size={16} /></Btn>
        {(onPhoto || onSketch) && <span className="mx-0.5 h-5 w-px shrink-0" style={{ background: "var(--line)" }} />}
        {onPhoto && (
          <>
            <Btn onClick={() => fileRef.current && fileRef.current.click()} label="Add a photo"><ImagePlus size={16} /> Photo</Btn>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden
              onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ""; if (fs.length) onPhoto(fs); }} />
          </>
        )}
        {onSketch && <Btn onClick={onSketch} label="Draw"><PenTool size={16} /> Draw</Btn>}
      </div>
    </div>
  );
}

/* ---------- sketches: stored as strokes, not pixels ---------- */

/* A drawing is a list of strokes in a fixed 1000 × 750 space. Stored
   that way it is a few kilobytes instead of a few hundred, it stays
   sharp at any size, and strokes drawn in "ink" follow the theme — a
   sketch made on the dark theme is still readable on the light one. */
const SK_W = 1000, SK_H = 750;
const SK_WIDTHS = [4, 9, 18];

function strokePath(p) {
  if (!p || p.length < 2) return "";
  if (p.length < 6) return `M${p[0]},${p[1]} L${p[p.length - 2] + 0.1},${p[p.length - 1]}`;
  let d = `M${p[0]},${p[1]}`;
  for (let i = 2; i < p.length - 2; i += 2) {
    const mx = (p[i] + p[i + 2]) / 2, my = (p[i + 1] + p[i + 3]) / 2;
    d += ` Q${p[i]},${p[i + 1]} ${mx},${my}`;
  }
  return d + ` L${p[p.length - 2]},${p[p.length - 1]}`;
}

function SketchView({ strokes, className = "", style }) {
  return (
    <svg viewBox={`0 0 ${SK_W} ${SK_H}`} className={className} style={style} aria-label="Sketch" role="img">
      {(strokes || []).map((s, i) => (
        <path key={i} d={strokePath(s.p)} fill="none" stroke={s.c === "ink" ? "var(--text)" : s.c}
          strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

function SketchSheet({ initial, onSave, onClose, onDelete }) {
  const [strokes, setStrokes] = useState(() => (initial?.strokes || []).map((s) => ({ ...s, p: [...s.p] })));
  const [color, setColor] = useState("ink");
  const [width, setWidth] = useState(1);
  const [erase, setErase] = useState(false);
  const live = useRef(null);
  const svg = useRef(null);
  const [, bump] = useState(0);
  const inks = ["ink", "#FF5C5C", "#F2A23C", "#F2C230", "#4BE37A", "#3FA9E0", "#B57BE0"];

  const at = (e) => {
    const r = svg.current.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * SK_W), Math.round(((e.clientY - r.top) / r.height) * SK_H)];
  };

  // the stroke eraser removes whole strokes it passes over — easier with a finger than rubbing out pixels
  const rub = ([x, y]) => setStrokes((ss) => ss.filter((s) => {
    for (let i = 0; i < s.p.length; i += 2) if (Math.hypot(s.p[i] - x, s.p[i + 1] - y) < 18 + s.w / 2) return false;
    return true;
  }));

  const down = (e) => {
    e.preventDefault();
    try { svg.current.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const pt = at(e);
    if (erase) { live.current = { erase: true }; rub(pt); return; }
    live.current = { c: color, w: SK_WIDTHS[width], p: [...pt] };
    bump((n) => n + 1);
  };
  const move = (e) => {
    const l = live.current; if (!l) return;
    const pt = at(e);
    if (l.erase) { rub(pt); return; }
    const n = l.p.length;
    if (Math.hypot(l.p[n - 2] - pt[0], l.p[n - 1] - pt[1]) < 4) return; // thin out: a finger reports far more points than a line needs
    l.p.push(pt[0], pt[1]);
    bump((k) => k + 1);
  };
  const up = () => {
    const l = live.current; live.current = null;
    if (l && !l.erase) setStrokes((ss) => [...ss, l]);
  };

  const shown = live.current && !live.current.erase ? [...strokes, live.current] : strokes;

  return (
    <div className="dl-root dl-bg dl-text fixed inset-0 z-[60] overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 pb-10">
        <div className="dl-bg sticky top-0 z-10 flex items-center justify-between border-b dl-line py-4">
          <button onClick={onClose} className="dl-muted">Cancel</button>
          <span className="font-medium">{initial ? "Sketch" : "New sketch"}</span>
          <button disabled={!strokes.length} onClick={() => onSave({ id: initial?.id || uid(), kind: "sketch", strokes })}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${strokes.length ? "dl-accent" : "dl-faint"}`}>
            <Check size={16} /> Done
          </button>
        </div>

        <div className="pt-4">
          <svg ref={svg} viewBox={`0 0 ${SK_W} ${SK_H}`} className="block w-full rounded-2xl border dl-line dl-surface"
            style={{ touchAction: "none", aspectRatio: `${SK_W} / ${SK_H}`, cursor: erase ? "cell" : "crosshair" }}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}>
            {shown.map((s, i) => (
              <path key={i} d={strokePath(s.p)} fill="none" stroke={s.c === "ink" ? "var(--text)" : s.c}
                strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </svg>

          <div className={`${card} mt-3 space-y-3 p-3`}>
            <div className="flex flex-wrap items-center gap-2">
              {inks.map((c) => (
                <button key={c} onClick={() => { setColor(c); setErase(false); }} aria-label={c === "ink" ? "Ink" : c}
                  className="h-8 w-8 rounded-full border dl-line"
                  style={{ background: c === "ink" ? "var(--text)" : c, outline: !erase && color === c ? "2px solid var(--text)" : "none", outlineOffset: 2 }} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {SK_WIDTHS.map((w, i) => (
                <button key={w} onClick={() => { setWidth(i); setErase(false); }} aria-label={["Fine", "Medium", "Thick"][i]}
                  className="flex h-9 w-12 items-center justify-center rounded-lg border"
                  style={{ borderColor: !erase && width === i ? "var(--text)" : "var(--line)" }}>
                  <span className="rounded-full" style={{ width: 24, height: Math.max(2, w / 2.2), background: color === "ink" ? "var(--text)" : color }} />
                </button>
              ))}
              <span className="flex-1" />
              <button onClick={() => setErase(!erase)} aria-label="Eraser"
                className="flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs"
                style={{ borderColor: erase ? "var(--text)" : "var(--line)", color: erase ? "var(--text)" : "var(--muted)" }}>
                <Eraser size={16} /> Erase
              </button>
              <button onClick={() => setStrokes((ss) => ss.slice(0, -1))} disabled={!strokes.length} aria-label="Undo"
                className="flex h-9 items-center rounded-lg border dl-line px-2.5 dl-muted"><Undo2 size={16} /></button>
            </div>
          </div>

          {onDelete && (
            <button onClick={onDelete} className="mt-4 flex items-center gap-2 px-1 text-sm" style={{ color: "#F2546B" }}>
              <Trash2 size={16} /> Remove this sketch
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- photos and sketches under the text ---------- */

function usePhoto(id) {
  const [url, setUrl] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!id) return undefined;
    let live = true;
    photoURL(id).then((u) => { if (!live) return; if (u) setUrl(u); else setMissing(true); }).catch(() => live && setMissing(true));
    return () => { live = false; };
  }, [id]);
  return { url, missing };
}

function Thumb({ a, onClick, onRemove }) {
  const photo = usePhoto(a.kind === "photo" ? a.id : null);
  return (
    <div className="relative">
      <button type="button" onClick={(e) => { e.stopPropagation(); onClick && onClick(a); }}
        className="block w-full overflow-hidden rounded-xl border dl-line dl-field" style={{ aspectRatio: "1 / 1" }}>
        {a.kind === "sketch"
          ? <SketchView strokes={a.strokes} className="h-full w-full" />
          : photo.url
            ? <img src={photo.url} alt="" className="h-full w-full object-cover" />
            : <span className="flex h-full w-full items-center justify-center p-2 text-center text-xs dl-faint">
                {photo.missing ? "Photo not on this device yet" : "Loading…"}
              </span>}
      </button>
      {onRemove && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(a); }} aria-label="Remove"
          className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full"
          style={{ background: "rgba(0,0,0,0.65)", color: "#fff" }}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function Attachments({ items, onOpen, onRemove }) {
  if (!items || !items.length) return null;
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {items.map((a) => <Thumb key={a.id} a={a} onClick={onOpen} onRemove={onRemove} />)}
    </div>
  );
}

function Lightbox({ a, onClose }) {
  const photo = usePhoto(a.kind === "photo" ? a.id : null);
  const [orig, setOrig] = useState(null); // null | "loading" | "failed"
  const mb = !a.bytes ? "" : a.bytes < 1048576 ? `${Math.max(1, Math.round(a.bytes / 1024))} kB` : `${round(a.bytes / 1048576, 1)} MB`;

  // what the app shows is the small copy; the original is only fetched on request
  const openOriginal = async (e) => {
    e.stopPropagation();
    setOrig("loading");
    try {
      const u = await originalURL(a);
      if (!u) { setOrig("failed"); return; }
      const link = document.createElement("a");
      link.href = u; link.download = (a.original || "").split("/").pop() || "photo.jpg";
      document.body.appendChild(link); link.click(); link.remove();
      setOrig(null);
    } catch (err) { setOrig("failed"); }
  };

  return (
    // the viewer sits inside a note card, and a click must not travel on and open the note's editor
    <div className="dl-root fixed inset-0 z-[70] flex flex-col items-center justify-center gap-3 p-3" style={{ background: "rgba(0,0,0,0.92)" }}
      onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <button onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}>
        <X size={20} />
      </button>
      {a.kind === "sketch"
        ? <div className="w-full max-w-2xl rounded-2xl dl-surface p-2"><SketchView strokes={a.strokes} className="block w-full" /></div>
        : photo.url ? <img src={photo.url} alt="" className="max-h-[80%] max-w-full rounded-lg object-contain" /> : <span className="text-sm" style={{ color: "#fff" }}>Loading…</span>}
      {a.kind === "photo" && a.original && (
        <div className="flex items-center gap-3 text-xs" style={{ color: "rgba(255,255,255,0.7)" }} onClick={(e) => e.stopPropagation()}>
          <span>{originalPending(a.id) ? `Original ${mb} · waiting to upload` : `Original ${mb} · kept on GitHub`}</span>
          <button onClick={openOriginal} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5" style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}>
            <Download size={14} /> {orig === "loading" ? "Fetching…" : orig === "failed" ? "Not reachable" : "Save original"}
          </button>
        </div>
      )}
    </div>
  );
}

/* Owns the sketch sheet and the viewer for whatever it wraps, so every
   place that shows attachments behaves the same. */
function useAttachmentTools(items, setItems) {
  const [sketch, setSketch] = useState(null); // {a} or {} for new
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const list = items || [];

  const addPhotos = async (files) => {
    setBusy(true); setErr(null);
    try {
      const added = [];
      for (const f of files) added.push(await addPhoto(f));
      setItems([...list, ...added]);
    } catch (e) {
      setErr(e.message || "Could not add that photo.");
    } finally { setBusy(false); }
  };

  const ui = (
    <>
      {busy && <div className="mt-2 text-xs dl-faint">Preparing photo…</div>}
      {err && <div className="mt-2 text-xs" style={{ color: "#F2546B" }}>{err}</div>}
      {sketch && (
        <SketchSheet initial={sketch.a} onClose={() => setSketch(null)}
          onSave={(a) => { setItems(sketch.a ? list.map((x) => (x.id === a.id ? a : x)) : [...list, a]); setSketch(null); }}
          onDelete={sketch.a ? () => { setItems(list.filter((x) => x.id !== sketch.a.id)); setSketch(null); } : null} />
      )}
      {view && <Lightbox a={view} onClose={() => setView(null)} />}
    </>
  );

  return {
    ui,
    addPhotos,
    newSketch: () => setSketch({}),
    // in an editor a sketch opens for editing; a photo opens to look at
    open: (a) => (a.kind === "sketch" ? setSketch({ a }) : setView(a)),
    look: (a) => setView(a),
    remove: (a) => setItems(list.filter((x) => x.id !== a.id)),
  };
}

// read-only attachments with their own viewer, for cards
function AttachmentStrip({ items }) {
  const [view, setView] = useState(null);
  if (!items || !items.length) return null;
  return (
    <>
      <Attachments items={items} onOpen={setView} />
      {view && <Lightbox a={view} onClose={() => setView(null)} />}
    </>
  );
}

/* ---------- one editable document: a page, or a notebook's general notes ---------- */

function DocBody({ nb, onSave, title, empty, clamp = 0, startEditing = false }) {
  const [editing, setEditing] = useState(startEditing);
  const [shut, setShut] = useState(false); // only notes with a title can be folded away
  const [draft, setDraft] = useState(nb.body || "");
  useEffect(() => { if (!editing) setDraft(nb.body || ""); }, [nb.body, editing]);
  const commit = () => { if (draft !== (nb.body || "")) onSave({ ...nb, body: draft }); };
  const color = shade(nb.color);
  const tools = useAttachmentTools(nb.attachments, (atts) => onSave({ ...nb, body: draft, attachments: atts }));
  const hasContent = (nb.body || "").trim() || (nb.attachments || []).length;

  // a trip or journal without general notes shows only a quiet invitation
  if (!hasContent && !editing && empty) {
    return (
      <button onClick={() => setEditing(true)} className="flex w-full items-center gap-2 rounded-2xl border border-dashed dl-line px-4 py-3 text-left text-sm dl-faint">
        <Plus size={16} className="shrink-0" /> {empty}
      </button>
    );
  }

  return (
    <div className={`${card} p-4`}>
      <div className={`${shut ? "" : "mb-3"} flex items-center justify-between gap-3`}>
        {title ? (
          <button onClick={() => !editing && setShut(!shut)} aria-expanded={!shut} className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs dl-faint">
            {shut ? <ChevronRight size={16} className="shrink-0" /> : <ChevronDown size={16} className="shrink-0" />}
            <span className="text-sm font-medium dl-text">{title}</span>
            {nb.body ? <span className="truncate">edited {ago(nb.updatedAt)}</span> : null}
          </button>
        ) : (
          <span className="text-xs dl-faint">{nb.body ? `Edited ${ago(nb.updatedAt)}` : ""}</span>
        )}
        <button onClick={() => { if (editing) commit(); setShut(false); setEditing(!editing); }}
          className={`flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-sm ${editing ? "dl-accent font-medium" : "border dl-line dl-muted"}`}>
          {editing ? <><Check size={14} /> Done</> : <><Pencil size={14} /> Edit</>}
        </button>
      </div>
      {shut && !editing ? null : editing ? (
        <>
          <WriteBox value={draft} onChange={setDraft} onBlur={commit} rows={12} autoFocus
            placeholder={"Write freely, or use the buttons below for tick boxes and lists."}
            onPhoto={tools.addPhotos} onSketch={tools.newSketch} />
          <Attachments items={nb.attachments} onOpen={tools.open} onRemove={tools.remove} />
        </>
      ) : (
        <>
          <Prose text={nb.body || ""} color={color} clamp={clamp} onToggle={(i) => onSave({ ...nb, body: toggleLine(nb.body || "", i) })} />
          <Attachments items={nb.attachments} onOpen={tools.look} />
        </>
      )}
      {tools.ui}
    </div>
  );
}

/* ---------- export: a notebook as one page someone else can open ---------- */

/* One self-contained HTML file: text, chart, sketches and (if wanted)
   photos all inside it, nothing fetched from anywhere. It opens in any
   browser, prints cleanly to PDF, and can go to a physio by email or a
   message without giving them access to DayLoad. Always light, because
   it is meant to be read on someone else's screen or on paper. */

const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inlineHtml = (t) => esc(t)
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\*([^*\s][^*]*)\*/g, "<em>$1</em>");

function mdToHtml(text) {
  const out = [];
  for (const ln of String(text || "").replace(/\s+$/, "").split("\n")) {
    const c = ln.match(CHECK);
    if (c) { out.push(`<div class="li${c[2] !== " " ? " done" : ""}"><span class="box">${c[2] !== " " ? "✓" : ""}</span>${inlineHtml(c[3])}</div>`); continue; }
    const h = ln.match(/^(#{1,3}) (.*)$/);
    if (h) { out.push(`<h4>${inlineHtml(h[2])}</h4>`); continue; }
    const b = ln.match(/^\s*[-*] (.*)$/);
    if (b) { out.push(`<div class="li"><span class="dot">•</span>${inlineHtml(b[1])}</div>`); continue; }
    const n = ln.match(/^\s*(\d+)[.)] (.*)$/);
    if (n) { out.push(`<div class="li"><span class="dot">${n[1]}.</span>${inlineHtml(n[2])}</div>`); continue; }
    out.push(ln.trim() ? `<p>${inlineHtml(ln)}</p>` : `<div class="gap"></div>`);
  }
  return out.join("\n");
}

function sketchSvg(a) {
  const paths = (a.strokes || []).map((s) =>
    `<path d="${strokePath(s.p)}" fill="none" stroke="${s.c === "ink" ? "#1a1a1a" : s.c}" stroke-width="${s.w}" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
  return `<svg viewBox="0 0 ${SK_W} ${SK_H}" class="sketch">${paths}</svg>`;
}

async function photoData(id) {
  const u = await photoURL(id).catch(() => null);
  if (!u) return null;
  const blob = await (await fetch(u)).blob();
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(blob); });
}

// the same chart as the app, drawn as plain SVG so it survives printing
function chartSvg(data, nb, entries) {
  const T = trackSeries(data, nb, entries);
  if (!T) return "";
  const W = 680, H = 220, L = 28, R = 8, TOP = 10, B = 26;
  const n = T.rows.length;
  const x = (i) => L + (n === 1 ? 0 : (i / (n - 1)) * (W - L - R));
  const y = (v) => TOP + (1 - v / 10) * (H - TOP - B);
  const maxLoad = Math.max(1, ...T.rows.map((r) => r.load));
  const bw = Math.max(1, (W - L - R) / n - 1);
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">`;
  for (const v of [0, 5, 10]) svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e4e4e0"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
  if (T.met) T.rows.forEach((r, i) => {
    if (!r.load) return;
    const h = (r.load / maxLoad) * (H - TOP - B);
    svg += `<rect x="${x(i) - bw / 2}" y="${H - B - h}" width="${bw}" height="${h}" fill="#c9c9c4" opacity="0.6"/>`;
  });
  const line = (key, color, dashed) => {
    const pts = T.rows.map((r, i) => (r[key] === null || r[key] === undefined ? null : [x(i), y(r[key])])).filter(Boolean);
    if (pts.length < 1) return "";
    let s = pts.length > 1 ? `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${color}" stroke-width="${dashed ? 1.5 : 2}"${dashed ? ' stroke-dasharray="4 3"' : ""}/>` : "";
    if (!dashed) s += pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${color}"/>`).join("");
    return s;
  };
  if (T.fromKey) svg += line("sess", "#8a8a85", true);
  T.ms.forEach((m, i) => { svg += line(`m_${m.id}`, T.colors[i], false); });
  const ticks = [0, Math.floor(n / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);
  ticks.forEach((i) => { svg += `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${esc(T.rows[i].label)}</text>`; });
  svg += "</svg>";
  const legend = [
    ...T.ms.map((m, i) => `<span><i style="background:${T.colors[i]}"></i>${esc(m.name)}</span>`),
    T.fromKey ? `<span><i class="dash"></i>${esc(T.fromLabel)} from sessions</span>` : "",
    T.met ? `<span><i class="bar"></i>${esc(T.metLabel.toLowerCase())} per day</span>` : "",
  ].join("");
  return `${svg}<div class="legend">${legend}</div>${T.met || T.fromKey ? `<div class="muted small">Counting ${esc(actsLabel(data.types, T.acts))}. Values are 0–10.</div>` : ""}`;
}

function sessionLine(data, s) {
  const bits = [brief(s)];
  const ni = s.sliders?.injury;
  if (ni !== null && ni !== undefined) bits.push(`niggle ${round(ni, 1)}`);
  const rpe = s.sliders?.rpe;
  if (rpe !== null && rpe !== undefined) bits.push(`RPE ${round(rpe, 1)}`);
  return `<div class="sess"><span class="sw" style="background:${colorFor(data.types, s)}"></span>${esc(fmtDay(s.date))} · ${esc(s.title || labelFor(data.types, s))}<span class="muted"> ${esc(bits.filter(Boolean).join(" · "))}</span></div>`;
}

async function buildExport(data, nb, { photos = true } = {}) {
  const K = NB_KINDS[nb.kind] || NB_KINDS.journal;
  const list = entriesOf(data, nb.id).sort((a, b) => (a.date === b.date ? ((a.createdAt || "") < (b.createdAt || "") ? -1 : 1) : a.date < b.date ? -1 : 1));
  const ms = measuresOf(nb);
  const accent = PALETTES.soft.colors[SLOT.get(String(nb.color || "").toUpperCase()) ?? 0] || "#555";

  const atts = async (items) => {
    const out = [];
    for (const a of items || []) {
      if (a.kind === "sketch") out.push(`<figure>${sketchSvg(a)}</figure>`);
      else if (photos) { const d = await photoData(a.id); if (d) out.push(`<figure><img src="${d}" alt=""></figure>`); }
    }
    return out.length ? `<div class="atts">${out.join("")}</div>` : "";
  };

  const entryHtml = async (e, withDate = true) => {
    const vals = ms.map((m) => ({ m, v: valOf(e, m) })).filter((x) => x.v !== null)
      .map(({ m, v }) => `<span class="val">${esc(m.name)} <b>${round(v, 1)}</b></span>`).join("");
    const linked = (e.sessionIds || []).map((id) => data.sessions.find((s) => s.id === id)).filter(Boolean);
    return `<article>
      <header>${withDate ? `<time>${esc(fmtDay(e.date))} ${esc(parseISO(e.date).getFullYear())}</time>` : ""}${vals ? `<span class="vals">${vals}</span>` : ""}</header>
      ${e.title ? `<h3>${esc(e.title)}</h3>` : ""}
      ${e.body ? `<div class="body">${mdToHtml(e.body)}</div>` : ""}
      ${await atts(e.attachments)}
      ${linked.length ? `<div class="linked">${linked.map((s) => sessionLine(data, s)).join("")}</div>` : ""}
    </article>`;
  };

  let main = "";
  if ((nb.body || "").trim() || (nb.attachments || []).length) {
    main += `<section class="notes">${nb.kind === "page" ? "" : `<h2>${nb.kind === "trip" ? "Trip notes" : "Notes"}</h2>`}<div class="body">${mdToHtml(nb.body)}</div>${await atts(nb.attachments)}</section>`;
  }

  if (nb.kind === "journal") {
    if (nb.track) { const c = chartSvg(data, nb, list); if (c) main = `<section>${c}</section>` + main; }
    if (list.length) {
      main += `<h2>Entries</h2>`;
      for (const e of list) main += await entryHtml(e);
    }
  }

  if (nb.kind === "trip" && nb.from && nb.to) {
    const ss = sessionsBetween(data, nb.from, nb.to);
    const t = tripTotals(ss);
    main = `<div class="tiles"><div><b>${ss.length}</b>sessions</div><div><b>${t.km ? round(t.km, 1) : "–"}</b>km</div><div><b>${t.up ? round(t.up, 0) : "–"}</b>m climbed</div></div>` + main;
    let i = 0;
    for (let d = parseISO(nb.from); fmtISO(d) <= nb.to; d = addDays(d, 1)) {
      const iso = fmtISO(d); i++;
      const daySs = ss.filter((s) => s.date === iso);
      const dayEs = list.filter((e) => e.date === iso);
      main += `<section class="day"><h2><span style="color:${accent}">Day ${i}</span> <small>${esc(fmtDay(iso))}</small></h2>
        ${daySs.map((s) => sessionLine(data, s)).join("")}
        ${daySs.length || dayEs.length ? "" : `<p class="muted">Rest day, or nothing logged.</p>`}`;
      for (const e of dayEs) main += await entryHtml(e, false);
      main += `</section>`;
    }
    const outside = list.filter((e) => e.date < nb.from || e.date > nb.to);
    if (outside.length) { main += `<h2>Before and after</h2>`; for (const e of outside) main += await entryHtml(e); }
  }

  const sub = [K.label,
    nb.kind === "trip" && nb.from ? `${fmtDay(nb.from)} – ${fmtDay(nb.to)} ${parseISO(nb.to).getFullYear()}` : "",
    nb.kind === "journal" && list.length ? `${list.length} entries, ${fmtShort(list[0].date)} – ${fmtShort(list[list.length - 1].date)} ${parseISO(list[list.length - 1].date).getFullYear()}` : "",
  ].filter(Boolean).join(" · ");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(nb.name)}</title>
<style>
:root{--ink:#161616;--muted:#6b6b66;--line:#e4e4e0;--paper:#fbfbf9;--accent:${accent}}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 20px 56px}
.top{border-left:4px solid var(--accent);padding-left:14px;margin-bottom:28px}
h1{font-size:26px;line-height:1.2;margin:0 0 4px;text-wrap:balance}
h2{font-size:17px;margin:32px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--line)}
h2 small{font-weight:400;color:var(--muted);font-size:13px}
h3{font-size:16px;margin:4px 0}
h4{font-size:15px;margin:14px 0 4px}
p{margin:4px 0}
.muted{color:var(--muted)}.small{font-size:12px}
.gap{height:6px}
.li{display:flex;gap:8px;margin:2px 0}.li .dot{color:var(--muted);min-width:14px}
.li .box{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;margin-top:3px;flex:none;border:1.5px solid var(--muted);border-radius:3px;font-size:11px;color:#fff}
.li.done .box{background:var(--accent);border-color:var(--accent)}.li.done{color:var(--muted);text-decoration:line-through}
article{padding:14px 0;border-bottom:1px solid var(--line);break-inside:avoid}
article header{display:flex;justify-content:space-between;gap:12px;align-items:baseline;flex-wrap:wrap}
time{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
.vals{display:flex;gap:6px;flex-wrap:wrap}.val{font-size:12px;border:1px solid var(--line);border-radius:99px;padding:1px 8px;color:var(--muted)}.val b{color:var(--ink)}
.linked{margin-top:8px}
.sess{font-size:13px;margin:3px 0;font-variant-numeric:tabular-nums}.sw{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
.atts{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-top:10px}
figure{margin:0}figure img,.sketch{width:100%;border-radius:8px;border:1px solid var(--line);background:#fff;display:block}
.chart{width:100%;height:auto;font-size:11px;fill:var(--muted)}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin:6px 0 2px}
.legend i{display:inline-block;width:16px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle}
.legend i.dash{height:0;border-top:2px dashed #8a8a85}.legend i.bar{width:9px;height:9px;background:#c9c9c4}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px}
.tiles div{border:1px solid var(--line);border-radius:12px;padding:10px;text-align:center;color:var(--muted);font-size:12px}
.tiles b{display:block;font-size:22px;color:var(--ink);font-weight:500}
.day article{border-bottom:0;padding:8px 0 0}
footer{margin-top:40px;font-size:12px;color:var(--muted)}
@media print{body{background:#fff}main{padding:0}h2{break-after:avoid}}
</style></head><body><main>
<div class="top"><h1>${esc(nb.name)}</h1><div class="muted">${esc(sub)}</div></div>
${main || `<p class="muted">Nothing written yet.</p>`}
<footer>Exported from DayLoad on ${esc(fmtDay(todayISO()))} ${new Date().getFullYear()}.</footer>
</main></body></html>`;
}

function ExportSheet({ data, nb, onClose }) {
  const [photos, setPhotos] = useState(true);
  const [html, setHtml] = useState(null);
  const [msg, setMsg] = useState(null);
  const hasPhotos = [...(nb.attachments || []), ...entriesOf(data, nb.id).flatMap((e) => e.attachments || [])].some((a) => a.kind === "photo");

  useEffect(() => {
    let live = true;
    setHtml(null);
    buildExport(data, nb, { photos }).then((h) => { if (live) setHtml(h); }).catch((e) => live && setMsg(e.message || "Could not build the page."));
    return () => { live = false; };
  }, [photos]);

  const name = `${(nb.name || "notebook").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${todayISO()}.html`;
  const file = () => new File([html], name, { type: "text/html" });

  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setMsg("Saved to your downloads. Open it in any browser; print it from there for a PDF.");
  };

  // on a phone this opens the share sheet, straight to a message or an email
  const share = async () => {
    try {
      const f = file();
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: nb.name }); return; }
      download();
    } catch (e) {
      if (e && e.name === "AbortError") return;
      download();
    }
  };

  const mb = html ? new Blob([html]).size / 1048576 : 0;

  return (
    <div className="dl-root dl-bg dl-text fixed inset-0 z-50 flex flex-col">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between border-b dl-line px-4 py-4">
        <button onClick={onClose} className="dl-muted">Close</button>
        <span className="font-medium">Export</span>
        <span className="w-12" />
      </div>
      <div className="mx-auto w-full max-w-2xl space-y-3 px-4 pt-3">
        <p className="text-sm dl-muted">One page with everything in it, to send to someone who doesn't use DayLoad. It opens in any browser and prints as a PDF.</p>
        {hasPhotos && (
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Include photos <span className="dl-faint">(the small copies)</span></span>
            <input type="checkbox" className="h-5 w-5" checked={photos} onChange={(e) => setPhotos(e.target.checked)} />
          </label>
        )}
        <div className="flex gap-2">
          <button disabled={!html} onClick={share} className="dl-accent flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium">
            <Share2 size={16} /> Share
          </button>
          <button disabled={!html} onClick={download} className="flex flex-1 items-center justify-center gap-2 rounded-xl border dl-line py-3 text-sm dl-muted">
            <Download size={16} /> Save file
          </button>
        </div>
        <div className="text-xs dl-faint">{html ? `${name} · ${mb < 0.1 ? "<0.1" : round(mb, 1)} MB` : "Preparing…"}</div>
        {msg && <div className="text-xs dl-muted">{msg}</div>}
      </div>
      <div className="mx-auto mt-3 w-full max-w-2xl flex-1 px-4 pb-4">
        {html && <iframe title="Export preview" srcDoc={html} sandbox="" className="h-full w-full rounded-xl border dl-line" style={{ background: "#fbfbf9", minHeight: 300 }} />}
      </div>
    </div>
  );
}
