import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { FinanceProvider } from '@/features/finance/provider';

SplashScreen.preventAutoHideAsync();
export const unstable_settings = { initialRouteName: '(tabs)' };
export default function RootLayout() {
  const scheme = useColorScheme();
  return <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
    <AnimatedSplashOverlay />
    <FinanceProvider><Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="transaction" options={{ gestureEnabled: false }} />
    </Stack></FinanceProvider>
  </ThemeProvider>;
}
