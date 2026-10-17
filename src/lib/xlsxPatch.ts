// Edits cell values inside an existing .xlsx without rewriting it, so fills, fonts, borders,
// merges and column widths of the office's own sheet are kept exactly.
import * as XLSX from 'xlsx';

export type CellEdit = { r: number; c: number } & ({ kind: 'date'; iso: string } | { kind: 'str'; text: string });

function utf8Decode(u: Uint8Array) {
  let s = '';
  for (let i = 0; i < u.length; ) {
    const b = u[i++];
    if (b < 0x80) s += String.fromCharCode(b);
    else if (b < 0xe0) s += String.fromCharCode(((b & 0x1f) << 6) | (u[i++] & 0x3f));
    else if (b < 0xf0) s += String.fromCharCode(((b & 0x0f) << 12) | ((u[i++] & 0x3f) << 6) | (u[i++] & 0x3f));
    else {
      const cp = (((b & 0x07) << 18) | ((u[i++] & 0x3f) << 12) | ((u[i++] & 0x3f) << 6) | (u[i++] & 0x3f)) - 0x10000;
      s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    }
  }
  return s;
}
function utf8Encode(s: string) {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) c = 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(++i) - 0xdc00);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const serial = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
};

export function patchXlsx(b64: string, sheetName: string, edits: CellEdit[]): string {
  const cfb = XLSX.CFB.read(b64, { type: 'base64' });
  const entry = (path: string) => {
    const i = cfb.FullPaths.findIndex((p: string) => p.toLowerCase().endsWith('/' + path.toLowerCase()) || p.toLowerCase() === path.toLowerCase());
    return i >= 0 ? cfb.FileIndex[i] : null;
  };
  const read = (path: string) => {
    const e = entry(path);
    if (!e) throw new Error('Missing ' + path + ' in workbook');
    return utf8Decode(e.content instanceof Uint8Array ? e.content : new Uint8Array(e.content));
  };
  const write = (path: string, text: string) => {
    const e = entry(path)!;
    e.content = utf8Encode(text);
    e.size = e.content.length;
  };

  // Locate the worksheet part for this sheet name.
  const wbXml = read('xl/workbook.xml');
  const sm = new RegExp(`<sheet\\b[^>]*name="${esc(sheetName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`).exec(wbXml);
  if (!sm) throw new Error(`Sheet "${sheetName}" not found`);
  const rid = /r:id="([^"]+)"/.exec(sm[0])![1];
  const rels = read('xl/_rels/workbook.xml.rels');
  const target = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*/>`).exec(rels)![0].match(/Target="([^"]+)"/)![1];
  const sheetPath = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
  let xml = read(sheetPath);

  // Date cells need a style with a date number format: clone the cell's existing style and add one.
  let styles = read('xl/styles.xml');
  const xfsM = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)!;
  const xfs = xfsM[1].match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) || [];
  const added: string[] = [];
  const dateStyle = new Map<number, number>();
  const toDateStyle = (s: number) => {
    if (dateStyle.has(s)) return dateStyle.get(s)!;
    let xf = xfs[s] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
    xf = xf.replace(/numFmtId="\d+"/, 'numFmtId="14"');
    if (!/numFmtId=/.test(xf)) xf = xf.replace('<xf', '<xf numFmtId="14"');
    xf = /applyNumberFormat=/.test(xf) ? xf.replace(/applyNumberFormat="\d"/, 'applyNumberFormat="1"') : xf.replace('<xf', '<xf applyNumberFormat="1"');
    const idx = xfs.length + added.length;
    added.push(xf);
    dateStyle.set(s, idx);
    return idx;
  };

  for (const e of edits) {
    const ref = XLSX.utils.encode_cell({ r: e.r, c: e.c });
    const cellRe = new RegExp(`<c\\b[^>]*\\br="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`);
    const old = cellRe.exec(xml);
    const s = old ? +(/\bs="(\d+)"/.exec(old[0])?.[1] ?? 0) : 0;
    const cell = e.kind === 'date'
      ? `<c r="${ref}" s="${toDateStyle(s)}"><v>${serial(e.iso)}</v></c>`
      : `<c r="${ref}"${s ? ` s="${s}"` : ''} t="inlineStr"><is><t xml:space="preserve">${esc(e.text)}</t></is></c>`;
    if (old) {
      xml = xml.replace(old[0], cell);
      continue;
    }
    // Insert into the row in column order (creating the row if needed).
    const rowNo = e.r + 1;
    const rowRe = new RegExp(`<row\\b[^>]*\\br="${rowNo}"[^>]*?(?:/>|>[\\s\\S]*?</row>)`);
    const rm = rowRe.exec(xml);
    if (!rm) {
      const rows = [...xml.matchAll(/<row\b[^>]*\br="(\d+)"/g)];
      const after = rows.find(m => +m[1] > rowNo);
      const newRow = `<row r="${rowNo}">${cell}</row>`;
      xml = after ? xml.slice(0, after.index) + newRow + xml.slice(after.index) : xml.replace('</sheetData>', newRow + '</sheetData>');
      continue;
    }
    let row = rm[0];
    if (row.endsWith('/>')) row = row.slice(0, -2) + '></row>';
    const cells = [...row.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"/g)];
    const nextCell = cells.find(m => XLSX.utils.decode_col(m[1]) > e.c);
    const insertAt = nextCell ? nextCell.index! : row.lastIndexOf('</row>');
    row = row.slice(0, insertAt) + cell + row.slice(insertAt);
    xml = xml.replace(rm[0], row);
  }

  if (added.length) {
    const body = xfsM[1] + added.join('');
    const open = xfsM[0].slice(0, xfsM[0].indexOf('>') + 1).replace(/count="\d+"/, `count="${xfs.length + added.length}"`);
    styles = styles.replace(xfsM[0], open + body + '</cellXfs>');
    write('xl/styles.xml', styles);
  }
  write(sheetPath, xml);
  return XLSX.CFB.write(cfb, { fileType: 'zip', type: 'base64', compression: true });
}
