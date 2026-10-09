import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';
import { Pressable } from 'react-native';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

export default function AppTabs() {
  return <Tabs>
    <TabSlot />
    <TabList asChild>
      <ThemedView style={{ flexDirection: 'row', gap: 16, padding: 16 }}>
        <TabTrigger name="home" href="/" asChild><Pressable><ThemedText>Home</ThemedText></Pressable></TabTrigger>
        <TabTrigger name="transactions" href="/transactions" asChild><Pressable><ThemedText>Transactions</ThemedText></Pressable></TabTrigger>
        <TabTrigger name="settings" href="/settings" asChild><Pressable><ThemedText>Settings</ThemedText></Pressable></TabTrigger>
      </ThemedView>
    </TabList>
  </Tabs>;
}
