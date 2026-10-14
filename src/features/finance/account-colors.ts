import type { Account } from './types';

export const ACCOUNT_CARD_COLORS = {
  green: { label: 'Emerald', light: '#087443', dark: '#74DCA6' },
  blue: { label: 'Blue', light: '#033F77', dark: '#92BDFA' },
  teal: { label: 'Teal', light: '#0B6575', dark: '#7FD3E1' },
  plum: { label: 'Purple', light: '#68417E', dark: '#CAB0E6' },
  amber: { label: 'Amber', light: '#855006', dark: '#F4CF7C' },
  cyan: { label: 'Cyan', light: '#006B85', dark: '#67E8F9' },
  indigo: { label: 'Indigo', light: '#3730A3', dark: '#A5B4FC' },
  rose: { label: 'Rose', light: '#9D174D', dark: '#FDA4AF' },
  coral: { label: 'Coral', light: '#9C3C2B', dark: '#FDBA9E' },
  brown: { label: 'Brown', light: '#64442B', dark: '#D7B595' },
  slate: { label: 'Slate', light: '#374151', dark: '#CBD5E1' },
} as const;

export type AccountCardColor = keyof typeof ACCOUNT_CARD_COLORS;

export function accountCardColor(account: Pick<Account, 'color' | 'purpose'>, dark: boolean): string {
  const preset = ACCOUNT_CARD_COLORS[account.color ?? (account.purpose === 'savings' ? 'green' : 'blue')];
  return preset[dark ? 'dark' : 'light'];
}
