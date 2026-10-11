/** Shared Kuwenta colors for light and dark appearance. */

import '@/global.css';

import { Platform } from 'react-native';

const palette = {
  text: '#0A1129', background: '#F3F8F5', backgroundElement: '#FFFFFF',
  backgroundSelected: '#DDF3E5', textSecondary: '#3F5148',
  accent: '#06633E', accentPressed: '#044C30', onAccent: '#FFFFFF',
  navy: '#00205C', secondary: '#033F77', budget: '#0B6575', navigationInactive: '#4F6358',
  income: '#087443', expense: '#B4233C', border: '#73877A',
  incomeSurface: '#DDF3E5', incomeEnd: '#D2EBDD',
  expenseSurface: '#FDECEF', expenseEnd: '#F6D9DF', balanceEnd: '#033F77',
  warning: '#855006', warningSurface: '#FFF4D6',
  success: '#087443', successSurface: '#E5F5EB',
  info: '#033F77', infoSurface: '#EAF2FB',
  error: '#B4233C', errorSurface: '#FDECEF',
  disabledBackground: '#E8EFEB', disabledText: '#4F6358',
  overlay: '#0A112966',
} as const;
const darkPalette = {
  text: '#F1F7F3', background: '#0C1711', backgroundElement: '#192A21',
  backgroundSelected: '#264937', textSecondary: '#B8CDC0',
  accent: '#74DCA6', accentPressed: '#54C88D', onAccent: '#082417',
  navy: '#ADC9FF', secondary: '#92BDFA', budget: '#7FD3E1', navigationInactive: '#ADC4B5',
  income: '#74DCA6', expense: '#FF91A1', border: '#728E7D',
  incomeSurface: '#203F2E', incomeEnd: '#294C37',
  expenseSurface: '#42252E', expenseEnd: '#502D37', balanceEnd: '#25415C',
  warning: '#F4CF7C', warningSurface: '#3C311D',
  success: '#74DCA6', successSurface: '#203F2E',
  info: '#92BDFA', infoSurface: '#203347',
  error: '#FF91A1', errorSurface: '#42252E',
  disabledBackground: '#29382F', disabledText: '#9EB2A5', overlay: '#00000099',
} as const;
export const Colors = { light: palette, dark: darkPalette } as const;

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
