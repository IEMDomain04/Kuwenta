import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppearanceProvider, useAppearance } from '@/hooks/appearance-provider';
import { useTheme } from '@/hooks/use-theme';
import { FinanceProvider } from '@/features/finance/provider';

SplashScreen.preventAutoHideAsync();
export const unstable_settings = { initialRouteName: '(tabs)' };
export default function RootLayout() {
  return <AppearanceProvider><AppContent /></AppearanceProvider>;
}
function AppContent() {
  const { scheme, ready } = useAppearance();
  const colors = useTheme();
  if (!ready) return null;


  return <ThemeProvider value={{ ...(scheme === 'dark' ? DarkTheme : DefaultTheme), colors: { ...(scheme === 'dark' ? DarkTheme : DefaultTheme).colors, background: colors.background, card: colors.backgroundElement, text: colors.text, primary: colors.accent, border: colors.border } }}>
    <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    <AnimatedSplashOverlay />
    <FinanceProvider><Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="transaction" options={{ gestureEnabled: false }} />
      <Stack.Screen name="transfer" options={{ gestureEnabled: false }} />
      <Stack.Screen name="goals" />
      <Stack.Screen name="budgets" options={{ gestureEnabled: false }} />
      <Stack.Screen name="goal" options={{ gestureEnabled: false }} />
      <Stack.Screen name="account" options={{ gestureEnabled: false }} />
    </Stack></FinanceProvider>
  </ThemeProvider>;
}
