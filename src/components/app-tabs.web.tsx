import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';
import { usePathname } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Pressable } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

export default function AppTabs() {
  const path = usePathname();
  const theme = useTheme();
  const items = [{ name: 'home', href: '/', label: 'Home', icon: 'home-outline' }, { name: 'accounts', href: '/accounts', label: 'Accounts', icon: 'wallet-outline' }, { name: 'transactions', href: '/transactions', label: 'History', icon: 'receipt-outline' }, { name: 'settings', href: '/settings', label: 'Settings', icon: 'settings-outline' }] as const;
  return <Tabs><TabSlot /><TabList asChild>
    <ThemedView type="backgroundElement" style={{ flexDirection: 'row', padding: 8 }}>
      {items.map((item) => <TabTrigger key={item.name} name={item.name} href={item.href} asChild><Pressable accessibilityLabel={item.label} style={{ flex: 1, minHeight: 48, gap: 3, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: path === item.href ? theme.backgroundSelected : 'transparent' }}>
        <Ionicons name={item.icon} size={22} color={path === item.href ? theme.accent : theme.textSecondary} />
        <ThemedText type="small" style={{ fontSize: 12, color: path === item.href ? theme.accent : theme.textSecondary }}>{item.label}</ThemedText>
      </Pressable></TabTrigger>)}
    </ThemedView>
  </TabList></Tabs>;
}
