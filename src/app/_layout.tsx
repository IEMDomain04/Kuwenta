import { useEffect } from 'react';
import { Appearance } from 'react-native';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { FinanceProvider } from '@/features/finance/provider';

SplashScreen.preventAutoHideAsync();
export const unstable_settings = { initialRouteName: '(tabs)' };
export default function RootLayout() {
  useEffect(() => { Appearance.setColorScheme('light'); }, []);


  return <ThemeProvider value={DefaultTheme}>
    <StatusBar style="dark" />
    <AnimatedSplashOverlay />
    <FinanceProvider><Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="transaction" options={{ gestureEnabled: false }} />
      <Stack.Screen name="transfer" options={{ gestureEnabled: false }} />
      <Stack.Screen name="chat" options={{ gestureEnabled: false }} />
      <Stack.Screen name="goals" />
      <Stack.Screen name="budgets" options={{ gestureEnabled: false }} />
      <Stack.Screen name="goal" options={{ gestureEnabled: false }} />
      <Stack.Screen name="account" options={{ gestureEnabled: false }} />
    </Stack></FinanceProvider>
  </ThemeProvider>;
}
