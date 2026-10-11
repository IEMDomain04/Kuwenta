/**
 * Shared Kuwenta colors for the light interface.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

const palette = {
  text: '#0A1129', background: '#F4F8FA', backgroundElement: '#FFFFFF',
  backgroundSelected: '#E5F2F6', textSecondary: '#526579',
  accent: '#1282A1', accentPressed: '#0F6D87', onAccent: '#FFFFFF',
  navy: '#00205C', secondary: '#033F77',
  income: '#278258', expense: '#B93846', border: '#DCE5EC',
  incomeSurface: '#E8F5ED', incomeEnd: '#D2EBDD',
  expenseSurface: '#FCECEF', expenseEnd: '#F6D9DF', balanceEnd: '#033F77',
  warning: '#805600', warningSurface: '#FFF4D6',
  success: '#216B48', successSurface: '#E8F5ED',
  info: '#033F77', infoSurface: '#E5F2F6',
  error: '#A32939', errorSurface: '#FCECEF',
  disabledBackground: '#E7EDF2', disabledText: '#657487',
  overlay: '#0A112966',
} as const;
// Kuwenta currently uses the light palette throughout.
export const Colors = { light: palette, dark: palette } as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
