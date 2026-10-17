import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { exportDaily } from '../lib/exporters';
import { addDays, dayAgg, fmtD, today } from '../lib/logic';
import { AppData, Project, weldKey } from '../lib/types';
import { notify } from '../ui/alert';
import { Btn, Eyebrow } from '../ui/kit';
import { C, S } from '../ui/theme';
import { personRender } from './MapScreen';

const r1 = (n: number) => (Math.round(n * 10) / 10).toString();

export default function DailyScreen({ p, data }: { p: Project; data: AppData }) {
  const [date, setDate] = useState(today());
  const a = dayAgg(p, date);
  const wR = personRender(data, 'welder'), fR = personRender(data, 'fitter');

  const days = Array.from({ length: 14 }, (_, i) => addDays(date, i - 13));
  const series = days.map(d => {
    const x = dayAgg(p, d);
    return { d, weld: x.weld.n, fit: x.fit.n };
  });
  const max = Math.max(1, ...series.map(s => Math.max(s.weld, s.fit)));

  const log: { dwg: string; id: string; what: string; who: string; group?: string; size?: string }[] = [];
  for (const d of p.drawings)
    for (const w of d.welds) {
      const r = p.welds[weldKey(d.page, w.id)];
      if (!r) continue;
      if (r.fitDate === date) log.push({ dwg: d.dwg, id: w.id, what: 'Fit-up', who: fR(r.fitter || ''), group: r.group, size: r.size });
      if (r.weldDate === date) log.push({ dwg: d.dwg, id: w.id, what: 'Welded', who: wR(r.welder || ''), group: r.group, size: r.size });
      if (r.ndtDate === date && r.ndt) log.push({ dwg: d.dwg, id: w.id, what: `NDT ${r.ndt.toUpperCase()}${r.ndtMethod ? ' ' + r.ndtMethod : ''}`, who: r.ndtReport || '', group: r.group, size: r.size });
    }

  const kpis = [
    { k: 'Welds completed', v: a.weld.n, sub: `${r1(a.weld.id)} inch-dia · ${r1(a.weld.m)} m` },
    { k: 'Fit-ups', v: a.fit.n, sub: `${r1(a.fit.m)} m of joint` },
    { k: 'NDT accepted', v: a.ndtAcc, sub: `${a.ndtRej} rejected` },
    { k: 'People working', v: new Set([...Object.keys(a.weld.who), ...Object.keys(a.fit.who)]).size, sub: `${Object.keys(a.weld.who).length} welders · ${Object.keys(a.fit.who).length} fitters` },
  ];

  return (
    <ScrollView style={{ flex: 1 }}>
      <View style={ds.bar}>
        <Btn small label="‹ Prev" onPress={() => setDate(addDays(date, -1))} />
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.text, minWidth: 200, textAlign: 'center' }}>
          {new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
        </Text>
        <Btn small label="Next ›" onPress={() => setDate(addDays(date, 1))} />
        {date !== today() ? <Btn small kind="ghost" label="Today" onPress={() => setDate(today())} /> : null}
        <View style={{ flex: 1 }} />
        <Btn kind="primary" label="Export this day to Excel" onPress={() => exportDaily(p, data, date).catch(e => notify('Export failed', String(e?.message || e)))} />
      </View>

      <View style={{ flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: C.divider }}>
        {kpis.map((k, i) => (
          <View key={k.k} style={[ds.kpi, i < 3 && { borderRightWidth: 2, borderRightColor: C.divider }]}>
            <Eyebrow>{k.k}</Eyebrow>
            <Text style={{ fontSize: 40, fontWeight: '800', color: i === 0 ? C.accent : C.text }}>{k.v}</Text>
            <Text style={{ fontSize: 12, color: C.n700 }}>{k.sub}</Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: C.divider }}>
        <Table title="By welder" style={{ borderRightWidth: 2, borderRightColor: C.divider }}
          head={['Welder', 'Welds', 'Inch-dia', 'Metres']}
          rows={Object.entries(a.weld.who).sort((x, y) => y[1].n - x[1].n).map(([k, v]) => [wR(k), v.n, r1(v.id), r1(v.m)])}
          empty="No welding recorded this day." />
        <Table title="By fitter" head={['Fitter', 'Joints', 'Metres']}
          rows={Object.entries(a.fit.who).sort((x, y) => y[1].n - x[1].n).map(([k, v]) => [fR(k), v.n, r1(v.m)])}
          empty="No fit-up recorded this day." />
      </View>

      <View style={{ padding: S.s4, borderBottomWidth: 2, borderBottomColor: C.divider }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: S.s3, gap: S.s4 }}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: C.text, flex: 1 }}>Last 14 days</Text>
          <Key c={C.text} l="Welds" /><Key c={C.n400} l="Fit-ups" />
        </View>
        <View style={{ flexDirection: 'row', height: 160, alignItems: 'flex-end', gap: 6, borderBottomWidth: 2, borderBottomColor: C.text }}>
          {series.map(s => (
            <View key={s.d} style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: '100%' }}>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                {s.weld ? <Text style={{ fontSize: 10, fontWeight: '700', color: C.text }}>{s.weld}</Text> : null}
                <View style={{ width: '100%', height: `${(s.weld / max) * 85}%`, backgroundColor: s.d === date ? C.accent : C.text }} />
              </View>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                {s.fit ? <Text style={{ fontSize: 10, color: C.n700 }}>{s.fit}</Text> : null}
                <View style={{ width: '100%', height: `${(s.fit / max) * 85}%`, backgroundColor: C.n400 }} />
              </View>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
          {series.map(s => <Text key={s.d} style={{ flex: 1, fontSize: 10, color: s.d === date ? C.accent700 : C.n700, textAlign: 'center' }} onPress={() => setDate(s.d)}>{fmtD(s.d)}</Text>)}
        </View>
      </View>

      <Table title={`Activity log · ${log.length}`} head={['Drawing', 'Weld', 'Spool / mark', 'Size', 'Activity', 'By / report']}
        rows={log.map(l => [l.dwg, l.id, l.group || '', l.size ? (/^\d+$/.test(l.size) ? 'DN' + l.size : l.size) : '', l.what, l.who])}
        empty="Nothing recorded this day." />
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Key({ c, l }: { c: string; l: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 12, height: 12, backgroundColor: c }} />
      <Text style={{ fontSize: 12, color: C.n700 }}>{l}</Text>
    </View>
  );
}

function Table({ title, head, rows, empty, style }: { title: string; head: string[]; rows: (string | number)[][]; empty: string; style?: any }) {
  return (
    <View style={[{ flex: 1, padding: S.s4 }, style]}>
      <Text style={{ fontWeight: '800', fontSize: 16, color: C.text, marginBottom: S.s2 }}>{title}</Text>
      <View style={[ds.tr, { borderBottomWidth: 2, borderBottomColor: C.text }]}>
        {head.map((h, i) => <Text key={h} style={[ds.td, { fontWeight: '800', fontSize: 12 }, i === 0 && { flex: 2 }]}>{h}</Text>)}
      </View>
      {rows.map((r, j) => (
        <View key={j} style={ds.tr}>
          {r.map((c, i) => <Text key={i} style={[ds.td, i === 0 && { flex: 2, fontWeight: '700' }]} numberOfLines={1}>{String(c)}</Text>)}
        </View>
      ))}
      {!rows.length ? <Text style={{ color: C.n700, fontSize: 13, paddingVertical: 8 }}>{empty}</Text> : null}
    </View>
  );
}

const ds = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: S.s3, paddingHorizontal: S.s4, paddingVertical: S.s3, borderBottomWidth: 2, borderBottomColor: C.divider },
  kpi: { flex: 1, padding: S.s4 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.hair, paddingVertical: 8 },
  td: { flex: 1, fontSize: 13, color: C.text, paddingRight: 6 },
});
