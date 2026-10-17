import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { engine } from './src/engine/engine';
import { projectTotals } from './src/lib/logic';
import { ensurePdfLoaded } from './src/lib/projectOps';
import { currentProject, initStore, isLoaded, useStore } from './src/lib/store';
import DailyScreen from './src/screens/DailyScreen';
import DataScreen from './src/screens/DataScreen';
import MapScreen from './src/screens/MapScreen';
import SheetScreen from './src/screens/SheetScreen';
import { C, S } from './src/ui/theme';

type Tab = 'map' | 'sheet' | 'daily' | 'data';

// Web-only test hook so imports can be exercised without a file dialog.
if (__DEV__ && Platform.OS === 'web') (window as any).__wm = { ops: require('./src/lib/projectOps'), store: require('./src/lib/store'), ex: require('./src/lib/exporters'), XLSX: require('xlsx') };

export default function App() {
  const data = useStore(s => s);
  const loaded = useStore(() => isLoaded());
  const p = currentProject(data);
  const [tab, setTab] = useState<Tab>('map');
  const [jump, setJump] = useState<{ page: number; sel?: string[]; n: number } | null>(null);
  const [engineBoot, setEngineBoot] = useState(0); // bumps each time the drawing engine (re)starts

  useEffect(() => {
    initStore();
    return engine.on(m => m.type === 'ready' && setEngineBoot(n => n + 1));
  }, []);
  useEffect(() => {
    if (loaded && engineBoot) ensurePdfLoaded(p).catch(e => console.warn(e));
  }, [loaded, engineBoot, p?.id, p?.pdfName]);
  useEffect(() => {
    if (loaded && !data.projects.length) setTab('data');
  }, [loaded]);

  const t = p ? projectTotals(p) : null;
  const tabs: [Tab, string][] = [['map', 'Weld map'], ['sheet', p?.type === 'structural' ? 'Sheet' : 'Spool sheet'], ['daily', 'Daily'], ['data', 'Data']];

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        <View style={a.header}>
          <View style={{ marginRight: 'auto', flexShrink: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>Weld Manager</Text>
            <Text style={{ fontSize: 12, color: C.n700 }} numberOfLines={1}>
              {p ? [p.job, p.name, p.client].filter(Boolean).join(' · ') : 'No project yet'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: S.s6 }}>
            {tabs.map(([k, l]) => (
              <Pressable key={k} onPress={() => setTab(k)} style={[a.tab, tab === k && a.tabOn]}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: tab === k ? C.text : C.n700 }}>{l}</Text>
              </Pressable>
            ))}
          </View>
          {t ? (
            <View style={{ alignItems: 'flex-end', marginLeft: S.s6 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>{t.welded} / {t.total}</Text>
              <Text style={{ fontSize: 12, color: C.n700 }}>welds complete</Text>
            </View>
          ) : null}
        </View>

        <View style={{ flex: 1 }}>
          {/* The weld map stays mounted so the drawing engine keeps its PDF loaded. */}
          <MapScreen p={p} data={data} visible={tab === 'map'} jump={jump} />
          {tab !== 'map' ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]}>
              {!loaded ? <ActivityIndicator style={{ marginTop: 40 }} /> : null}
              {tab === 'data' ? <DataScreen p={p} data={data} /> : null}
              {tab === 'sheet' && p ? <SheetScreen p={p} data={data} openOnMap={(page, sel) => { setJump({ page, sel, n: Date.now() }); setTab('map'); }} /> : null}
              {tab === 'daily' && p ? <DailyScreen p={p} data={data} /> : null}
              {(tab === 'sheet' || tab === 'daily') && !p ? <Text style={{ padding: 24, color: C.n700 }}>Create a project in the Data tab first.</Text> : null}
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const a = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.s4, paddingVertical: S.s3, borderBottomWidth: 2, borderBottomColor: C.text, gap: S.s4 },
  tab: { paddingVertical: 6, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: C.accent },
});
