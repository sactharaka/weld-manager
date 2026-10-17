import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextStyle, View, ViewStyle } from 'react-native';
import { addDays, fmtD, today } from '../lib/logic';
import { C, S } from './theme';

type BtnKind = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Btn({ label, onPress, kind = 'secondary', style, small, disabled }: {
  label: string; onPress?: () => void; kind?: BtnKind; style?: StyleProp<ViewStyle>; small?: boolean; disabled?: boolean;
}) {
  const k = btnKinds[kind];
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [st.btn, small && st.btnSmall, k.box, pressed && { opacity: 0.7 }, disabled && { opacity: 0.4 }, style]}
    >
      <Text style={[st.btnText, small && { fontSize: 13 }, k.text]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}
const btnKinds: Record<BtnKind, { box: ViewStyle; text: TextStyle }> = {
  primary: { box: { backgroundColor: C.text, borderColor: C.text }, text: { color: C.bg } },
  secondary: { box: { backgroundColor: 'transparent', borderColor: C.text }, text: { color: C.text } },
  ghost: { box: { backgroundColor: 'transparent', borderColor: 'transparent' }, text: { color: C.text } },
  danger: { box: { backgroundColor: 'transparent', borderColor: C.accent }, text: { color: C.accent700 } },
};

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={st.label}>{children}</Text>;
}
export function Eyebrow({ children, color }: { children: React.ReactNode; color?: string }) {
  return <Text style={[st.eyebrow, color ? { color } : null]}>{children}</Text>;
}

export function Field({ label, value, onChange, placeholder, style, keyboard, multiline }: {
  label?: string; value?: string; onChange: (v: string) => void; placeholder?: string; style?: StyleProp<ViewStyle>;
  keyboard?: 'default' | 'numeric'; multiline?: boolean;
}) {
  return (
    <View style={[{ gap: 4 }, style]}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
        style={[st.input, multiline && { minHeight: 64, textAlignVertical: 'top' }]}
        defaultValue={value ?? ''}
        key={value ?? ''}
        onEndEditing={e => e.nativeEvent.text !== (value ?? '') && onChange(e.nativeEvent.text.trim())}
        onBlur={(e: any) => {
          const t = e?.nativeEvent?.text ?? e?.target?.value;
          if (typeof t === 'string' && t.trim() !== (value ?? '')) onChange(t.trim());
        }}
        placeholder={placeholder}
        placeholderTextColor={C.n500}
        keyboardType={keyboard === 'numeric' ? 'decimal-pad' : 'default'}
        multiline={multiline}
        autoCapitalize="characters"
        autoCorrect={false}
      />
    </View>
  );
}

/** Pick from a list, with free-text entry for anything not in it. */
export function PickField({ label, value, options, onChange, placeholder, style, allowCustom = true, render }: {
  label?: string; value?: string; options: string[]; onChange: (v: string) => void; placeholder?: string;
  style?: StyleProp<ViewStyle>; allowCustom?: boolean; render?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[{ gap: 4 }, style]}>
      {label ? <Label>{label}</Label> : null}
      <Pressable style={[st.input, { justifyContent: 'center' }]} onPress={() => setOpen(true)}>
        <Text style={{ fontSize: 15, color: value ? C.text : C.n500 }} numberOfLines={1}>
          {value ? (render ? render(value) : value) : placeholder || '—'}
        </Text>
      </Pressable>
      <PickerModal
        visible={open}
        title={label || 'Select'}
        options={options}
        value={value}
        render={render}
        allowCustom={allowCustom}
        onClose={() => setOpen(false)}
        onPick={v => {
          setOpen(false);
          onChange(v);
        }}
      />
    </View>
  );
}

export function PickerModal({ visible, title, options, value, onPick, onClose, allowCustom, render }: {
  visible: boolean; title: string; options: string[]; value?: string; onPick: (v: string) => void; onClose: () => void;
  allowCustom?: boolean; render?: (v: string) => string;
}) {
  const [q, setQ] = useState('');
  const list = options.filter(o => !q || (render ? render(o) : o).toUpperCase().includes(q.toUpperCase()));
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} supportedOrientations={['landscape', 'portrait']}>
      <Pressable style={st.scrim} onPress={onClose}>
        <Pressable style={st.sheet} onPress={() => {}}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.s3, marginBottom: S.s3 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', flex: 1, color: C.text }}>{title}</Text>
            <Btn label="Close" kind="ghost" small onPress={onClose} />
          </View>
          <TextInput style={st.input} placeholder={allowCustom ? 'Search or type new…' : 'Search…'} placeholderTextColor={C.n500}
            value={q} onChangeText={setQ} autoCapitalize="characters" autoCorrect={false} autoFocus={options.length > 8 || !options.length}
            onSubmitEditing={() => { const v = q.trim(); if (!v) return; const hit = list.length === 1 ? list[0] : allowCustom ? v : ''; if (hit) { onPick(hit); setQ(''); } }} />
          <ScrollView style={{ maxHeight: 420, marginTop: S.s2 }} keyboardShouldPersistTaps="handled">
            {allowCustom && q && !options.some(o => o.toUpperCase() === q.toUpperCase()) ? (
              <Pressable style={st.opt} onPress={() => { onPick(q.trim()); setQ(''); }}>
                <Text style={{ fontSize: 16, color: C.accent700, fontWeight: '700' }}>Use “{q.trim()}”</Text>
              </Pressable>
            ) : null}
            <Pressable style={st.opt} onPress={() => { onPick(''); setQ(''); }}>
              <Text style={{ fontSize: 16, color: C.n600 }}>— None</Text>
            </Pressable>
            {list.map(o => (
              <Pressable key={o} style={[st.opt, o === value && { backgroundColor: C.surface }]} onPress={() => { onPick(o); setQ(''); }}>
                <Text style={{ fontSize: 16, color: C.text, fontWeight: o === value ? '800' : '400' }}>{render ? render(o) : o}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Date as YYYY-MM-DD with quick Today / ±1 day / clear buttons (fast for field use, no keyboard). */
export function DateField({ label, value, onChange, style }: { label?: string; value?: string; onChange: (v: string) => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: 4 }, style]}>
      {label ? <Label>{label}</Label> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Pressable style={[st.input, { flex: 1, justifyContent: 'center' }]} onPress={() => onChange(value || today())}>
          <Text style={{ fontSize: 15, color: value ? C.text : C.n500 }}>{value ? `${fmtD(value)} ${value.slice(0, 4)}` : 'Tap = today'}</Text>
        </Pressable>
        {value ? (
          <>
            <MiniBtn label="−" onPress={() => onChange(addDays(value, -1))} />
            <MiniBtn label="+" onPress={() => onChange(addDays(value, 1))} />
            <MiniBtn label="✕" onPress={() => onChange('')} />
          </>
        ) : null}
      </View>
    </View>
  );
}
function MiniBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.mini, pressed && { backgroundColor: C.surface }]}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: C.text }}>{label}</Text>
    </Pressable>
  );
}

export function Seg<T extends string>({ value, options, onChange, style }: {
  value: T; options: [T, string][]; onChange: (v: T) => void; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[st.seg, style]}>
      {options.map(([v, l]) => (
        <Pressable key={v} onPress={() => onChange(v)} style={[st.segOpt, v === value && { backgroundColor: C.text }]}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: v === value ? C.bg : C.text }} numberOfLines={1}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Section({ title, children, right, style }: { title?: string; children: React.ReactNode; right?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[st.section, style]}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: S.s2 }}>
          <Text style={st.sectionTitle}>{title}</Text>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export const Row = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[{ flexDirection: 'row', gap: S.s3 }, style]}>{children}</View>
);

export const st = StyleSheet.create({
  btn: { minHeight: 44, paddingHorizontal: 14, borderWidth: 2, justifyContent: 'center', alignItems: 'flex-start' },
  btnSmall: { minHeight: 34, paddingHorizontal: 10 },
  btnText: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 12, color: C.n700 },
  eyebrow: { fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase', color: C.n700, fontWeight: '700' },
  input: { minHeight: 42, borderWidth: 1.5, borderColor: C.n500, backgroundColor: C.white, paddingHorizontal: 10, fontSize: 15, color: C.text },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,.35)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { width: 460, maxWidth: '100%', backgroundColor: C.bg, padding: S.s4 },
  opt: { paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.hair },
  mini: { width: 38, height: 42, borderWidth: 1.5, borderColor: C.n500, alignItems: 'center', justifyContent: 'center', backgroundColor: C.white },
  seg: { flexDirection: 'row', borderWidth: 2, borderColor: C.text },
  segOpt: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  section: { paddingHorizontal: S.s4, paddingVertical: S.s3, borderBottomWidth: 2, borderBottomColor: C.divider },
  sectionTitle: { flex: 1, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase', fontWeight: '800', color: C.text },
});
