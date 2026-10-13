export const ACCOUNT_ICONS = { wallet: 'Wallet', bank: 'Bank', gcash: 'GCash', maya: 'Maya', maribank: 'MariBank', gotyme: 'GoTyme', uniondigital: 'UnionDigital' } as const;
export type AccountIconName = keyof typeof ACCOUNT_ICONS;
export function isAccountIcon(value: unknown): value is AccountIconName { return typeof value === 'string' && Object.hasOwn(ACCOUNT_ICONS, value); }
