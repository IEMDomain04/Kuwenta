import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTheme } from '@/hooks/use-theme';

export default function AppTabs() {
  const colors = useTheme();
  return <NativeTabs backgroundColor={colors.background} indicatorColor={colors.backgroundElement}
    labelStyle={{ selected: { color: colors.text } }}>
    <NativeTabs.Trigger name="index">
      <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/home.png')} renderingMode="template" />
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="transactions">
      <NativeTabs.Trigger.Label>Transactions</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon md="receipt_long" sf="list.bullet" />
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="settings">
      <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon md="settings" sf="gearshape" />
    </NativeTabs.Trigger>
  </NativeTabs>;
}
