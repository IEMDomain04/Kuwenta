import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { formatMoney } from './money';

export async function syncWidgets(cash: number, available: number, needsSetup: boolean) {
  if (Platform.OS !== 'android') return;
  const native = requireOptionalNativeModule<{ updateBalances: (cash: string, available: string, updated: string) => Promise<void> }>('KuwentaWidgets');
  if (!native) return; // Expo Go and an older installed build.
  const updated = 'Updated ' + new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date());
  await native.updateBalances(needsSetup ? '--' : formatMoney(cash, true), needsSetup ? '--' : formatMoney(available, true), needsSetup ? 'Open Kuwenta to set up' : updated);
}
