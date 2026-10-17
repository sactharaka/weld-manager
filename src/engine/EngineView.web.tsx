import React, { useEffect, useMemo, useRef } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { buildEngineHtml } from './engineHtml';
import { engine } from './engine';

export default function EngineView({ style }: { style?: StyleProp<ViewStyle> }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const html = useMemo(buildEngineHtml, []);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source === ref.current?.contentWindow && e.data && e.data.__weng) engine.handleRaw(e.data.data);
    };
    window.addEventListener('message', onMsg);
    engine.attach(js => {
      const w = ref.current?.contentWindow as any;
      if (w) w.eval(js);
    });
    return () => {
      window.removeEventListener('message', onMsg);
      engine.detach();
    };
  }, []);
  return (
    <View style={style}>
      <iframe ref={ref} srcDoc={html} style={{ border: 0, width: '100%', height: '100%' }} title="drawing" />
    </View>
  );
}
