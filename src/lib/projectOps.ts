import { engine } from '../engine/engine';
import { deleteBlob, Picked, readBlob, storeBlob } from './fs';
import { applyWeldDetail, defaultStages, parseManagementSheet, parseWmproj } from './importers';
import { uid } from './logic';
import { getState, setState, updateProject } from './store';
import { Drawing, Project, ProjectType } from './types';

let loadedKey: string | null = null;
// A restarted engine (e.g. WebView reloaded after iOS reclaimed memory) has no PDF open.
engine.on(m => {
  if (m.type === 'ready') loadedKey = '__none__';
});

/** Make sure the engine has this project's PDF open. */
export async function ensurePdfLoaded(p?: Project) {
  const key = p?.pdfName ?? null;
  if (key === loadedKey) return;
  loadedKey = key;
  if (!p || !key) {
    engine.send({ type: 'unload', text: p ? 'Import the drawing PDF in the Data tab' : 'Create a project in the Data tab' });
    return;
  }
  const b64 = await readBlob(key);
  if (!b64) {
    engine.send({ type: 'unload', text: 'Drawing PDF missing — import it again in the Data tab' });
    return;
  }
  const wait = engine.waitFor('pdfLoaded');
  engine.loadPdf(b64, key);
  await wait;
}

export function createProject(name: string, client: string, job: string, type: ProjectType) {
  const p: Project = {
    id: uid(), name, client, job, type, created: new Date().toISOString(),
    drawings: [], groups: [], stages: defaultStages(type), welds: {}, groupRecs: {},
  };
  setState(s => ({ ...s, projects: [...s.projects, p], currentId: p.id }));
  return p;
}

export async function deleteProject(id: string) {
  const p = getState().projects.find(x => x.id === id);
  if (p?.pdfName) await deleteBlob(p.pdfName).catch(() => {});
  if (p?.sheetBlob) await deleteBlob(p.sheetBlob).catch(() => {});
  setState(s => {
    const projects = s.projects.filter(x => x.id !== id);
    return { ...s, projects, currentId: projects[0]?.id };
  });
}

async function readDrawingNumbers(p: Project): Promise<string[]> {
  const cands = p.groups.length ? [...new Set(p.groups.map(g => g.dwg))] : undefined;
  const wait = engine.waitFor<{ dwgs: string[] }>('extracted', 300000);
  engine.send({ type: 'extract', candidates: cands });
  return (await wait).dwgs;
}

/** Import (or replace) the drawing PDF. Pages become drawings; existing welds stay on their page. */
export async function importPdf(pid: string, f: Picked, onStatus: (s: string) => void) {
  onStatus('Reading PDF…');
  const b64 = await f.base64();
  const name = `${pid}-${Date.now()}.pdf`;
  await storeBlob(name, b64);
  const old = getState().projects.find(p => p.id === pid)!;
  if (old.pdfName) deleteBlob(old.pdfName).catch(() => {});
  onStatus('Opening drawings…');
  loadedKey = name;
  const wait = engine.waitFor<{ pages: { w: number; h: number }[] }>('pdfLoaded');
  engine.loadPdf(b64, name);
  const { pages } = await wait;
  onStatus('Finding drawing numbers…');
  const tmp: Project = { ...old, pdfName: name };
  const dwgs = await readDrawingNumbers(tmp);
  const revOf = new Map(old.drawings.map(d => [d.dwg, d.rev]));
  const drawings: Drawing[] = pages.map((pg, i) => {
    const prev = old.drawings.find(d => d.page === i);
    const dwg = dwgs[i] || prev?.dwg || `Page ${i + 1}`;
    return { page: i, dwg, rev: prev?.rev ?? revOf.get(dwg), w: pg.w, h: pg.h, welds: prev?.welds ?? [] };
  });
  updateProject(pid, p => ({ ...p, pdfName: name, drawings }));
  return { pages: pages.length, found: dwgs.filter(Boolean).length };
}

export async function importWmproj(pid: string, f: Picked) {
  const pts = parseWmproj(await f.text());
  let n = 0;
  updateProject(pid, p => ({
    ...p,
    drawings: p.drawings.map(d => {
      const w = pts[d.page];
      if (!w) return d;
      n += w.length;
      const added = d.welds.filter(x => x.added && !w.some(y => y.id === x.id));
      return { ...d, welds: [...w, ...added] };
    }),
  }));
  const missing = Object.keys(pts).filter(k => !getState().projects.find(p => p.id === pid)!.drawings.some(d => d.page === +k));
  return { welds: n, pages: Object.keys(pts).length, missing: missing.length };
}

export async function importSheet(pid: string, f: Picked, onStatus: (s: string) => void) {
  onStatus('Reading management sheet…');
  const b64 = await f.base64();
  const res = parseManagementSheet(b64, f.name);
  const blobName = `${pid}-sheet.xlsx`;
  await storeBlob(blobName, b64);
  updateProject(pid, p => {
    const groupRecs = { ...p.groupRecs };
    for (const [g, ds] of Object.entries(res.dates)) {
      const rec = { ...(groupRecs[g] || { stages: {} }) };
      rec.stages = { ...ds, ...rec.stages }; // what's recorded in the app wins
      groupRecs[g] = rec;
    }
    for (const [g, r] of Object.entries(res.remarks)) groupRecs[g] = { ...(groupRecs[g] || { stages: {} }), remark: groupRecs[g]?.remark || r };
    const revs = new Map(res.drawings.map(d => [d.dwg, d.rev]));
    return {
      ...p, groups: res.groups, stages: res.stages, sheet: res.source, sheetBlob: blobName, groupRecs,
      drawings: p.drawings.map(d => ({ ...d, rev: revs.get(d.dwg) || d.rev })),
    };
  });
  // Re-read drawing numbers now that we know which ones to look for.
  const p = getState().projects.find(x => x.id === pid)!;
  let matched = 0;
  if (p.pdfName && p.drawings.length) {
    onStatus('Matching drawings to sheet…');
    await ensurePdfLoaded(p);
    const dwgs = await readDrawingNumbers(p);
    const revs = new Map(res.drawings.map(d => [d.dwg, d.rev]));
    updateProject(pid, q => ({
      ...q,
      drawings: q.drawings.map((d, i) => (dwgs[i] ? (matched++, { ...d, dwg: dwgs[i], rev: revs.get(dwgs[i]) || d.rev }) : d)),
    }));
  }
  return { groups: res.groups.length, stages: res.stages.length, drawings: res.drawings.length, matched };
}

export async function importDetail(pid: string, f: Picked, overwrite: boolean) {
  const p = getState().projects.find(x => x.id === pid)!;
  const res = applyWeldDetail(p, await f.base64(), overwrite);
  updateProject(pid, q => ({ ...q, welds: res.welds }));
  return res;
}

export async function restoreBackup(f: Picked) {
  const j = JSON.parse(await f.text());
  if (j?.kind !== 'weld-manager-backup' || !j.project) throw new Error('Not a Weld Manager backup file');
  const incoming: Project = j.project;
  setState(s => {
    const exists = s.projects.find(p => p.id === incoming.id);
    // keep the PDF already on this device if the backup came from another one
    const merged = exists ? { ...incoming, pdfName: exists.pdfName, sheetBlob: exists.sheetBlob } : { ...incoming, pdfName: undefined, sheetBlob: undefined };
    const people = [...s.people];
    for (const pe of j.people || []) if (!people.some(x => x.name === pe.name && x.role === pe.role)) people.push(pe);
    return {
      ...s, people, currentId: merged.id,
      projects: exists ? s.projects.map(p => (p.id === merged.id ? merged : p)) : [...s.projects, merged],
    };
  });
  loadedKey = '__force__';
  return incoming;
}
