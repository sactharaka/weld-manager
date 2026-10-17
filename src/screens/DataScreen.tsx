import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { exportBackup, exportDaily, exportManagementSheet, exportRegister } from '../lib/exporters';
import { pickFile } from '../lib/fs';
import { projectTotals, today } from '../lib/logic';
import { createProject, deleteProject, importDetail, importPdf, importSheet, importWmproj, restoreBackup } from '../lib/projectOps';
import { addPerson, removePerson, setState } from '../lib/store';
import { AppData, Project, ProjectType } from '../lib/types';
import { confirm, notify } from '../ui/alert';
import { Btn, Eyebrow, Row, Seg, st as kst } from '../ui/kit';
import { C, S } from '../ui/theme';

const XLSX_TYPES = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv', 'text/comma-separated-values'];

export default function DataScreen({ p, data }: { p?: Project; data: AppData }) {
  const [busy, setBusy] = useState('');
  const run = (label: string, fn: (status: (s: string) => void) => Promise<string | void>) => async () => {
    setBusy(label);
    try {
      const msg = await fn(setBusy);
      if (msg) notify('Done', msg);
    } catch (e: any) {
      notify('Something went wrong', String(e?.message || e));
    } finally {
      setBusy('');
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Card title="Projects" eyebrow="Job">
          <Projects data={data} current={p} />
        </Card>

        {p ? (
          <Card title="Set up from the office files" eyebrow="Import">
            <Text style={ds.help}>Put the files in OneDrive (or iCloud / email them to yourself) on the Windows PC, then pick them here from the Files app.</Text>
            <Step n={1} title="Drawing PDF" done={p.drawings.length ? `${p.drawings.length} drawings` : ''}
              note="Each page becomes a drawing. Drawing numbers are read from the title block."
              onPress={run('Importing drawings…', async st => {
                const f = await pickFile('application/pdf');
                if (!f) return;
                const r = await importPdf(p.id, f, st);
                return `${r.pages} pages imported. Drawing number found on ${r.found}.`;
              })} />
            <Step n={2} title="Weld map (.wmproj)" done={p.drawings.some(d => d.welds.length) ? `${p.drawings.reduce((a, d) => a + d.welds.length, 0)} welds` : ''}
              note="Weld numbers W1, W2… and their positions from your weld-map markup tool."
              disabled={!p.drawings.length}
              onPress={run('Importing weld map…', async () => {
                const f = await pickFile('*/*');
                if (!f) return;
                const r = await importWmproj(p.id, f);
                return `${r.welds} welds on ${r.pages} drawings.${r.missing ? ` ${r.missing} pages in the weld map are not in the PDF.` : ''}`;
              })} />
            <Step n={3} title={p.type === 'piping' ? 'Management sheet (spools)' : 'Management sheet (optional)'}
              done={p.sheet ? `${p.groups.length} ${p.type === 'piping' ? 'spools' : 'items'} · ${p.stages.length} stages` : ''}
              note="Spool list and the stage columns to track (Fabrication, Welding, NDT, Hydro, Surface, Delivery…). Any date column is picked up."
              onPress={run('Importing management sheet…', async st => {
                const f = await pickFile(XLSX_TYPES);
                if (!f) return;
                const r = await importSheet(p.id, f, st);
                return `${r.groups} rows from ${r.drawings} drawings. Tracking ${r.stages} stages.${r.matched ? ` Matched ${r.matched} PDF pages to drawing numbers.` : ''}`;
              })} />
            <Step n={4} title="Weld detail file (optional)" done=""
              note="Any Excel with Drawing + Weld No. columns. Size, thickness, material, WPS, joint, heat numbers are matched to each weld and filled in where blank."
              disabled={!p.drawings.length}
              onPress={run('Matching weld details…', async () => {
                const f = await pickFile(XLSX_TYPES);
                if (!f) return;
                const r = await importDetail(p.id, f, false);
                return `Matched ${r.matched} welds, filled ${r.filled} values (columns: ${r.columns.join(', ') || 'none recognised'}).` +
                  (r.unmatched.length ? `\n\n${r.unmatched.length} rows not found, e.g. ${r.unmatched.slice(0, 5).join('; ')}` : '');
              })} />
          </Card>
        ) : null}

        {p ? (
          <Card title="Send to the office" eyebrow="Export">
            <Text style={ds.help}>Opens the share sheet — choose “Save to Files” → OneDrive, or Mail. Files open directly in Excel on the PC.</Text>
            <View style={{ gap: S.s2 }}>
              <Btn kind="primary" label="Daily report (today) .xlsx" onPress={run('Exporting…', () => exportDaily(p, data, today()))} />
              <Btn label="Management sheet .xlsx (dates filled in)" onPress={run('Exporting…', () => exportManagementSheet(p))} />
              <Btn label="Weld traceability register .xlsx" onPress={run('Exporting…', () => exportRegister(p, data))} />
              <Btn label="Backup of this project .json" onPress={run('Exporting…', () => exportBackup(p, data))} />
            </View>
            <Text style={[ds.help, { marginTop: S.s3 }]}>Pick another day’s report from the Daily tab.</Text>
          </Card>
        ) : null}

        <Card title="Restore" eyebrow="Backup">
          <Text style={ds.help}>Load a .json backup (from this or another iPad). Records replace the project with the same ID; the drawing PDF stays on this device.</Text>
          <Btn label="Load backup…" onPress={run('Restoring…', async () => {
            const f = await pickFile(['application/json', '*/*']);
            if (!f) return;
            const pr = await restoreBackup(f);
            return `Restored ${pr.name} (${Object.keys(pr.welds).length} weld records).${pr.pdfName ? '' : ''}`;
          })} />
        </Card>

        <Card title="Welders" eyebrow="People"><People data={data} role="welder" /></Card>
        <Card title="Fitters" eyebrow="People"><People data={data} role="fitter" /></Card>
        {p ? <Card title="Lists" eyebrow="Picklists"><Lists data={data} /></Card> : null}
      </ScrollView>
      {busy ? (
        <View style={ds.busy}>
          <ActivityIndicator color={C.bg} />
          <Text style={{ color: C.bg, fontSize: 15 }}>{busy}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Card({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <View style={ds.card}>
      <Eyebrow color={C.accent700}>{eyebrow}</Eyebrow>
      <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, marginBottom: S.s3 }}>{title}</Text>
      {children}
    </View>
  );
}

function Step({ n, title, note, done, onPress, disabled }: { n: number; title: string; note: string; done: string; onPress: () => void; disabled?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: S.s3, paddingVertical: S.s3, borderTopWidth: 1, borderTopColor: C.hair, opacity: disabled ? 0.45 : 1 }}>
      <View style={[ds.num, done ? { backgroundColor: C.text } : null]}><Text style={{ color: done ? C.bg : C.text, fontWeight: '800' }}>{done ? '✓' : n}</Text></View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: C.text }}>{title}</Text>
        <Text style={{ fontSize: 13, color: C.n700 }}>{note}</Text>
        {done ? <Text style={{ fontSize: 13, color: C.ok, fontWeight: '700' }}>{done}</Text> : null}
      </View>
      <Btn small label={done ? 'Replace…' : 'Choose…'} onPress={onPress} disabled={disabled} />
    </View>
  );
}

function Projects({ data, current }: { data: AppData; current?: Project }) {
  const [adding, setAdding] = useState(!data.projects.length);
  const [f, setF] = useState({ name: '', client: '', job: '', type: 'piping' as ProjectType });
  return (
    <View style={{ gap: S.s2 }}>
      {data.projects.map(pr => {
        const t = projectTotals(pr);
        const on = pr.id === current?.id;
        return (
          <Pressable key={pr.id} onPress={() => setState(s => ({ ...s, currentId: pr.id }))}
            style={[ds.proj, on && { borderColor: C.accent, backgroundColor: C.surface }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', fontSize: 15, color: C.text }}>{pr.job ? `${pr.job} · ` : ''}{pr.name}</Text>
              <Text style={{ fontSize: 12, color: C.n700 }}>{pr.type === 'piping' ? 'Piping' : 'Structural'} · {pr.client} · {t.welded}/{t.total} welded</Text>
            </View>
            {on ? <Btn small kind="danger" label="Delete" onPress={() => confirm('Delete project', `Delete ${pr.name} and all its records from this iPad? Export a backup first if unsure.`, 'Delete', () => deleteProject(pr.id), true)} /> : null}
          </Pressable>
        );
      })}
      {adding ? (
        <View style={{ gap: S.s2, paddingTop: S.s2 }}>
          <Seg value={f.type} onChange={type => setF({ ...f, type })} options={[['piping', 'Piping (spools)'], ['structural', 'Structural']]} />
          <TextInput style={kst.input} placeholder="Project name" placeholderTextColor={C.n500} value={f.name} onChangeText={name => setF({ ...f, name })} />
          <Row>
            <TextInput style={[kst.input, { flex: 1 }]} placeholder="Client" placeholderTextColor={C.n500} value={f.client} onChangeText={client => setF({ ...f, client })} />
            <TextInput style={[kst.input, { flex: 1 }]} placeholder="Job no." placeholderTextColor={C.n500} value={f.job} onChangeText={job => setF({ ...f, job })} />
          </Row>
          <Row>
            <Btn kind="primary" label="Create project" disabled={!f.name.trim()} onPress={() => {
              createProject(f.name.trim(), f.client.trim(), f.job.trim(), f.type);
              setAdding(false);
              setF({ name: '', client: '', job: '', type: 'piping' });
            }} />
            {data.projects.length ? <Btn kind="ghost" label="Cancel" onPress={() => setAdding(false)} /> : null}
          </Row>
        </View>
      ) : (
        <Btn label="+ New project" onPress={() => setAdding(true)} />
      )}
    </View>
  );
}

function People({ data, role }: { data: AppData; role: 'welder' | 'fitter' }) {
  const [name, setName] = useState('');
  const [stamp, setStamp] = useState('');
  const list = data.people.filter(x => x.role === role);
  const add = () => {
    if (!name.trim()) return;
    addPerson({ role, name: name.trim(), stamp: role === 'welder' ? stamp.trim().toUpperCase() || undefined : undefined });
    setName('');
    setStamp('');
  };
  return (
    <View style={{ gap: S.s2 }}>
      {list.map(x => (
        <View key={x.name} style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.hair, paddingVertical: 6 }}>
          <Text style={{ flex: 1, fontSize: 15, color: C.text }}>{x.name}</Text>
          {x.stamp ? <Text style={{ fontWeight: '800', color: C.text, marginRight: S.s3 }}>{x.stamp}</Text> : null}
          <Btn small kind="ghost" label="Remove" onPress={() => removePerson(x)} />
        </View>
      ))}
      {!list.length ? <Text style={ds.help}>None yet. Names typed on the weld map are added here automatically.</Text> : null}
      <Row>
        <TextInput style={[kst.input, { flex: 2 }]} placeholder="Name" placeholderTextColor={C.n500} value={name} onChangeText={setName} onSubmitEditing={add} />
        {role === 'welder' ? <TextInput style={[kst.input, { flex: 1 }]} placeholder="Stamp / ID" placeholderTextColor={C.n500} value={stamp} onChangeText={setStamp} autoCapitalize="characters" onSubmitEditing={add} /> : null}
        <Btn label="Add" onPress={add} />
      </Row>
    </View>
  );
}

function Lists({ data }: { data: AppData }) {
  const lists: [keyof AppData['lists'], string][] = [['materials', 'Materials'], ['wps', 'WPS numbers'], ['joints', 'Joint types'], ['ndtMethods', 'NDT methods']];
  const [txt, setTxt] = useState<Record<string, string>>({});
  return (
    <View style={{ gap: S.s3 }}>
      {lists.map(([k, l]) => (
        <View key={k} style={{ gap: 4 }}>
          <Text style={kst.label}>{l}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {data.lists[k].map(v => (
              <Pressable key={v} onLongPress={() => setState(s => ({ ...s, lists: { ...s.lists, [k]: s.lists[k].filter(x => x !== v) } }))} style={ds.chip}>
                <Text style={{ fontSize: 13, color: C.text }}>{v}</Text>
              </Pressable>
            ))}
            <TextInput style={[kst.input, { minHeight: 32, width: 140, fontSize: 13 }]} placeholder="+ add" placeholderTextColor={C.n500} value={txt[k] || ''}
              autoCapitalize="characters" onChangeText={v => setTxt({ ...txt, [k]: v })}
              onSubmitEditing={() => {
                const v = (txt[k] || '').trim();
                if (v) setState(s => (s.lists[k].includes(v) ? s : { ...s, lists: { ...s.lists, [k]: [...s.lists[k], v] } }));
                setTxt({ ...txt, [k]: '' });
              }} />
          </View>
        </View>
      ))}
      <Text style={ds.help}>Long-press an item to remove it.</Text>
    </View>
  );
}

const ds = StyleSheet.create({
  card: { width: '50%', minWidth: 380, padding: S.s6, paddingHorizontal: S.s4, borderRightWidth: 2, borderBottomWidth: 2, borderColor: C.divider, gap: S.s2 },
  help: { fontSize: 13, color: C.n700, lineHeight: 19 },
  num: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: C.text, alignItems: 'center', justifyContent: 'center' },
  proj: { flexDirection: 'row', alignItems: 'center', gap: S.s2, borderWidth: 2, borderColor: C.n400, padding: S.s3 },
  chip: { borderWidth: 1.5, borderColor: C.n500, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: C.white },
  busy: { position: 'absolute', left: 24, bottom: 24, backgroundColor: C.text, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'center' },
});
