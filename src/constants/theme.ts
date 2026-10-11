/**
 * Shared Kuwenta colors for the light interface.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

const palette = {
  text: '#0A1129', background: '#F2FAF5', backgroundElement: '#FFFFFF',
  backgroundSelected: '#DDF3E5', textSecondary: '#52645C',
  accent: '#087F50', accentPressed: '#06633E', onAccent: '#FFFFFF',
  navy: '#00205C', secondary: '#033F77', budget: '#0B7285', navigationInactive: '#687C71',
  income: '#087F50', expense: '#B4233C', border: '#DCE9E1',
  incomeSurface: '#DDF3E5', incomeEnd: '#D2EBDD',
  expenseSurface: '#FDECEF', expenseEnd: '#F6D9DF', balanceEnd: '#033F77',
  warning: '#925B08', warningSurface: '#FFF4D6',
  success: '#087F50', successSurface: '#E5F5EB',
  info: '#033F77', infoSurface: '#EAF2FB',
  error: '#B4233C', errorSurface: '#FDECEF',
  disabledBackground: '#E8EFEB', disabledText: '#687C71',
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
