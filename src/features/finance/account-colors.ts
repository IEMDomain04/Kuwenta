import type { Account } from './types';

export const ACCOUNT_CARD_COLORS = {
  green: { label: 'Green', light: '#087443', dark: '#74DCA6' },
  blue: { label: 'Blue', light: '#033F77', dark: '#92BDFA' },
  teal: { label: 'Teal', light: '#0B6575', dark: '#7FD3E1' },
  plum: { label: 'Plum', light: '#68417E', dark: '#CAB0E6' },
  amber: { label: 'Amber', light: '#855006', dark: '#F4CF7C' },
} as const;

export type AccountCardColor = keyof typeof ACCOUNT_CARD_COLORS;

export function accountCardColor(account: Pick<Account, 'color' | 'purpose'>, dark: boolean): string {
  const preset = ACCOUNT_CARD_COLORS[account.color ?? (account.purpose === 'savings' ? 'green' : 'blue')];
  return preset[dark ? 'dark' : 'light'];
}
