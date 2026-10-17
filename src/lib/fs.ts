// Native (iOS/Android) file access: app data, stored drawing PDFs, picking and sharing files.
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export interface Picked {
  name: string;
  base64(): Promise<string>;
  text(): Promise<string>;
}

const dataFile = () => new File(Paths.document, 'weld-manager-data.json');
const pdfDir = () => {
  const d = new Directory(Paths.document, 'drawings');
  if (!d.exists) d.create();
  return d;
};

export async function pickFile(type: string | string[] = '*/*'): Promise<Picked | null> {
  const res = await DocumentPicker.getDocumentAsync({ type, copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  const f = new File(a.uri);
  return { name: a.name, base64: () => f.base64(), text: () => f.text() };
}

export async function loadData(): Promise<string | null> {
  const f = dataFile();
  return f.exists ? f.text() : null;
}

let writing: Promise<void> = Promise.resolve();
export function saveData(json: string) {
  writing = writing.then(async () => {
    const tmp = new File(Paths.document, 'weld-manager-data.tmp');
    if (tmp.exists) tmp.delete();
    tmp.create();
    tmp.write(json);
    const f = dataFile();
    if (f.exists) f.delete();
    await tmp.move(f);
  }).catch(e => console.warn('save failed', e));
  return writing;
}

export async function storeBlob(name: string, b64: string) {
  const f = new File(pdfDir(), name);
  if (f.exists) f.delete();
  f.create();
  f.write(b64, { encoding: 'base64' });
}

export async function readBlob(name: string): Promise<string | null> {
  const f = new File(pdfDir(), name);
  return f.exists ? f.base64() : null;
}

export async function deleteBlob(name: string) {
  const f = new File(pdfDir(), name);
  if (f.exists) f.delete();
}

/** Write a file to cache and open the iOS share sheet (Save to Files / OneDrive / Mail / AirDrop). */
export async function shareFile(name: string, content: string, encoding: 'base64' | 'utf8', mime: string, uti?: string) {
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  f.create();
  if (encoding === 'base64') f.write(content, { encoding: 'base64' });
  else f.write(content);
  await Sharing.shareAsync(f.uri, { mimeType: mime, UTI: uti, dialogTitle: name });
}
