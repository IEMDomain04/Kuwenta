import { Ionicons } from '@react-native-vector-icons/ionicons';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTheme } from '@/hooks/use-theme';

export default function AppTabs() {
  const colors = useTheme();
  return <NativeTabs backgroundColor={colors.backgroundElement} indicatorColor={colors.incomeSurface} tintColor={colors.income} iconColor={{ default: colors.textSecondary, selected: colors.income }}
    labelStyle={{ default: { fontSize: 11 }, selected: { fontSize: 11, color: colors.income } }}>
    <NativeTabs.Trigger name="index">
      <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="home-outline" />} renderingMode="template" />
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="accounts">
      <NativeTabs.Trigger.Label>Accounts</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon md="account_balance_wallet" sf="wallet.pass" />
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="plans">
      <NativeTabs.Trigger.Label>Plans</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon md="assignment" sf="list.clipboard" />
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
