import * as XLSX from 'xlsx';
import { Drawing, Group, Project, SheetSource, StageDef, WeldPoint, WeldRecord, weldKey } from './types';

// ---------- Weld-map markup (.wmproj) ----------

/** Parses the weld-map markup project: { pages: { "0": { weld_points: [{label,n,wpx,wpy,lpx,lpy}] } } } */
export function parseWmproj(text: string): Record<number, WeldPoint[]> {
  const j = JSON.parse(text);
  if (!j || typeof j.pages !== 'object') throw new Error('Not a weld-map project file (.wmproj)');
  const out: Record<number, WeldPoint[]> = {};
  for (const [k, pg] of Object.entries<any>(j.pages)) {
    const pts: WeldPoint[] = (pg?.weld_points || []).map((w: any) => ({
      id: String(w.label ?? 'W' + w.n),
      n: Number(w.n) || 0,
      x: Math.round(w.lpx ?? w.wpx),
      y: Math.round(w.lpy ?? w.wpy),
      wx: Math.round(w.wpx),
      wy: Math.round(w.wpy),
    }));
    if (pts.length) out[Number(k)] = pts;
  }
  return out;
}

// ---------- Management sheet (.xlsx) ----------

const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase();

export interface SheetImport {
  source: SheetSource;
  groups: Group[];
  stages: StageDef[];
  drawings: { dwg: string; rev?: string }[];
  /** existing dates found in the sheet: group id -> stageKey -> ISO date */
  dates: Record<string, Record<string, string>>;
  remarks: Record<string, string>;
}

const toIso = (v: unknown): string => {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(+v)) {
    const d = v;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const p = XLSX.SSF.parse_date_code(v);
    if (p) return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(s); // dd/mm/yyyy (AU)
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
};

export function parseManagementSheet(b64: string, fileName: string): SheetImport {
  const wb = XLSX.read(b64, { type: 'base64', cellDates: true });
  for (const sheetName of wb.SheetNames) {
    const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' });
    const hi = rows.findIndex(r => r.some(c => norm(c).startsWith('DRAWING')));
    if (hi < 0) continue;
    const H = rows[hi].map(norm);
    const find = (...keys: string[]) => {
      const i = H.findIndex(h => keys.some(k => h.includes(k)));
      return i >= 0 ? i : undefined;
    };
    const cols = {
      sl: find('SL', 'S/N', 'ITEM NO'),
      dwg: find('DRAWING')!,
      rev: find('REV'),
      group: find('SPOOL', 'ASSEMBLY', 'MARK'),
      qty: find('QUANTITY', 'QTY'),
      remark: find('REMARK', 'COMMENT'),
    };
    // Every other non-empty header after the identifying columns is a tracked stage.
    const fixed = new Set(Object.values(cols).filter(v => v != null) as number[]);
    const stages: StageDef[] = [];
    H.forEach((h, i) => {
      if (!h || fixed.has(i)) return;
      const auto: StageDef['auto'] = /FAB|FIT/.test(h) ? 'fit' : /WELD/.test(h) ? 'weld' : /NDT|NDE|INSPECT/.test(h) ? 'ndt' : undefined;
      stages.push({ key: 'c' + i, label: String(rows[hi][i]).trim(), col: i, auto });
    });

    const groups: Group[] = [];
    const drawings: { dwg: string; rev?: string }[] = [];
    const dates: SheetImport['dates'] = {};
    const remarks: SheetImport['remarks'] = {};
    let curDwg = '', curRev = '', curSl: any = '';
    for (let r = hi + 1; r < rows.length; r++) {
      const row = rows[r];
      const dwgCell = String(row[cols.dwg] ?? '').trim();
      const grp = cols.group != null ? String(row[cols.group] ?? '').trim() : '';
      if (norm(dwgCell).startsWith('ITEM NAME')) break; // loose-items section below the spool list
      if (dwgCell) {
        curDwg = dwgCell;
        curRev = cols.rev != null ? String(row[cols.rev] ?? '').trim() : '';
        curSl = cols.sl != null ? row[cols.sl] : '';
        if (!drawings.some(d => d.dwg === curDwg)) drawings.push({ dwg: curDwg, rev: curRev });
      } else if (cols.rev != null && row[cols.rev]) curRev = String(row[cols.rev]).trim();
      if (!grp || !curDwg) continue;
      const id = groups.some(g => g.id === grp) ? `${grp} (${curDwg.slice(-5)})` : grp;
      groups.push({ id, dwg: curDwg, sl: curSl, qty: cols.qty != null ? (row[cols.qty] as any) : '', row: r });
      for (const s of stages) {
        const d = toIso(row[s.col!]);
        if (d) (dates[id] ||= {})[s.key] = d;
      }
      if (cols.remark != null && row[cols.remark]) remarks[id] = String(row[cols.remark]);
    }
    return { source: { fileName, sheetName, headerRow: hi, cols }, groups, stages, drawings, dates, remarks };
  }
  throw new Error('No header row with "DRAWING" found in this workbook.');
}

/** Default stages for projects without a management sheet. */
export function defaultStages(type: Project['type']): StageDef[] {
  const s: StageDef[] = [
    { key: 'fab', label: 'Fabrication date', auto: 'fit' },
    { key: 'weld', label: 'Welding date', auto: 'weld' },
    { key: 'ndt', label: 'NDT date', auto: 'ndt' },
  ];
  if (type === 'piping') s.push({ key: 'hydro', label: 'Hydro test' });
  s.push({ key: 'surface', label: 'Surface treatment' }, { key: 'delivery', label: 'Delivery date' });
  return s;
}

// ---------- Weld detail file (any .xlsx/.csv with Drawing + Weld columns) ----------

const DETAIL_FIELDS: { field: keyof WeldRecord; keys: RegExp }[] = [
  { field: 'size', keys: /^(SIZE|DN|NPS|DIA|DIAMETER|PIPE SIZE|WELD SIZE)/ },
  { field: 'thk', keys: /(THK|THICK|SCH|WALL)/ },
  { field: 'material', keys: /(MATERIAL|MAT'?L|GRADE|SPEC)/ },
  { field: 'wps', keys: /^WPS/ },
  { field: 'joint', keys: /(JOINT|WELD TYPE|TYPE)/ },
  { field: 'heat1', keys: /(HEAT|HT).*(1|A)$|^HEAT NO\.?$|^HEAT$/ },
  { field: 'heat2', keys: /(HEAT|HT).*(2|B)$/ },
  { field: 'group', keys: /(SPOOL|ASSEMBLY|MARK)/ },
  { field: 'welder', keys: /WELDER/ },
  { field: 'fitter', keys: /FITTER/ },
  { field: 'weldDate', keys: /WELD.*DATE/ },
  { field: 'fitDate', keys: /FIT.*DATE/ },
];

export interface DetailResult {
  matched: number;
  unmatched: string[];
  filled: number;
  columns: string[];
  welds: Record<string, WeldRecord>;
}

/** Match each row by drawing + weld number and fill blank fields (never overwrites what's already recorded). */
export function applyWeldDetail(p: Project, b64: string, overwrite = false): DetailResult {
  const wb = XLSX.read(b64, { type: 'base64', cellDates: true });
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
  const hi = rows.findIndex(r => r.some(c => /DRAWING|DWG/.test(norm(c))) && r.some(c => /WELD|JOINT/.test(norm(c))));
  if (hi < 0) throw new Error('Need a header row with a Drawing column and a Weld/Joint number column.');
  const H = rows[hi].map(norm);
  const cDwg = H.findIndex(h => /DRAWING|DWG/.test(h));
  const cWeld = H.findIndex((h, i) => i !== cDwg && /^(WELD|JOINT)\s*(NO|NUMBER|#|ID)?\.?$/.test(h));
  const cWeld2 = cWeld >= 0 ? cWeld : H.findIndex((h, i) => i !== cDwg && /WELD|JOINT/.test(h) && !/DATE|TYPE|SIZE/.test(h));
  if (cWeld2 < 0) throw new Error('No weld number column found.');
  const map: { col: number; field: keyof WeldRecord }[] = [];
  H.forEach((h, i) => {
    if (i === cDwg || i === cWeld2) return;
    const f = DETAIL_FIELDS.find(d => d.keys.test(h) && !map.some(m => m.field === d.field));
    if (f) map.push({ col: i, field: f.field });
  });
  const dwgIdx = new Map(p.drawings.map(d => [d.dwg.replace(/\s+/g, '').toUpperCase(), d]));
  const welds = { ...p.welds };
  const res: DetailResult = { matched: 0, unmatched: [], filled: 0, columns: map.map(m => H[m.col]), welds };
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r];
    const dw = String(row[cDwg] ?? '').replace(/\s+/g, '').toUpperCase();
    let wn = String(row[cWeld2] ?? '').trim().toUpperCase();
    if (!dw || !wn) continue;
    if (/^\d+$/.test(wn)) wn = 'W' + wn;
    const d = dwgIdx.get(dw);
    const w = d?.welds.find(x => x.id.toUpperCase() === wn);
    if (!d || !w) {
      res.unmatched.push(`${row[cDwg]} ${row[cWeld2]}`);
      continue;
    }
    res.matched++;
    const k = weldKey(d.page, w.id);
    const rec: WeldRecord = { ...(welds[k] || {}) };
    for (const m of map) {
      let v: any = row[m.col];
      if (v === '' || v == null) continue;
      v = /Date$/.test(m.field) ? toIso(v) : String(v).trim();
      if (!v) continue;
      if (overwrite || !rec[m.field]) {
        (rec as any)[m.field] = v;
        res.filled++;
      }
    }
    welds[k] = rec;
  }
  return res;
}
