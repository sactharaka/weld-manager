import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { engine } from '../engine/engine';
import EngineView from '../engine/EngineView';
import { DN_LIST, fmtD, groupLabel, nice, groupOf, jointM, STATUS_LABEL, statusOf, today, WeldStatus } from '../lib/logic';
import { addPerson, addToList, updateProject, updGroups, updWelds } from '../lib/store';
import { AppData, Drawing, Project, weldKey, WeldRecord } from '../lib/types';
import { Btn, DateField, Eyebrow, Field, PickField, Row, Section, Seg, st as kst } from '../ui/kit';
import { C, GROUP_COLORS, S, STATUS_STYLE } from '../ui/theme';
import { confirm, notify } from '../ui/alert';

export type MapMode = 'view' | 'select' | 'assign' | 'add';

/** Crew used by the one-tap "today" buttons; survives tab switches. */
export const crew = { fitter: '', welder: '' };

export function commonPrefix(names: string[]) {
  if (names.length < 2) return '';
  let p = names[0];
  for (const n of names) while (!n.startsWith(p)) p = p.slice(0, -1);
  const cut = p.lastIndexOf('-');
  return cut > 0 ? p.slice(0, cut + 1) : '';
}

export function personOptions(data: AppData, role: 'welder' | 'fitter') {
  return data.people.filter(x => x.role === role).map(x => x.stamp || x.name);
}
export function personRender(data: AppData, role: 'welder' | 'fitter') {
  return (v: string) => {
    const x = data.people.find(p => p.role === role && (p.stamp === v || p.name === v));
    return x && x.stamp && x.stamp !== x.name ? `${x.stamp} — ${x.name}` : v;
  };
}
/** Remember a person typed in for the first time. */
function rememberPerson(data: AppData, role: 'welder' | 'fitter', v: string) {
  if (v && !data.people.some(p => p.role === role && (p.stamp === v || p.name === v))) addPerson({ role, name: v, stamp: role === 'welder' ? v : undefined });
}

export default function MapScreen({ p, data, visible, jump }: { p?: Project; data: AppData; visible: boolean; jump: { page: number; sel?: string[]; n: number } | null }) {
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<string[]>([]);
  const [mode, setMode] = useState<MapMode>('view');
  const [activeGroup, setActiveGroup] = useState('');
  const [q, setQ] = useState('');
  const [, force] = useState(0);

  const d: Drawing | undefined = p?.drawings[Math.min(page, (p?.drawings.length || 1) - 1)];

  useEffect(() => {
    if (jump) {
      setPage(jump.page);
      setSel(jump.sel || []);
      setMode('view');
    }
  }, [jump?.n]);
  useEffect(() => {
    setSel([]);
  }, [page, p?.id]);

  // Groups shown for this drawing: from the sheet + any assigned on its welds.
  const groups = useMemo(() => {
    if (!p || !d) return [] as string[];
    const out = p.groups.filter(g => g.dwg === d.dwg).map(g => g.id);
    for (const w of d.welds) {
      const g = p.welds[weldKey(d.page, w.id)]?.group;
      if (g && !out.includes(g)) out.push(g);
    }
    return out;
  }, [p, d]);
  const colorOf = (g?: string) => (g && groups.includes(g) ? GROUP_COLORS[groups.indexOf(g) % GROUP_COLORS.length] : '');

  // Push markers to the drawing engine.
  useEffect(() => {
    if (!p || !d) {
      engine.send({ type: 'show', page: -1, w: 1, h: 1, markers: [], empty: p ? 'Import drawings in the Data tab' : 'Create a project in the Data tab' });
      return;
    }
    const markers = d.welds.map(w => {
      const r = p.welds[weldKey(d.page, w.id)];
      let bg: string, fg: string, bd: string;
      if (mode === 'assign') {
        const c = colorOf(r?.group);
        bg = c || 'rgba(255,255,255,.9)';
        fg = c ? '#fff' : C.n800;
        bd = c ? `2px solid ${c}` : `2px dashed ${C.n600}`;
      } else ({ bg, fg, bd } = STATUS_STYLE[statusOf(p, d, r)]);
      return { id: w.id, x: w.x, y: w.y, label: w.id.replace(/^W/, ''), bg, fg, bd, ring: sel.includes(w.id) ? '#1f6feb' : '' };
    });
    engine.send({ type: 'show', page: d.page, w: d.w, h: d.h, markers, mode: mode === 'assign' ? 'select' : mode });
  }, [p, d, sel, mode, groups]);

  // Events from the drawing.
  useEffect(() => {
    return engine.on(m => {
      if (!p || !d || !visible) return;
      if (m.type === 'tap') {
        if (mode === 'assign') return assign([m.id], true);
        if (mode === 'select') setSel(s => (s.includes(m.id) ? s.filter(x => x !== m.id) : [...s, m.id]));
        else setSel(s => (s.length === 1 && s[0] === m.id ? [] : [m.id]));
      } else if (m.type === 'box') {
        if (mode === 'assign') return assign(m.ids, false);
        setSel(s => [...new Set([...s, ...m.ids])]);
      } else if (m.type === 'tapEmpty') {
        if (mode === 'view') setSel([]);
      } else if (m.type === 'add') {
        const n = Math.max(0, ...d.welds.map(w => w.n || parseInt(w.id.replace(/\D/g, '')) || 0)) + 1;
        const id = 'W' + n;
        updateProject(p.id, pp => ({ ...pp, drawings: pp.drawings.map(x => (x.page === d.page ? { ...x, welds: [...x.welds, { id, n, x: m.x, y: m.y, added: true }] } : x)) }));
        setSel([id]);
      } else if (m.type === 'zoom') force(x => x + 1);
    });
  }, [p, d, mode, activeGroup, visible]);

  function assign(ids: string[], toggle: boolean) {
    if (!p || !d) return;
    if (!activeGroup) {
      notify('Pick a spool first', 'Choose the spool / mark on the right, then tap welds.');
      return;
    }
    const keys = ids.map(id => weldKey(d.page, id));
    const allIn = toggle && keys.every(k => p.welds[k]?.group === activeGroup);
    updWelds(p.id, keys, { group: allIn ? null : activeGroup });
  }

  if (!p) return <View style={{ flex: 1 }}><EngineView style={{ flex: 1 }} /></View>;
  const prefix = commonPrefix(p.drawings.map(x => x.dwg));
  const short = (s: string) => (prefix && s.startsWith(prefix) ? s.slice(prefix.length) : s);
  const list = p.drawings.filter(x => !q || x.dwg.toUpperCase().includes(q.toUpperCase()));

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {/* Drawings */}
      <View style={ms.left}>
        <View style={{ padding: S.s3, borderBottomWidth: 2, borderBottomColor: C.divider, gap: 6 }}>
          <Eyebrow>Drawings · {p.drawings.length}</Eyebrow>
          {p.drawings.length > 12 ? (
            <TextInput style={[kst.input, { minHeight: 36 }]} placeholder="Find…" value={q} onChangeText={setQ} placeholderTextColor={C.n500} autoCapitalize="characters" />
          ) : null}
        </View>
        <ScrollView>
          {list.map(x => {
            let done = 0;
            x.welds.forEach(w => p.welds[weldKey(x.page, w.id)]?.weldDate && done++);
            const on = x.page === d?.page;
            const pct = x.welds.length ? done / x.welds.length : 0;
            return (
              <Pressable key={x.page} onPress={() => setPage(x.page)} style={[ms.dwgItem, on && { backgroundColor: C.surface, borderLeftColor: C.accent }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '700', fontSize: 14, color: C.text }} numberOfLines={1}>{short(x.dwg)}</Text>
                  <Text style={{ fontSize: 12, color: C.n700 }}>{done}/{x.welds.length}</Text>
                </View>
                <View style={{ height: 4, backgroundColor: C.n300, marginTop: 6 }}>
                  <View style={{ height: 4, width: `${pct * 100}%`, backgroundColor: C.text }} />
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Drawing */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={ms.toolbar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.s2 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontWeight: '800', fontSize: 16, color: C.text }} numberOfLines={1}>{d?.dwg ?? 'No drawings'}{d?.rev ? `  Rev ${d.rev}` : ''}</Text>
              <Text style={{ fontSize: 12, color: C.n700 }} numberOfLines={1}>{d ? `Sheet ${d.page + 1} of ${p.drawings.length} · ${d.welds.length} welds · ${groups.length} ${p.type === 'piping' ? 'spools' : 'marks'}` : ''}</Text>
            </View>
            <Btn small label="−" onPress={() => engine.send({ type: 'zoom', factor: 1 / 1.4 })} />
            <Btn small label="+" onPress={() => engine.send({ type: 'zoom', factor: 1.4 })} />
            <Btn small label="Fit" onPress={() => engine.send({ type: 'zoom', fit: true })} />
          </View>
          <Seg<MapMode>
            value={mode}
            onChange={m => { setMode(m); if (m !== 'select') setSel([]); }}
            options={[['view', 'Record'], ['select', 'Multi-select'], ['assign', p.type === 'piping' ? 'Assign spool' : 'Assign mark'], ['add', '+ Add weld']]}
          />
        </View>
        <EngineView style={{ flex: 1 }} />
        <Legend p={p} d={d} mode={mode} groups={groups} colorOf={colorOf} />
      </View>

      {/* Side panel */}
      <View style={ms.right}>
        <ScrollView keyboardShouldPersistTaps="handled">
          {!d ? (
            <Section><Text style={{ color: C.n700 }}>Go to the Data tab to import the drawing PDF and weld map.</Text></Section>
          ) : mode === 'assign' ? (
            <AssignPanel p={p} d={d} groups={groups} colorOf={colorOf} active={activeGroup} setActive={setActiveGroup} />
          ) : sel.length ? (
            <WeldPanel p={p} d={d} data={data} sel={sel} groups={groups} close={() => setSel([])} />
          ) : (
            <DrawingPanel p={p} d={d} data={data} groups={groups} colorOf={colorOf} mode={mode} />
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function Legend({ p, d, mode, groups, colorOf }: { p: Project; d?: Drawing; mode: MapMode; groups: string[]; colorOf: (g?: string) => string }) {
  if (!d) return null;
  if (mode === 'assign') {
    const un = d.welds.filter(w => !p.welds[weldKey(d.page, w.id)]?.group).length;
    return (
      <View style={ms.legend}>
        <Text style={{ fontSize: 12, color: C.n700 }}>Drag a box or tap welds to assign · {un} unassigned</Text>
      </View>
    );
  }
  const counts: Record<WeldStatus, number> = { none: 0, fit: 0, welded: 0, ndt: 0, reject: 0, later: 0 };
  d.welds.forEach(w => counts[statusOf(p, d, p.welds[weldKey(d.page, w.id)])]++);
  return (
    <View style={ms.legend}>
      {(Object.keys(counts) as WeldStatus[]).map(k => {
        const s = STATUS_STYLE[k];
        const [bw, bs, bc] = s.bd.split(' ');
        return (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: s.bg, borderWidth: parseInt(bw), borderStyle: bs as any, borderColor: bc }} />
            <Text style={{ fontSize: 12, color: C.text }}>{STATUS_LABEL[k]} <Text style={{ color: C.n700 }}>{counts[k]}</Text></Text>
          </View>
        );
      })}
    </View>
  );
}

function CrewPickers({ data }: { data: AppData }) {
  const [, set] = useState(0);
  return (
    <Section title="Today's crew">
      <Row>
        <PickField style={{ flex: 1 }} label="Fitter" value={crew.fitter} options={personOptions(data, 'fitter')} render={personRender(data, 'fitter')}
          onChange={v => { crew.fitter = v; rememberPerson(data, 'fitter', v); set(x => x + 1); }} />
        <PickField style={{ flex: 1 }} label="Welder" value={crew.welder} options={personOptions(data, 'welder')} render={personRender(data, 'welder')}
          onChange={v => { crew.welder = v; rememberPerson(data, 'welder', v); set(x => x + 1); }} />
      </Row>
    </Section>
  );
}

function DrawingPanel({ p, d, data, groups, colorOf, mode }: { p: Project; d: Drawing; data: AppData; groups: string[]; colorOf: (g?: string) => string; mode: MapMode }) {
  const recs = d.welds.map(w => p.welds[weldKey(d.page, w.id)]);
  const fit = recs.filter(r => r?.fitDate).length, wel = recs.filter(r => r?.weldDate).length, ndt = recs.filter(r => r?.ndt === 'accept').length;
  return (
    <>
      <Section title="This drawing">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {[['Welds', d.welds.length], ['Fitted up', fit], ['Welded', wel], ['NDT accepted', ndt]].map(([k, v]) => (
            <View key={k as string} style={{ width: '50%', paddingVertical: 8 }}>
              <Text style={{ fontSize: 26, fontWeight: '800', color: C.text }}>{v}</Text>
              <Text style={{ fontSize: 12, color: C.n700 }}>{k}</Text>
            </View>
          ))}
        </View>
        <Text style={{ fontSize: 14, color: C.n800, marginTop: 6 }}>
          {mode === 'add' ? 'Tap the drawing where a weld is to add the next weld number.'
            : mode === 'select' ? 'Tap welds or drag a box to select several, then record them together.'
            : 'Tap a weld number to record fit-up, welding and NDT.'}
        </Text>
      </Section>
      <CrewPickers data={data} />
      {groups.length ? (
        <Section title={p.type === 'piping' ? 'Spools on this drawing' : 'Marks on this drawing'}>
          {groups.map(g => {
            const n = d.welds.filter(w => p.welds[weldKey(d.page, w.id)]?.group === g).length;
            return (
              <View key={g} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colorOf(g) }} />
                <Text style={{ flex: 1, fontWeight: '700', color: C.text }}>{g}</Text>
                <Text style={{ color: C.n700, fontSize: 12 }}>{n} welds</Text>
              </View>
            );
          })}
        </Section>
      ) : null}
      <Section title="Drawing details">
        <Row>
          <Field style={{ flex: 2 }} label="Drawing no." value={d.dwg} onChange={v => v && updateProject(p.id, pp => ({ ...pp, drawings: pp.drawings.map(x => (x.page === d.page ? { ...x, dwg: v } : x)) }))} />
          <Field style={{ flex: 1 }} label="Rev" value={d.rev} onChange={v => updateProject(p.id, pp => ({ ...pp, drawings: pp.drawings.map(x => (x.page === d.page ? { ...x, rev: v } : x)) }))} />
        </Row>
      </Section>
    </>
  );
}

function AssignPanel({ p, d, groups, colorOf, active, setActive }: { p: Project; d: Drawing; groups: string[]; colorOf: (g?: string) => string; active: string; setActive: (g: string) => void }) {
  const [newName, setNewName] = useState('');
  const word = p.type === 'piping' ? 'spool' : 'mark';
  const unassigned = d.welds.filter(w => !p.welds[weldKey(d.page, w.id)]?.group);
  const create = () => {
    const v = newName.trim().toUpperCase();
    if (!v) return;
    if (!p.groups.some(g => g.id === v)) updateProject(p.id, pp => ({ ...pp, groups: [...pp.groups, { id: v, dwg: d.dwg }] }));
    setActive(v);
    setNewName('');
  };
  return (
    <>
      <Section title={`Assign welds to ${word}`}>
        <Text style={{ fontSize: 14, color: C.n800, marginBottom: S.s3 }}>
          1. Pick a {word} below. 2. Tap welds (tap again to remove) or drag a box around several.
        </Text>
        <View style={{ gap: 6 }}>
          {groups.map(g => {
            const n = d.welds.filter(w => p.welds[weldKey(d.page, w.id)]?.group === g).length;
            const on = g === active;
            return (
              <Pressable key={g} onPress={() => setActive(on ? '' : g)}
                style={[ms.groupBtn, { borderColor: colorOf(g) }, on && { backgroundColor: colorOf(g) }]}>
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: on ? '#fff' : C.text }}>{g}</Text>
                <Text style={{ fontSize: 13, color: on ? '#fff' : C.n700 }}>{n} welds</Text>
              </Pressable>
            );
          })}
          {!groups.length ? <Text style={{ color: C.n700 }}>No {word}s listed for this drawing yet — add one below.</Text> : null}
        </View>
      </Section>
      <Section title={`New ${word}`}>
        <Row>
          <TextInput style={[kst.input, { flex: 1 }]} value={newName} onChangeText={setNewName} placeholder={p.type === 'piping' ? 'e.g. SP59-08' : 'e.g. B12'}
            placeholderTextColor={C.n500} autoCapitalize="characters" onSubmitEditing={create} />
          <Btn label="Add" onPress={create} />
        </Row>
      </Section>
      {active && unassigned.length ? (
        <Section>
          <Btn label={`Put all ${unassigned.length} unassigned welds on ${active}`} onPress={() => updWelds(p.id, unassigned.map(w => weldKey(d.page, w.id)), { group: active })} />
        </Section>
      ) : null}
    </>
  );
}

/** Value shared by every selected record, or undefined when mixed. */
function common<K extends keyof WeldRecord>(recs: (WeldRecord | undefined)[], k: K): { v?: WeldRecord[K]; mixed: boolean } {
  const vals = new Set(recs.map(r => r?.[k] ?? ''));
  return vals.size === 1 ? { v: (recs[0]?.[k] ?? undefined) as any, mixed: false } : { mixed: true };
}

function WeldPanel({ p, d, data, sel, groups, close }: { p: Project; d: Drawing; data: AppData; sel: string[]; groups: string[]; close: () => void }) {
  const keys = sel.map(id => weldKey(d.page, id));
  const recs = keys.map(k => p.welds[k]);
  const multi = sel.length > 1;
  const t = today();
  const set = (patch: Partial<Record<keyof WeldRecord, any>>) => updWelds(p.id, keys, patch);
  const one = recs[0] || {};
  const status = multi ? `${sel.length} welds` : STATUS_LABEL[statusOf(p, d, recs[0])];
  const grps = [...new Set(recs.map(r => groupOf(p, d, r)))];
  const laterStages = p.stages.filter(s => !s.auto);

  const F = (k: keyof WeldRecord) => {
    const c = common(recs, k);
    return { value: c.mixed ? undefined : (c.v as string | undefined), placeholder: c.mixed ? '(mixed)' : undefined };
  };
  const welderR = personRender(data, 'welder');
  const fitterR = personRender(data, 'fitter');

  const allFit = recs.every(r => r?.fitDate), allWeld = recs.every(r => r?.weldDate);

  return (
    <>
      <View style={[kst.section, { flexDirection: 'row', alignItems: 'center', gap: S.s3 }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: C.text }} numberOfLines={1}>{multi ? sel.join(', ') : sel[0]}</Text>
          <Text style={{ fontSize: 12, color: C.n700 }}>{d.dwg}{!multi && one.group ? ` · ${one.group}` : ''}</Text>
        </View>
        <View style={{ backgroundColor: C.surface, paddingHorizontal: 8, paddingVertical: 4 }}><Text style={{ fontSize: 12, fontWeight: '700', color: C.text }}>{status}</Text></View>
        <Btn small kind="ghost" label="✕" onPress={close} />
      </View>

      <CrewPickers data={data} />

      <Section title="Quick record — today">
        <View style={{ gap: S.s2 }}>
          <Btn kind={allFit ? 'secondary' : 'primary'}
            label={allFit && !multi ? `Fit-up ✓ ${fmtD(one.fitDate)} · ${fitterR(one.fitter || '')}` : `Fit-up today${crew.fitter ? ' · ' + fitterR(crew.fitter) : ''}`}
            onPress={() => {
              if (!crew.fitter && !recs.every(r => r?.fitter)) return notify('Choose the fitter', 'Pick today’s fitter above first.');
              keys.forEach((k, i) => !recs[i]?.fitDate && updWelds(p.id, [k], { fitDate: t, fitter: recs[i]?.fitter || crew.fitter }));
            }} />
          <Btn kind={allFit && !allWeld ? 'primary' : 'secondary'}
            label={allWeld && !multi ? `Welded ✓ ${fmtD(one.weldDate)} · ${welderR(one.welder || '')}` : `Welded today${crew.welder ? ' · ' + welderR(crew.welder) : ''}`}
            onPress={() => {
              if (!crew.welder && !recs.every(r => r?.welder)) return notify('Choose the welder', 'Pick today’s welder above first.');
              keys.forEach((k, i) => !recs[i]?.weldDate && updWelds(p.id, [k], { weldDate: t, welder: recs[i]?.welder || crew.welder, fitDate: recs[i]?.fitDate || t, fitter: recs[i]?.fitter || crew.fitter || undefined }));
            }} />
          <Row>
            <Btn style={{ flex: 1 }} kind={allWeld && !recs.some(r => r?.ndt) ? 'primary' : 'secondary'} label="NDT accept" onPress={() => set({ ndt: 'accept', ndtDate: t })} />
            <Btn style={{ flex: 1 }} kind="danger" label="NDT reject" onPress={() => set({ ndt: 'reject', ndtDate: t })} />
          </Row>
          {laterStages.map(s => {
            const done = grps.every(g => p.groupRecs[g]?.stages[s.key]);
            return (
              <Btn key={s.key} kind="secondary"
                label={done ? `${nice(s.label)} ✓ ${fmtD(p.groupRecs[grps[0]]?.stages[s.key])}` : `${nice(s.label)} — today`}
                onPress={() => {
                  if (done) return;
                  confirm(nice(s.label), `Mark ${s.label.toLowerCase()} done today for ${grps.map(groupLabel).join(', ')} (all welds on ${grps.length > 1 ? 'them' : 'it'})?`,
                    'Mark done', () => updGroups(p.id, grps, { [s.key]: t }));
                }} />
            );
          })}
          {laterStages.length ? <Text style={{ fontSize: 12, color: C.n700 }}>Later stages apply to the whole {p.type === 'piping' ? 'spool' : 'mark / drawing'}: {grps.map(groupLabel).join(', ')}</Text> : null}
        </View>
      </Section>

      <Section title="Weld details">
        <View style={{ gap: S.s3 }}>
          <PickField label={p.type === 'piping' ? 'Spool' : 'Assembly mark'} {...F('group')} options={[...new Set([...groups, ...p.groups.map(g => g.id)])]} onChange={v => set({ group: v || null })} />
          <Row>
            <PickField style={{ flex: 1 }} label="Size" {...F('size')} options={DN_LIST} render={v => (/^\d+$/.test(v) ? 'DN' + v : v)} onChange={v => set({ size: v })} />
            <Field style={{ flex: 1 }} label="Thk (mm)" {...F('thk')} keyboard="numeric" onChange={v => set({ thk: v })} />
          </Row>
          <Row>
            <PickField style={{ flex: 1 }} label="Material" {...F('material')} options={data.lists.materials} onChange={v => { addToList('materials', v); set({ material: v }); }} />
            <PickField style={{ flex: 1 }} label="Joint" {...F('joint')} options={data.lists.joints} onChange={v => { addToList('joints', v); set({ joint: v }); }} />
          </Row>
          <PickField label="WPS" {...F('wps')} options={data.lists.wps} onChange={v => { addToList('wps', v); set({ wps: v }); }} />
          <Row>
            <Field style={{ flex: 1 }} label="Heat no. 1" {...F('heat1')} onChange={v => set({ heat1: v })} />
            <Field style={{ flex: 1 }} label="Heat no. 2" {...F('heat2')} onChange={v => set({ heat2: v })} />
          </Row>
          {!multi && jointM(one) ? <Text style={{ fontSize: 12, color: C.n700 }}>Joint length {jointM(one).toFixed(2)} m</Text> : null}
        </View>
      </Section>

      <Section title="Fit-up">
        <Row>
          <DateField style={{ flex: 1 }} label="Date" value={F('fitDate').value} onChange={v => set({ fitDate: v })} />
          <PickField style={{ flex: 1 }} label="Fitter" {...F('fitter')} options={personOptions(data, 'fitter')} render={fitterR} onChange={v => { rememberPerson(data, 'fitter', v); set({ fitter: v }); }} />
        </Row>
      </Section>
      <Section title="Welding">
        <Row>
          <DateField style={{ flex: 1 }} label="Date" value={F('weldDate').value} onChange={v => set({ weldDate: v })} />
          <PickField style={{ flex: 1 }} label="Welder" {...F('welder')} options={personOptions(data, 'welder')} render={welderR} onChange={v => { rememberPerson(data, 'welder', v); set({ welder: v }); }} />
        </Row>
      </Section>
      <Section title="NDT">
        <View style={{ gap: S.s3 }}>
          <Seg value={(F('ndt').value as string) || ''} onChange={v => set({ ndt: v, ndtDate: v && !one.ndtDate ? t : one.ndtDate })}
            options={[['', 'Pending'], ['accept', 'Accept'], ['reject', 'Reject'], ['na', 'N/A']]} />
          <Row>
            <PickField style={{ flex: 1 }} label="Method" {...F('ndtMethod')} options={data.lists.ndtMethods} onChange={v => { addToList('ndtMethods', v); set({ ndtMethod: v }); }} />
            <DateField style={{ flex: 1.3 }} label="Date" value={F('ndtDate').value} onChange={v => set({ ndtDate: v })} />
          </Row>
          <Field label="Report no." {...F('ndtReport')} onChange={v => set({ ndtReport: v })} />
        </View>
      </Section>
      <Section>
        <Field label="Remark" {...F('remark')} multiline onChange={v => set({ remark: v })} />
      </Section>
      {!multi && d.welds.find(w => w.id === sel[0])?.added ? (
        <Section>
          <Btn kind="danger" label={`Delete ${sel[0]} (added in app)`} onPress={() =>
            confirm('Delete weld', `Remove ${sel[0]} and its record?`, 'Delete', () => {
              updateProject(p.id, pp => {
                const welds = { ...pp.welds };
                delete welds[keys[0]];
                return { ...pp, welds, drawings: pp.drawings.map(x => (x.page === d.page ? { ...x, welds: x.welds.filter(w => w.id !== sel[0]) } : x)) };
              });
              close();
            }, true)} />
        </Section>
      ) : null}
      <View style={{ height: 60 }} />
    </>
  );
}

const ms = StyleSheet.create({
  left: { width: 200, borderRightWidth: 2, borderRightColor: C.divider },
  right: { width: 360, borderLeftWidth: 2, borderLeftColor: C.divider },
  dwgItem: { paddingVertical: 10, paddingHorizontal: S.s3, borderBottomWidth: 1, borderBottomColor: C.hair, borderLeftWidth: 4, borderLeftColor: 'transparent' },
  toolbar: { gap: S.s2, paddingHorizontal: S.s3, paddingVertical: S.s2, borderBottomWidth: 2, borderBottomColor: C.divider },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: S.s4, paddingHorizontal: S.s4, paddingVertical: S.s2, borderTopWidth: 2, borderTopColor: C.divider },
  groupBtn: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 12, borderWidth: 3 },
});
