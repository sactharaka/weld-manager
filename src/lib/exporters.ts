import * as XLSX from 'xlsx';
import { readBlob, shareFile } from './fs';
import { dayAgg, groupOf, sheetGroups, stageValue, today } from './logic';
import { AppData, Project, weldKey } from './types';
import { CellEdit, patchXlsx } from './xlsxPatch';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLSX_UTI = 'org.openxmlformats.spreadsheetml.sheet';
const r2 = (n: number) => Math.round(n * 100) / 100;

/** ISO date -> Excel date cell (serial number, no timezone shift). */
function xlDate(iso?: string): XLSX.CellObject | '' {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return { t: 'n', v: (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000, z: 'dd/mm/yyyy' };
}
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-');

function addSheet(wb: XLSX.WorkBook, name: string, aoa: unknown[][], widths: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = widths.map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

const REG_HDR = [
  'Drawing', 'Rev', 'Weld No.', 'Spool / Mark', 'Size', 'Thk (mm)', 'Material', 'Joint', 'WPS', 'Heat No. 1', 'Heat No. 2',
  'Fit-up date', 'Fitter', 'Weld date', 'Welder', 'NDT method', 'NDT result', 'NDT date', 'NDT report',
];

function registerRows(p: Project, filterDate?: string) {
  const later = p.stages.filter(s => !s.auto);
  const hdr = [...REG_HDR, ...later.map(s => s.label), 'Remark'];
  const rows: unknown[][] = [];
  for (const d of p.drawings)
    for (const w of d.welds) {
      const r = p.welds[weldKey(d.page, w.id)] || {};
      if (filterDate && ![r.fitDate, r.weldDate, r.ndtDate].includes(filterDate)) continue;
      const g = groupOf(p, d, r);
      rows.push([
        d.dwg, d.rev || '', w.id, r.group || '', r.size || '', r.thk || '', r.material || '', r.joint || '', r.wps || '',
        r.heat1 || '', r.heat2 || '', xlDate(r.fitDate), r.fitter || '', xlDate(r.weldDate), r.welder || '', r.ndtMethod || '',
        (r.ndt || '').toUpperCase(), xlDate(r.ndtDate), r.ndtReport || '',
        ...later.map(s => xlDate(stageValue(p, g, s))), r.remark || '',
      ]);
    }
  return { hdr, rows };
}
const REG_W = [20, 5, 8, 14, 8, 8, 14, 7, 10, 12, 12, 11, 16, 11, 14, 9, 9, 11, 12];

function personName(data: AppData, key: string) {
  const p = data.people.find(x => x.stamp === key || x.name === key);
  return p ? (p.stamp && p.stamp !== p.name ? `${p.name} (${p.stamp})` : p.name) : key;
}

/** Daily report for the boss: who fitted / welded what on a given day. */
export async function exportDaily(p: Project, data: AppData, date: string) {
  const wb = XLSX.utils.book_new();
  const a = dayAgg(p, date);
  addSheet(wb, 'Daily Summary', [
    ['DAILY WELDING & FIT-UP REPORT'], ['Project', p.name], ['Client', p.client], ['Job No.', p.job], ['Date', date], [],
    ['Fit-up joints', a.fit.n], ['Fit-up metres', r2(a.fit.m)], ['Welds completed', a.weld.n], ['Weld inch-dia', r2(a.weld.id)],
    ['Weld metres', r2(a.weld.m)], ['NDT accepted', a.ndtAcc], ['NDT rejected', a.ndtRej], [],
    ['WELDER', 'Welds', 'Inch-dia', 'Metres'],
    ...Object.entries(a.weld.who).map(([k, v]) => [personName(data, k), v.n, r2(v.id), r2(v.m)]),
    [],
    ['FITTER', 'Joints', 'Metres'],
    ...Object.entries(a.fit.who).map(([k, v]) => [personName(data, k), v.n, r2(v.m)]),
  ], [26, 30, 10, 10]);
  const log = registerRows(p, date);
  addSheet(wb, 'Weld Log', [log.hdr, ...log.rows], REG_W);
  const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  await shareFile(safe(`Daily Report ${p.job} ${date}.xlsx`), b64, 'base64', XLSX_MIME, XLSX_UTI);
}

/** Full weld traceability register + productivity history. */
export async function exportRegister(p: Project, data: AppData) {
  const wb = XLSX.utils.book_new();
  const reg = registerRows(p);
  addSheet(wb, 'Weld Register', [reg.hdr, ...reg.rows], REG_W);
  // productivity by day and person
  const days = new Set<string>();
  Object.values(p.welds).forEach(r => {
    if (r.fitDate) days.add(r.fitDate);
    if (r.weldDate) days.add(r.weldDate);
  });
  const prod: unknown[][] = [['Date', 'Role', 'Name', 'Count', 'Inch-dia', 'Metres']];
  [...days].sort().forEach(d => {
    const a = dayAgg(p, d);
    const dd = xlDate(d);
    Object.entries(a.fit.who).forEach(([k, v]) => prod.push([dd, 'Fitter', personName(data, k), v.n, '', r2(v.m)]));
    Object.entries(a.weld.who).forEach(([k, v]) => prod.push([dd, 'Welder', personName(data, k), v.n, r2(v.id), r2(v.m)]));
  });
  addSheet(wb, 'Productivity by Day', prod, [11, 8, 26, 7, 9, 9]);
  addSheet(wb, 'Welders', [['Name', 'Stamp / ID'], ...data.people.filter(x => x.role === 'welder').map(x => [x.name, x.stamp || ''])], [26, 12]);
  const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  await shareFile(safe(`Weld Register ${p.job} ${today()}.xlsx`), b64, 'base64', XLSX_MIME, XLSX_UTI);
}


/** Management sheet: writes stage dates back into the original layout (or builds one if none was imported). */
export async function exportManagementSheet(p: Project) {
  let wb: XLSX.WorkBook;
  const orig = p.sheetBlob ? await readBlob(p.sheetBlob) : null;
  const fileName = safe(`PROJECT MANAGEMENT ${p.job} ${today()}.xlsx`);
  if (orig && p.sheet) {
    // Preferred: edit the office's own file in place so its colours and formatting survive.
    const edits: CellEdit[] = [];
    for (const g of p.groups) {
      if (g.row == null) continue;
      for (const s of p.stages) {
        const v = s.col != null ? stageValue(p, g.id, s) : '';
        if (v) edits.push({ r: g.row, c: s.col!, kind: 'date', iso: v });
      }
      const rem = p.groupRecs[g.id]?.remark;
      if (rem && p.sheet.cols.remark != null) edits.push({ r: g.row, c: p.sheet.cols.remark, kind: 'str', text: rem });
    }
    try {
      await shareFile(fileName, patchXlsx(orig, p.sheet.sheetName, edits), 'base64', XLSX_MIME, XLSX_UTI);
      return;
    } catch (e) {
      console.warn('in-place sheet edit failed, rebuilding instead', e);
    }
  }
  if (orig && p.sheet) {
    wb = XLSX.read(orig, { type: 'base64', cellDates: true, cellStyles: true });
    const ws = wb.Sheets[p.sheet.sheetName];
    for (const g of p.groups) {
      if (g.row == null) continue;
      for (const s of p.stages) {
        if (s.col == null) continue;
        const v = stageValue(p, g.id, s);
        const ref = XLSX.utils.encode_cell({ r: g.row, c: s.col });
        if (v) ws[ref] = { ...(ws[ref] || {}), ...(xlDate(v) as XLSX.CellObject) };
      }
      const rem = p.groupRecs[g.id]?.remark;
      if (rem && p.sheet.cols.remark != null) ws[XLSX.utils.encode_cell({ r: g.row, c: p.sheet.cols.remark })] = { t: 's', v: rem };
    }
  } else {
    wb = XLSX.utils.book_new();
    const rows: unknown[][] = [
      [`PROJECT MANAGEMENT - ${p.type === 'piping' ? 'SPOOL' : 'STRUCTURE'}`], [p.name], ['CLIENT', p.client, '', 'JOB No.', p.job], [],
      ['SL.No.', 'DRAWING No.', 'Rev', p.type === 'piping' ? 'SPOOL NO.' : 'MARK', ...p.stages.map(s => s.label.toUpperCase()), 'REMARK'],
    ];
    let sl = 0, last = '';
    for (const g of sheetGroups(p)) {
      const first = g.dwg !== last;
      if (first) sl++;
      last = g.dwg;
      const rev = p.drawings.find(d => d.dwg === g.dwg)?.rev || '';
      rows.push([first ? sl : '', first ? g.dwg : '', first ? rev : '', g.key.startsWith('dwg:') ? '' : g.label,
        ...p.stages.map(s => xlDate(stageValue(p, g.key, s))), p.groupRecs[g.key]?.remark || '']);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [7, 22, 5, 16, ...p.stages.map(() => 14), 24].map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  }
  const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx', cellStyles: true });
  await shareFile(fileName, b64, 'base64', XLSX_MIME, XLSX_UTI);
}

/** Backup of one project's records (not the PDF) — move between iPads or keep on OneDrive. */
export async function exportBackup(p: Project, data: AppData) {
  const json = JSON.stringify({ kind: 'weld-manager-backup', version: 1, exported: new Date().toISOString(), project: p, people: data.people, lists: data.lists });
  await shareFile(safe(`WeldManager backup ${p.job} ${today()}.json`), json, 'utf8', 'application/json', 'public.json');
}
