/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

const palette = {
  text: '#142443', background: '#EDF7FF', backgroundElement: '#FFFFFF',
  backgroundSelected: '#DFF3FA', textSecondary: '#526987',
  accent: '#087F8C', onAccent: '#FFFFFF', income: '#078548',
  expense: '#246AAB', border: '#DCECF5', incomeSurface: '#E7F8EF', incomeEnd: '#C9EFDF', expenseSurface: '#EAF4FF', expenseEnd: '#CFDEF7', balanceEnd: '#258B79',
} as const;
export const Colors = {
  light: palette,
  dark: {
    text: '#E8F2FA', background: '#101C28', backgroundElement: '#1B2B3A',
    backgroundSelected: '#294354', textSecondary: '#B2C5D7',
    accent: '#78D9D1', onAccent: '#102D30', income: '#84DBAA',
    expense: '#9EC9FF', border: '#344B60', incomeSurface: '#193D32',
    incomeEnd: '#244F40', expenseSurface: '#203A55', expenseEnd: '#2A4B69',
    balanceEnd: '#206F67',
  },
} as const;

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
