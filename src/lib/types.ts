export type ProjectType = 'piping' | 'structural';

/** A weld bubble on a drawing page. Coordinates are PDF points, top-left origin. */
export interface WeldPoint {
  id: string; // "W12"
  n: number;
  x: number; // bubble (label) position
  y: number;
  wx?: number; // actual weld location the leader points at
  wy?: number;
  added?: boolean; // created in the app rather than imported
}

export interface Drawing {
  page: number; // 0-based PDF page index
  dwg: string; // drawing number e.g. NBW-1560-M-00059
  rev?: string;
  w: number; // page size in PDF points
  h: number;
  welds: WeldPoint[];
}

/** Spool (piping) or assembly mark (structural). */
export interface Group {
  id: string; // "SP59-01"
  dwg: string;
  sl?: string | number;
  qty?: string | number;
  row?: number; // row index in imported management sheet (0-based, for write-back)
}

/** A management-sheet column the app tracks per spool / drawing. */
export interface StageDef {
  key: string; // stable key, e.g. "c6"
  label: string; // header text from the sheet
  col?: number; // column index in the sheet
  auto?: 'fit' | 'weld' | 'ndt'; // computed from weld records when every weld reaches it
}

export interface Person {
  name: string;
  stamp?: string; // welder ID / stamp
  role: 'welder' | 'fitter';
}

export type NdtResult = '' | 'accept' | 'reject' | 'na';

export interface WeldRecord {
  group?: string;
  // weld details (traceability)
  size?: string; // DN or free text
  thk?: string; // wall / plate thickness (mm)
  material?: string;
  wps?: string;
  joint?: string; // BW, FW, SO, ...
  heat1?: string;
  heat2?: string;
  // fit-up
  fitDate?: string;
  fitter?: string;
  // welding
  weldDate?: string;
  welder?: string; // stamp or name
  // NDT
  ndt?: NdtResult;
  ndtMethod?: string;
  ndtDate?: string;
  ndtReport?: string;
  remark?: string;
  updated?: string;
}

export interface GroupRecord {
  stages: Record<string, string>; // stageKey -> ISO date
  remark?: string;
}

export interface SheetSource {
  fileName: string;
  sheetName: string;
  headerRow: number;
  cols: { sl?: number; dwg: number; rev?: number; group?: number; qty?: number; remark?: number };
}

export interface Project {
  id: string;
  name: string;
  client: string;
  job: string;
  type: ProjectType;
  created: string;
  pdfName?: string; // stored PDF file name (native) / in-memory key (web)
  drawings: Drawing[];
  groups: Group[];
  stages: StageDef[];
  sheet?: SheetSource;
  sheetBlob?: string; // stored copy of the original management sheet, for write-back on export
  welds: Record<string, WeldRecord>; // key: `${page}|${weldId}`
  groupRecs: Record<string, GroupRecord>; // key: group id, or `dwg:${dwg}` for structural drawing-level
}

export interface AppData {
  version: 1;
  currentId?: string;
  projects: Project[];
  people: Person[];
  lists: { materials: string[]; wps: string[]; joints: string[]; ndtMethods: string[] };
}

export const weldKey = (page: number, id: string) => `${page}|${id}`;
