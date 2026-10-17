export const C = {
  bg: '#f3f2f2',
  surface: '#eae9e9',
  text: '#201e1d',
  accent: '#ec3013',
  accent100: '#fff2ef',
  accent200: '#ffe0d9',
  accent700: '#ae1800',
  accent800: '#7c1405',
  n300: '#d7d3d3',
  n400: '#bab6b6',
  n500: '#9b9797',
  n600: '#7d7979',
  n700: '#605d5d',
  n800: '#444141',
  divider: 'rgba(32,30,29,0.4)',
  hair: 'rgba(32,30,29,0.15)',
  white: '#ffffff',
  ok: '#1d7a3a',
};

export const S = { s1: 4, s2: 8, s3: 12, s4: 16, s6: 24, s8: 32 };

/** Distinct colours for spools / assembly marks on one drawing. */
export const GROUP_COLORS = ['#1f6feb', '#d97706', '#0f9d58', '#9333ea', '#db2777', '#0891b2', '#65a30d', '#b45309', '#4f46e5', '#be123c', '#0d9488', '#7c3aed'];

import type { WeldStatus } from '../lib/logic';
export const STATUS_STYLE: Record<WeldStatus, { bg: string; fg: string; bd: string }> = {
  none: { bg: 'rgba(255,255,255,.9)', fg: C.n800, bd: `2px solid ${C.n500}` },
  fit: { bg: C.bg, fg: C.text, bd: `3px solid ${C.text}` },
  welded: { bg: C.text, fg: C.bg, bd: `2px solid ${C.text}` },
  ndt: { bg: C.accent, fg: '#fff', bd: `2px solid ${C.accent}` },
  reject: { bg: C.accent100, fg: C.accent800, bd: `3px dashed ${C.accent}` },
  later: { bg: C.accent800, fg: '#fff', bd: `2px solid ${C.accent800}` },
};
