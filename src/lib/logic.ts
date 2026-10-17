import { Drawing, GroupRecord, Project, StageDef, WeldRecord, weldKey } from './types';

export const DN_OD: Record<string, number> = {
  15: 21.3, 20: 26.7, 25: 33.4, 32: 42.2, 40: 48.3, 50: 60.3, 65: 73.0, 80: 88.9, 100: 114.3, 125: 141.3,
  150: 168.3, 200: 219.1, 250: 273.1, 300: 323.9, 350: 355.6, 400: 406.4, 450: 457, 500: 508, 550: 559,
  600: 610, 650: 660, 700: 711, 750: 762, 800: 813, 850: 864, 900: 914, 1000: 1016, 1050: 1067,
  1100: 1118, 1150: 1168, 1200: 1219,
};
export const DN_LIST = Object.keys(DN_OD).map(Number).sort((a, b) => a - b).map(String);

const dnOf = (size?: string) => {
  if (!size) return 0;
  const m = /^\s*(?:DN)?\s*(\d+)\s*$/i.exec(size);
  return m && DN_OD[m[1]] ? +m[1] : 0;
};
/** Circumferential joint length in metres (π × OD). 0 if size isn't a DN. */
export const jointM = (r?: WeldRecord) => {
  const dn = dnOf(r?.size);
  return dn ? (Math.PI * DN_OD[dn]) / 1000 : 0;
};
/** Inch-diameter (NPS) — the usual welder productivity unit. */
export const inchDia = (r?: WeldRecord) => {
  const dn = dnOf(r?.size);
  return dn ? +(DN_OD[dn] / 25.4).toFixed(1) : 0;
};

export const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const today = () => iso(new Date());
export const addDays = (s: string, n: number) => {
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return iso(d);
};
export const fmtD = (s?: string) => {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  if (isNaN(+d)) return s;
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
};

export type WeldStatus = 'none' | 'fit' | 'welded' | 'ndt' | 'reject' | 'later';

/** Group a weld belongs to: its spool / assembly mark, or the drawing for structural work. */
export const groupOf = (p: Project, d: Drawing, r?: WeldRecord) => r?.group || `dwg:${d.dwg}`;
export const groupLabel = (g: string) => (g.startsWith('dwg:') ? g.slice(4) : g);

export function laterStageDone(p: Project, g: string) {
  const rec = p.groupRecs[g];
  if (!rec) return false;
  return p.stages.some(s => !s.auto && rec.stages[s.key]);
}

export function statusOf(p: Project, d: Drawing, r?: WeldRecord): WeldStatus {
  if (!r) return 'none';
  if (r.ndt === 'reject') return 'reject';
  if (r.weldDate && laterStageDone(p, groupOf(p, d, r))) return 'later';
  if (r.ndt === 'accept' || r.ndt === 'na') return r.weldDate ? 'ndt' : 'welded';
  if (r.weldDate) return 'welded';
  if (r.fitDate) return 'fit';
  return 'none';
}

export const STATUS_LABEL: Record<WeldStatus, string> = {
  none: 'Not started',
  fit: 'Fitted up',
  welded: 'Welded',
  ndt: 'NDT accepted',
  reject: 'NDT rejected',
  later: 'Hydro / later stage',
};

/** All welds belonging to a group key. */
export function weldsInGroup(p: Project, g: string) {
  const out: { d: Drawing; id: string; r?: WeldRecord }[] = [];
  for (const d of p.drawings)
    for (const w of d.welds) {
      const r = p.welds[weldKey(d.page, w.id)];
      if (groupOf(p, d, r) === g) out.push({ d, id: w.id, r });
    }
  return out;
}

const maxDate = (xs: (string | undefined)[]) => xs.filter(Boolean).sort().pop() as string | undefined;

/** Auto stage value for a group: latest date once every weld in it has reached that stage. */
export function autoStage(p: Project, g: string, s: StageDef): string | undefined {
  if (!s.auto) return undefined;
  const ws = weldsInGroup(p, g);
  if (!ws.length) return undefined;
  if (s.auto === 'fit') return ws.every(w => w.r?.fitDate) ? maxDate(ws.map(w => w.r?.fitDate)) : undefined;
  if (s.auto === 'weld') return ws.every(w => w.r?.weldDate) ? maxDate(ws.map(w => w.r?.weldDate)) : undefined;
  if (s.auto === 'ndt')
    return ws.every(w => w.r?.ndt === 'accept' || w.r?.ndt === 'na') ? maxDate(ws.map(w => w.r?.ndtDate)) : undefined;
}

/** Stage value shown for a group: manual entry wins, else auto. */
export function stageValue(p: Project, g: string, s: StageDef) {
  return p.groupRecs[g]?.stages[s.key] || autoStage(p, g, s) || '';
}

export function emptyGroupRec(): GroupRecord {
  return { stages: {} };
}

/** List of groups to show on the management sheet. Structural projects without assembly marks use drawings. */
export function sheetGroups(p: Project): { key: string; dwg: string; label: string }[] {
  if (p.groups.length) return p.groups.map(g => ({ key: g.id, dwg: g.dwg, label: g.id }));
  return p.drawings.map(d => ({ key: `dwg:${d.dwg}`, dwg: d.dwg, label: d.dwg }));
}

export interface DayAgg {
  fit: { n: number; m: number; who: Record<string, { n: number; m: number }> };
  weld: { n: number; m: number; id: number; who: Record<string, { n: number; m: number; id: number }> };
  ndtAcc: number;
  ndtRej: number;
}

export function dayAgg(p: Project, date: string): DayAgg {
  const a: DayAgg = { fit: { n: 0, m: 0, who: {} }, weld: { n: 0, m: 0, id: 0, who: {} }, ndtAcc: 0, ndtRej: 0 };
  for (const r of Object.values(p.welds)) {
    const m = jointM(r), id = inchDia(r);
    if (r.fitDate === date) {
      a.fit.n++; a.fit.m += m;
      const k = r.fitter || '(not set)';
      const w = (a.fit.who[k] ||= { n: 0, m: 0 });
      w.n++; w.m += m;
    }
    if (r.weldDate === date) {
      a.weld.n++; a.weld.m += m; a.weld.id += id;
      const k = r.welder || '(not set)';
      const w = (a.weld.who[k] ||= { n: 0, m: 0, id: 0 });
      w.n++; w.m += m; w.id += id;
    }
    if (r.ndtDate === date && r.ndt === 'accept') a.ndtAcc++;
    if (r.ndtDate === date && r.ndt === 'reject') a.ndtRej++;
  }
  return a;
}

export function projectTotals(p: Project) {
  let total = 0, fit = 0, welded = 0, ndt = 0;
  for (const d of p.drawings)
    for (const w of d.welds) {
      total++;
      const r = p.welds[weldKey(d.page, w.id)];
      if (r?.fitDate) fit++;
      if (r?.weldDate) welded++;
      if (r?.ndt === 'accept' || r?.ndt === 'na') ndt++;
    }
  return { total, fit, welded, ndt };
}

/** "HYDRO TEST" -> "Hydro test" for on-screen labels (exports keep the sheet's own wording). */
export const nice = (s: string) => (s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s);

export const uid =() => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
