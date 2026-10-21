import { AmountVisibilityProvider } from '@/hooks/amount-visibility';
import { ConfirmationProvider } from '@/features/finance/components/confirmation';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { AppearanceProvider, useAppearance } from '@/hooks/appearance-provider';
import { useTheme } from '@/hooks/use-theme';
import { FinanceProvider } from '@/features/finance/provider';

SplashScreen.preventAutoHideAsync();
export const unstable_settings = { initialRouteName: '(tabs)' };
export default function RootLayout() {
  return <AppearanceProvider><AmountVisibilityProvider><AppContent /></AmountVisibilityProvider></AppearanceProvider>;
}
function AppContent() {
  const { scheme, ready } = useAppearance();
  const colors = useTheme();
  if (!ready) return null;


  return <View style={{ flex: 1, backgroundColor: colors.background }} onLayout={() => { void SplashScreen.hideAsync(); }}><ThemeProvider value={{ ...(scheme === 'dark' ? DarkTheme : DefaultTheme), colors: { ...(scheme === 'dark' ? DarkTheme : DefaultTheme).colors, background: colors.background, card: colors.backgroundElement, text: colors.text, primary: colors.accent, border: colors.border } }}>
    <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    <ConfirmationProvider><FinanceProvider><Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="transaction" options={{ gestureEnabled: false }} />
      <Stack.Screen name="transfer" options={{ gestureEnabled: false }} />
      <Stack.Screen name="debt" options={{ gestureEnabled: false }} />
      <Stack.Screen name="goals" />
      <Stack.Screen name="budgets" options={{ gestureEnabled: false }} />
      <Stack.Screen name="goal" options={{ gestureEnabled: false }} />
      <Stack.Screen name="assistant" />
      <Stack.Screen name="account" options={{ gestureEnabled: false }} />
    </Stack></FinanceProvider></ConfirmationProvider>
  </ThemeProvider></View>;
}
