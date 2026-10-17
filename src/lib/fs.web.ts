// Web build (used for testing on a PC): data in localStorage, drawing PDFs in IndexedDB, exports download.
import * as DocumentPicker from 'expo-document-picker';

export interface Picked {
  name: string;
  base64(): Promise<string>;
  text(): Promise<string>;
}

const KEY = 'weld-manager-data';

function bufToB64(buf: ArrayBuffer) {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + 0x8000)));
  return btoa(s);
}

export async function pickFile(type: string | string[] = '*/*'): Promise<Picked | null> {
  const res = await DocumentPicker.getDocumentAsync({ type, multiple: false, base64: false });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  const file: Blob = (a as any).file ?? (await (await fetch(a.uri)).blob());
  return { name: a.name, base64: async () => bufToB64(await file.arrayBuffer()), text: () => file.text() };
}

export async function loadData() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export async function saveData(json: string) {
  try {
    localStorage.setItem(KEY, json);
  } catch (e) {
    console.warn('save failed', e);
  }
}

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('weld-manager', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('pdf');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await idb();
  return new Promise((res, rej) => {
    const r = fn(db.transaction('pdf', mode).objectStore('pdf'));
    r.onsuccess = () => res(r.result as T);
    r.onerror = () => rej(r.error);
  });
}
export const storeBlob = (name: string, b64: string) => tx<void>('readwrite', s => s.put(b64, name));
export const readBlob = async (name: string) => (await tx<string | undefined>('readonly', s => s.get(name))) ?? null;
export const deleteBlob = (name: string) => tx<void>('readwrite', s => s.delete(name));

export async function shareFile(name: string, content: string, encoding: 'base64' | 'utf8', mime: string) {
  const blob =
    encoding === 'base64'
      ? new Blob([Uint8Array.from(atob(content), c => c.charCodeAt(0))], { type: mime })
      : new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
