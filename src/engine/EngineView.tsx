import React, { useEffect, useMemo, useRef } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildEngineHtml } from './engineHtml';
import { engine } from './engine';

export default function EngineView({ style }: { style?: StyleProp<ViewStyle> }) {
  const ref = useRef<WebView>(null);
  const html = useMemo(buildEngineHtml, []);
  useEffect(() => {
    engine.attach(js => ref.current?.injectJavaScript(js));
    return () => engine.detach();
  }, []);
  return (
    <WebView
      ref={ref}
      style={style}
      originWhitelist={['*']}
      source={{ html, baseUrl: 'about:blank' }}
      onMessage={e => engine.handleRaw(e.nativeEvent.data)}
      javaScriptEnabled
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      setSupportMultipleWindows={false}
      onContentProcessDidTerminate={() => ref.current?.reload()}
    />
  );
}
