import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { fmtD, groupLabel, nice, sheetGroups, stageValue, today, weldsInGroup } from '../lib/logic';
import { updGroups, updWelds } from '../lib/store';
import { AppData, Project, weldKey } from '../lib/types';
import { notify } from '../ui/alert';
import { Btn, DateField, Field, PickField, Section, st as kst } from '../ui/kit';
import { C, S } from '../ui/theme';
import { commonPrefix, crew, personOptions, personRender } from './MapScreen';

export default function SheetScreen({ p, data, openOnMap }: { p: Project; data: AppData; openOnMap: (page: number, sel: string[]) => void }) {
  const [dwg, setDwg] = useState('all');
  const [q, setQ] = useState('');
  const [selKey, setSelKey] = useState<string | null>(null);
  const [, force] = useState(0);
  const rows = useMemo(() => sheetGroups(p), [p]);
  const dwgs = [...new Set(rows.map(r => r.dwg))];
  const prefix = commonPrefix(dwgs);
  const short = (s: string) => (prefix && s.startsWith(prefix) ? s.slice(prefix.length) : s);
  const shown = rows.filter(r => (dwg === 'all' || r.dwg === dwg) && (!q || r.label.toUpperCase().includes(q.toUpperCase()) || r.dwg.toUpperCase().includes(q.toUpperCase())));
  const stageW = 92;

  const sel = selKey ? rows.find(r => r.key === selKey) : undefined;
  const selW = sel ? weldsInGroup(p, sel.key) : [];

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={sh.bar}>
          <Text style={{ fontWeight: '800', fontSize: 18, color: C.text, marginRight: 'auto' }}>
            {p.type === 'piping' ? 'Spool' : 'Structure'} management sheet
          </Text>
          <TextInput style={[kst.input, { width: 180, minHeight: 36 }]} placeholder="Find spool / drawing" placeholderTextColor={C.n500} value={q} onChangeText={setQ} autoCapitalize="characters" />
          <PickField style={{ width: 200 }} value={dwg === 'all' ? '' : dwg} placeholder={`All drawings (${rows.length})`} options={dwgs} allowCustom={false} onChange={v => setDwg(v || 'all')} />
        </View>
        <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={{ flexDirection: 'column' }}>
          <View style={[sh.tr, sh.th]}>
            <Text style={[sh.td, sh.thT, { width: 90 }]}>Drawing</Text>
            {p.groups.length ? <Text style={[sh.td, sh.thT, { width: 120 }]}>{p.type === 'piping' ? 'Spool' : 'Mark'}</Text> : null}
            <Text style={[sh.td, sh.thT, { width: 120 }]}>Welds fit / weld / NDT</Text>
            {p.stages.map(s => <Text key={s.key} style={[sh.td, sh.thT, { width: stageW }]} numberOfLines={2}>{nice(s.label)}{s.auto ? ' *' : ''}</Text>)}
            <Text style={[sh.td, sh.thT, { width: 200 }]}>Remark</Text>
          </View>
          <ScrollView style={{ flex: 1 }}>
            {shown.map(r => {
              const ws = weldsInGroup(p, r.key);
              const f = ws.filter(w => w.r?.fitDate).length, wd = ws.filter(w => w.r?.weldDate).length, n = ws.filter(w => w.r?.ndt === 'accept' || w.r?.ndt === 'na').length;
              return (
                <Pressable key={r.key} onPress={() => setSelKey(r.key)} style={[sh.tr, r.key === selKey && { backgroundColor: C.accent100 }]}>
                  <Text style={[sh.td, { width: 90, color: C.n700 }]} numberOfLines={1}>{short(r.dwg)}</Text>
                  {p.groups.length ? <Text style={[sh.td, { width: 120, fontWeight: '700' }]} numberOfLines={1}>{r.key.startsWith('dwg:') ? '—' : r.label}</Text> : null}
                  <Text style={[sh.td, { width: 120 }]}>{ws.length ? `${f} / ${wd} / ${n} of ${ws.length}` : '—'}</Text>
                  {p.stages.map(s => {
                    const manual = p.groupRecs[r.key]?.stages[s.key];
                    const v = stageValue(p, r.key, s);
                    return <Text key={s.key} style={[sh.td, { width: stageW, color: manual ? C.text : C.n600 }]}>{fmtD(v)}</Text>;
                  })}
                  <Text style={[sh.td, { width: 200 }]} numberOfLines={1}>{p.groupRecs[r.key]?.remark || ''}</Text>
                </Pressable>
              );
            })}
            {!shown.length ? <Text style={{ padding: S.s4, color: C.n700 }}>Nothing to show. Import a management sheet or drawings in the Data tab.</Text> : null}
          </ScrollView>
        </ScrollView>
        <Text style={{ fontSize: 12, color: C.n700, padding: S.s2, paddingHorizontal: S.s4, borderTopWidth: 2, borderTopColor: C.divider }}>
          * filled automatically once every weld on the {p.type === 'piping' ? 'spool' : 'drawing'} reaches that stage (grey). Dates you enter yourself are shown black.
        </Text>
      </View>

      {sel ? (
        <View style={sh.panel}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={[kst.section, { flexDirection: 'row', alignItems: 'center' }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: C.text }}>{groupLabel(sel.key)}</Text>
                <Text style={{ fontSize: 12, color: C.n700 }}>{sel.dwg}</Text>
              </View>
              <Btn small kind="ghost" label="✕" onPress={() => setSelKey(null)} />
            </View>
            <Section title="Welds">
              <Text style={{ fontSize: 14, color: C.text, marginBottom: S.s2 }}>
                {selW.length
                  ? `${selW.length} welds · ${selW.filter(w => w.r?.fitDate).length} fitted · ${selW.filter(w => w.r?.weldDate).length} welded · ${selW.filter(w => w.r?.ndt === 'accept').length} NDT accepted`
                  : `No welds assigned yet. Use “Assign ${p.type === 'piping' ? 'spool' : 'mark'}” on the weld map.`}
              </Text>
              {selW.length ? (
                <View style={{ gap: S.s2 }}>
                  <Btn label="Show on drawing" onPress={() => openOnMap(selW[0].d.page, selW.filter(w => w.d.page === selW[0].d.page).map(w => w.id))} />
                  <PickField label="Fitter for whole-spool fit-up" value={crew.fitter} options={personOptions(data, 'fitter')} render={personRender(data, 'fitter')}
                    onChange={v => { crew.fitter = v; force(x => x + 1); }} />
                  <Btn kind="primary" label={`Fit-up all ${selW.length} welds today`} onPress={() => {
                    if (!crew.fitter) return notify('Choose the fitter first');
                    const t = today();
                    selW.filter(w => !w.r?.fitDate).forEach(w => updWelds(p.id, [weldKey(w.d.page, w.id)], { fitDate: t, fitter: crew.fitter }));
                  }} />
                </View>
              ) : null}
            </Section>
            <Section title="Stages">
              <View style={{ gap: S.s3 }}>
                {p.stages.map(s => {
                  const manual = p.groupRecs[sel.key]?.stages[s.key];
                  const auto = stageValue(p, sel.key, s);
                  return (
                    <View key={s.key}>
                      <DateField label={nice(s.label) + (s.auto && !manual && auto ? ' (auto)' : '')} value={manual || auto}
                        onChange={v => updGroups(p.id, [sel.key], { [s.key]: v || null })} />
                    </View>
                  );
                })}
              </View>
            </Section>
            <Section>
              <Field label="Remark" multiline value={p.groupRecs[sel.key]?.remark} onChange={v => updGroups(p.id, [sel.key], {}, v)} />
            </Section>
            <View style={{ height: 60 }} />
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const sh = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: S.s3, paddingHorizontal: S.s4, paddingVertical: S.s2, borderBottomWidth: 2, borderBottomColor: C.divider },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.hair, minHeight: 40, alignItems: 'center', paddingHorizontal: S.s2 },
  th: { borderBottomWidth: 2, borderBottomColor: C.text, backgroundColor: C.bg },
  thT: { fontWeight: '800', fontSize: 12 },
  td: { paddingHorizontal: 6, fontSize: 13, color: C.text },
  panel: { width: 340, borderLeftWidth: 2, borderLeftColor: C.divider, backgroundColor: C.bg },
});
