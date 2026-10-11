import 'expo-sqlite/localStorage/install';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Appearance, Platform, useColorScheme as useDeviceColorScheme } from 'react-native';

export type AppearanceMode = 'light' | 'dark' | 'system';
const Context = createContext({ mode: 'light' as AppearanceMode, scheme: 'light' as 'light' | 'dark', ready: false, setMode: (_mode: AppearanceMode) => {} });

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AppearanceMode>('light');
  const [ready, setReady] = useState(false);
  const deviceScheme = useDeviceColorScheme();
  useEffect(() => {
    try {
      const saved = localStorage.getItem('kuwenta.appearance');
      if (saved === 'light' || saved === 'dark' || saved === 'system') setMode(saved);
    } catch { /* Keep light mode when storage is unavailable. */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready && Platform.OS !== 'web') Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
  }, [mode, ready]);
  function saveMode(next: AppearanceMode) {
    localStorage.setItem('kuwenta.appearance', next);
    setMode(next);
  }
  const scheme = mode === 'system' ? (deviceScheme === 'dark' ? 'dark' : 'light') : mode;
  return <Context.Provider value={{ mode, scheme, ready, setMode: saveMode }}>{children}</Context.Provider>;
}

export function useAppearance() { return useContext(Context); }
