import { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type Button = { text: string; style?: 'cancel' | 'default' | 'destructive'; onPress?: () => void };
export type ConfirmationOptions = {
  icon?: ComponentProps<typeof Ionicons>['name'];
  rows?: { label: string; value: string }[];
  change?: { label: string; before: string; after: string };
};
type Request = { title: string; message: string; buttons: Button[]; options: ConfirmationOptions };
type Confirmation = { alert: (title: string, message: string, buttons: Button[], options?: ConfirmationOptions) => void };
const Context = createContext<Confirmation | null>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const [request, setRequest] = useState<Request | null>(null);
  const active = useRef<Request | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const previous = active.current;
      active.current = null;
      previous?.buttons.find(button => button.style === 'cancel')?.onPress?.();
    };
  }, []);
  const confirmation = useMemo<Confirmation>(() => ({ alert(title, message, buttons, options = {}) {
    if (!alive.current || active.current) {
      buttons.find(button => button.style === 'cancel')?.onPress?.();
      return;
    }
    Keyboard.dismiss();
    const next = { title, message, buttons, options };
    active.current = next;
    setRequest(next);
  } }), []);
  function choose(button?: Button) {
    if (!active.current || active.current !== request) return;
    active.current = null; // Prevent repeated taps from submitting twice.
    setRequest(null);
    button?.onPress?.();
  }
  const cancel = request?.buttons.find(button => button.style === 'cancel');
  const action = request?.buttons.find(button => button.style !== 'cancel');
  const destructive = action?.style === 'destructive';
  return <Context.Provider value={confirmation}>
    {children}
    <Modal visible={Boolean(request)} transparent animationType="fade" onRequestClose={() => choose(cancel)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        {request ? <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 420, maxHeight: '85%', backgroundColor: theme.backgroundElement, borderRadius: 24, borderWidth: 1, borderColor: theme.border, padding: 20, gap: 16 }}>
          <ScrollView contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: destructive ? theme.errorSurface : theme.backgroundSelected, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={request.options.icon ?? (destructive ? 'trash-outline' : 'checkmark-circle-outline')} size={22} color={destructive ? theme.error : theme.accent} />
            </View>
            <ThemedText type="smallBold" accessibilityRole="header" style={{ fontSize: 18, lineHeight: 24 }}>{request.title}</ThemedText>
            {request.message ? <ThemedText type="small" themeColor="textSecondary">{request.message}</ThemedText> : null}
            {request.options.rows?.length || request.options.change ? <View style={{ padding: 12, borderRadius: 14, backgroundColor: theme.background, gap: 10 }}>
              {request.options.rows?.map((row, index) => <View key={index} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>{row.label}</ThemedText>
                <ThemedText type="smallBold" style={{ flex: 2, textAlign: 'right' }}>{row.value}</ThemedText>
              </View>)}
              {request.options.change ? <View style={{ gap: 8 }}>
                <ThemedText type="small" themeColor="textSecondary">{request.options.change.label}</ThemedText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1 }}><ThemedText type="small" themeColor="textSecondary">Current</ThemedText><ThemedText type="smallBold">{request.options.change.before}</ThemedText></View>
                  <Ionicons name="arrow-forward" size={18} color={theme.textSecondary} />
                  <View style={{ flex: 1 }}><ThemedText type="small" themeColor="textSecondary">New</ThemedText><ThemedText type="smallBold" themeColor="accent">{request.options.change.after}</ThemedText></View>
                </View>
              </View> : null}
            </View> : null}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[cancel, action].map((button, index) => button ? <Pressable key={index} accessibilityRole="button" accessibilityLabel={button.text} onPress={() => choose(button)} style={({ pressed }) => ({ flex: 1, minHeight: 48, borderRadius: 14, padding: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: index === 0 ? theme.backgroundSelected : destructive ? theme.error : theme.accentPressed, opacity: pressed ? 0.7 : 1 })}>
              <ThemedText type="smallBold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ textAlign: 'center', color: index === 0 ? theme.text : theme.onAccent }}>{button.text}</ThemedText>
            </Pressable> : null)}
          </View>
        </View> : null}
      </SafeAreaView>
    </Modal>
  </Context.Provider>;
}

export function useConfirmation() {
  const confirmation = useContext(Context);
  if (!confirmation) throw new Error('ConfirmationProvider is missing.');
  return confirmation;
}
