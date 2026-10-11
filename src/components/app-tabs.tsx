import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTheme } from '@/hooks/use-theme';

export default function AppTabs() {
  const colors = useTheme();
  return <NativeTabs backgroundColor={colors.backgroundElement} indicatorColor={colors.backgroundSelected} tintColor={colors.accent} iconColor={{ default: colors.textSecondary, selected: colors.accent }}
    labelStyle={{ default: { fontSize: 12 }, selected: { fontSize: 12, color: colors.accent } }}>
    <NativeTabs.Trigger name="index">
      <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/home.png')} renderingMode="template" />
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="accounts">
      <NativeTabs.Trigger.Label>Accounts</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon md="account_balance_wallet" sf="wallet.pass" />
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="transactions">
      <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon md="receipt_long" sf="list.bullet" />
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="settings">
      <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon md="settings" sf="gearshape" />
    </NativeTabs.Trigger>
  </NativeTabs>;
}
