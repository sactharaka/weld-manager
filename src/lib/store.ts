import { useSyncExternalStore } from 'react';
import { loadData, saveData } from './fs';
import { AppData, GroupRecord, Person, Project, WeldRecord } from './types';

const EMPTY: AppData = {
  version: 1,
  projects: [],
  people: [],
  lists: {
    materials: ['A106 Gr B', 'API 5L Gr B', 'AS/NZS 1163 C350', 'AS/NZS 3678 250', 'AS/NZS 3678 350', 'A312 TP316L', 'A105N'],
    wps: [],
    joints: ['BW', 'FW', 'SO', 'SW', 'BR'],
    ndtMethods: ['VT', 'MT', 'PT', 'UT', 'RT'],
  },
};

let state: AppData = EMPTY;
let loaded = false;
const subs = new Set<() => void>();
let saveTimer: any;

function emit() {
  subs.forEach(s => s());
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveData(JSON.stringify(state)), 400);
}

export async function initStore() {
  try {
    const raw = await loadData();
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.version === 1) state = { ...EMPTY, ...d, lists: { ...EMPTY.lists, ...d.lists } };
    }
  } catch (e) {
    console.warn('load failed', e);
  }
  loaded = true;
  subs.forEach(s => s());
}

export const getState = () => state;
export function useStore<T>(sel: (s: AppData) => T): T {
  return useSyncExternalStore(
    cb => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => sel(state),
  );
}
export const isLoaded = () => loaded;

export function setState(fn: (s: AppData) => AppData) {
  state = fn(state);
  emit();
}

export function currentProject(s: AppData = state): Project | undefined {
  return s.projects.find(p => p.id === s.currentId) ?? s.projects[0];
}

export function updateProject(id: string, fn: (p: Project) => Project) {
  setState(s => ({ ...s, projects: s.projects.map(p => (p.id === id ? fn(p) : p)) }));
}

/** Patch one or more weld records. `null` values clear a field. */
export function updWelds(pid: string, keys: string[], patch: Partial<Record<keyof WeldRecord, any>>) {
  const now = new Date().toISOString();
  updateProject(pid, p => {
    const welds = { ...p.welds };
    for (const k of keys) {
      const r: any = { ...(welds[k] || {}), updated: now };
      for (const [f, v] of Object.entries(patch)) {
        if (v === null || v === '') delete r[f];
        else r[f] = v;
      }
      welds[k] = r;
    }
    return { ...p, welds };
  });
}

export function updGroups(pid: string, groups: string[], stagePatch: Record<string, string | null>, remark?: string) {
  updateProject(pid, p => {
    const groupRecs = { ...p.groupRecs };
    for (const g of groups) {
      const rec: GroupRecord = { ...(groupRecs[g] || { stages: {} }) };
      rec.stages = { ...rec.stages };
      for (const [k, v] of Object.entries(stagePatch)) {
        if (v) rec.stages[k] = v;
        else delete rec.stages[k];
      }
      if (remark !== undefined) rec.remark = remark;
      groupRecs[g] = rec;
    }
    return { ...p, groupRecs };
  });
}

export function addPerson(p: Person) {
  setState(s => ({ ...s, people: [...s.people.filter(x => !(x.name === p.name && x.role === p.role)), p] }));
}
export function removePerson(p: Person) {
  setState(s => ({ ...s, people: s.people.filter(x => !(x.name === p.name && x.role === p.role)) }));
}
export function addToList(list: keyof AppData['lists'], v: string) {
  if (!v) return;
  setState(s => (s.lists[list].includes(v) ? s : { ...s, lists: { ...s.lists, [list]: [...s.lists[list], v] } }));
}
