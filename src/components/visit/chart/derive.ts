import type { ChartView } from "@/lib/engine/encounter";

/** Everything here is derived in the component layer from the student-safe ChartView; nothing is stored. */

export type Result = ChartView["results"][number];
export type ChartArtifact = ChartView["artifacts"][number];
export type Flag = "H" | "L" | "A" | "";

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function fmtDate(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}
export const fmtShort = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;

export function daysBefore(now: Date, days: number): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - days);
  return d;
}

const UNIT: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
/** The case files date documents with phrases like "8 days ago" or "Day of visit". Returns days before today, or null if unknowable. */
export function daysAgo(s: string | undefined, now: Date): number | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  if (/^(today|day of visit|current|now|reviewed today|updated today)/.test(t)) return 0;
  if (/^yesterday/.test(t)) return 1;
  if (/^(last|past)\b/.test(t)) return null;
  const m = t.match(/(\d+)\s*(day|week|month|year)s?\s*(ago|prior)/);
  if (m) return Number(m[1]) * UNIT[m[2]];
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Math.max(0, Math.round((now.getTime() - d.getTime()) / 86400000));
  }
  return null;
}

/** Splits a free-text chart field ("A; B; C") into entries. */
export function splitList(s: string | undefined): string[] {
  if (!s) return [];
  const parts = s.includes(";") || s.includes("\n") ? s.split(/;|\n/) : s.split(/(?<=\))\s*,\s*(?=[A-Z])/);
  return parts.map((x) => x.trim()).filter(Boolean);
}

export const hasAllergy = (v: string | undefined) => !!v && !/^(none|nkda|nka|no known|not on file)/i.test(v.trim());

export function find(chart: ChartView, re: RegExp): string | undefined {
  return chart.atStart.find((x) => re.test(x.label))?.value;
}

/** "BP 118/72, HR 96, SpO2 97% (today, pre-visit intake)" to label/value pairs. */
export function parseVitals(s: string | undefined): { pairs: { k: string; v: string }[]; context: string } | null {
  if (!s) return null;
  let context = "";
  let body = s.trim();
  const tail = body.match(/\(([^()]*)\)\s*\.?$/);
  if (tail) {
    context = tail[1];
    body = body.slice(0, tail.index).trim();
  }
  const pairs: { k: string; v: string }[] = [];
  for (const part of body.split(/,\s+(?![^()]*\))/)) {
    const m = part.trim().match(/^([A-Za-z][A-Za-z0-9 /.-]{0,18}?)\s*[:=]?\s+(\d.*)$/);
    if (!m) return null;
    pairs.push({ k: m[1].trim(), v: m[2].trim() });
  }
  return pairs.length ? { pairs, context } : null;
}

/** Splits "Dr. A. Mensah, Internal Medicine (PCP, supervising)" style entries into name and role. */
export function parseTeam(entry: string): { who: string; role: string } {
  const person = (x: string) => /^(Dr\.|Mr\.|Ms\.|Mrs\.|NP\b|PA\b|RN\b)|^[A-Z][a-z]+ [A-Z][a-z]+$/.test(x.trim());
  const dash = entry.split(/\s+[-–—]\s+/);
  const head = dash[0];
  const tail = dash.slice(1);
  const comma = head.match(/^((?:Dr\.|Mr\.|Ms\.|Mrs\.|NP|PA)?\s*[A-Z][\w.' -]*?(?:\s[A-Z]\.)?\s[A-Z][\w'-]+),\s*(.+)$/);
  if (comma) return { who: comma[1].trim(), role: [comma[2], ...tail].join(" · ") };
  const paren = head.match(/^(.*?)\s*\(([^()]*)\)\s*(.*)$/);
  if (paren) {
    const [, a, b, rest] = paren;
    if (person(a)) return { who: a.trim(), role: [b, rest, ...tail].filter(Boolean).join(" · ") };
    if (person(b)) return { who: b.trim(), role: [a, rest, ...tail].filter(Boolean).join(" · ") };
    return { who: a.trim(), role: [b, rest, ...tail].filter(Boolean).join(" · ") };
  }
  return { who: head, role: tail.join(" · ") };
}

/** Review dates: show a calendar date, keep the case's own phrase as secondary text. */
export function dateParts(raw: string | undefined, now: Date): { days: number | null; label: string; sub: string } {
  const days = daysAgo(raw, now);
  // Preserve the authored date and its precision, including case-relative phrases.
  return { days, label: raw || "Not provided", sub: "" };
}

// ---------- Flowsheet grids ----------

export interface GridCol {
  key: string;
  label: string;
  sub?: string;
  days: number;
}
export interface GridRow {
  name: string;
  unit?: string;
  ref?: string;
  cells: Record<string, { v: string; flag: Flag }>;
}
export interface Grid {
  id: string;
  title: string;
  kind: "lab" | "vitals" | "other";
  cols: GridCol[];
  rows: GridRow[];
  isNew: boolean;
}

const flagOf = (s: string | undefined): Flag => {
  const t = (s || "").trim().toLowerCase();
  if (!t || /^(normal|n|ok|within)/.test(t)) return "";
  if (/^(h|high|↑|hh|crit.*high)/.test(t)) return "H";
  if (/^(l|low|↓|ll|crit.*low)/.test(t)) return "L";
  if (/^(a|abn|abnormal|critical|positive|detected)/.test(t)) return "A";
  return "";
};

const colIdx = (cols: string[], re: RegExp, fallback = -1) => {
  const i = cols.findIndex((c) => re.test(c));
  return i >= 0 ? i : fallback;
};

const panelName = (title: string) => title.replace(/\s*[-–—]\s+.*$/, "").replace(/\s*\(.*\)\s*$/, "").trim();

/** Lab tables across all released lab reports, one grid per panel, one column per collection date. */
export function labGrids(artifacts: ChartArtifact[], now: Date): Grid[] {
  const grids = new Map<string, Grid>();
  for (const a of artifacts) {
    if (!a.table || (a.type !== "lab_report" && !/^test$|component|analyte/i.test(a.table.columns[0] || ""))) continue;
    const cols = a.table.columns;
    const ni = colIdx(cols, /^(test|component|analyte|name|measure)/i, 0);
    const ri = colIdx(cols, /result|value/i, 1);
    const ui = colIdx(cols, /unit/i);
    const fi = colIdx(cols, /^(ref|normal)|range/i);
    const gi = colIdx(cols, /flag|status/i);
    if (ni === ri) continue;
    const { days, label, sub } = dateParts(a.date, now);
    const d = days ?? 9999;
    const name = panelName(a.title) || "Results";
    const g = grids.get(name) || { id: "lab:" + name, title: name, kind: "lab" as const, cols: [], rows: [], isNew: false };
    grids.set(name, g);
    const key = String(days ?? a.date ?? a.id);
    if (!g.cols.some((c) => c.key === key)) g.cols.push({ key, label, sub, days: d });
    if (a.turn > 0) g.isNew = true;
    for (const r of a.table.rows) {
      const rn = r.cells[ni];
      if (!rn) continue;
      let row = g.rows.find((x) => x.name === rn);
      if (!row) {
        row = { name: rn, unit: ui >= 0 ? r.cells[ui] : undefined, ref: fi >= 0 ? r.cells[fi] : undefined, cells: {} };
        g.rows.push(row);
      }
      row.cells[key] = { v: r.cells[ri] ?? "", flag: ((r.flag as Flag) || flagOf(gi >= 0 ? r.cells[gi] : "")) as Flag };
    }
  }
  for (const g of grids.values()) g.cols.sort((x, y) => x.days - y.days);
  return [...grids.values()];
}

/** Flowsheet-style tables (vitals logs, symptom logs) as grids; time-ordered tables are transposed so readings run across. */
export function sheetGrids(artifacts: ChartArtifact[], now: Date): Grid[] {
  const out: Grid[] = [];
  for (const a of artifacts) {
    if (!a.table || a.type === "lab_report" || a.type === "medication_list") continue;
    const c = a.table.columns;
    if (c.length < 2 || a.table.rows.length === 0) continue;
    const timeCols = c.slice(0, 2).filter((x) => /^(date|time|day|when|visit)/i.test(x)).length;
    const { days, sub } = dateParts(a.date, now);
    const isVitals = a.type === "flowsheet" || /vital|bp|blood pressure|pulse|weight|glucose/i.test(a.title);
    if (timeCols > 0 && c.length > timeCols && a.table.rows.length >= 1) {
      const cols: GridCol[] = a.table.rows.map((r, i) => ({ key: "c" + i, label: r.cells.slice(0, timeCols).join(" "), sub: i === 0 ? sub : "", days: i }));
      const rows: GridRow[] = c.slice(timeCols).map((name, j) => {
        const cells: GridRow["cells"] = {};
        a.table!.rows.forEach((r, i) => (cells["c" + i] = { v: r.cells[timeCols + j] ?? "", flag: (r.flag as Flag) || "" }));
        return { name, cells };
      });
      out.push({ id: "fs:" + a.id, title: a.title, kind: isVitals ? "vitals" : "other", cols, rows, isNew: a.turn > 0 });
    } else if (c.length === 2) {
      const key = "v";
      const rows: GridRow[] = a.table.rows.map((r) => ({ name: r.cells[0] || "", cells: { [key]: { v: r.cells[1] ?? "", flag: (r.flag as Flag) || "" } } }));
      out.push({ id: "fs:" + a.id, title: a.title, kind: isVitals ? "vitals" : "other", cols: [{ key, label: dateParts(a.date, now).label || "Value", sub, days: days ?? 0 }], rows, isNew: a.turn > 0 });
    }
  }
  return out;
}

// ---------- Ordered results ----------

export interface Component {
  name: string;
  value: string;
  unit: string;
  flag: Flag;
}

/** "Hb 8.9 g/dL (L), Hct 29% (L)" into components, or null when the result is prose. */
export function parseComponents(text: string): Component[] | null {
  const parts = text
    .trim()
    .replace(/\.$/, "")
    .split(/,\s+(?![^()]*\))|;\s+/);
  const out: Component[] = [];
  for (const part of parts) {
    const m = part.trim().match(/^(.{1,34}?)\s+([<>~≥≤]?\d[\d.,]*(?:\/\d+)?)\s*(%?)\s*(.*)$/);
    if (!m || /\d$/.test(m[1].trim()) || /\b(is|was|and|the)\b/i.test(m[1])) return null;
    let rest = m[4].trim();
    let note = "";
    const paren = rest.match(/\(([^()]*)\)\s*$/);
    if (paren) {
      note = paren[1];
      rest = rest.slice(0, paren.index).trim();
    }
    if (rest.length > 22) return null;
    out.push({ name: m[1].trim(), value: m[2] + (m[3] || ""), unit: rest, flag: flagOf(note) });
  }
  return out.length ? out : null;
}
