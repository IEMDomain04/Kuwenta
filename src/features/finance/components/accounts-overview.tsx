import { accountCardColor } from '../account-colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, Vibration, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { calculateAccountSummary } from '../calculations';
import { formatMoney } from '../money';
import { ActionButton } from './ui';

// Keep each card mounted in its original slot while neighboring cards preview the drop.
function MovingCard({ x, y, active, order, children, ...props }: { x: number; y: number; active: boolean; order: string; children: ReactNode } & React.ComponentProps<typeof View>) {
  const [position] = useState(() => new Animated.ValueXY());
  const previousOrder = useRef(order);
  useLayoutEffect(() => {
    if (active || previousOrder.current !== order) {
      previousOrder.current = order;
      position.setValue({ x, y });
      return;
    }
    const animation = Animated.timing(position, { toValue: { x, y }, duration: 160, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [position, x, y, active, order]);
  return <Animated.View {...props} style={[props.style, { transform: position.getTranslateTransform() }]}>{children}</Animated.View>;
}

export function AccountsOverview({ compact = false, showAdd = true, onDraggingChange }: { compact?: boolean; showAdd?: boolean; onDraggingChange?: (dragging: boolean) => void }) {
  const { accounts, transactions, busy, saveAccountOrder } = useFinance();
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const cardText = dark ? '#082417' : '#FFFFFF';
  const { fontScale } = useWindowDimensions();
  const [showArchived, setShowArchived] = useState(false);
  const [layout, setLayout] = useState<'cards' | 'list'>('cards');
  type Drag = { id: string; purpose: string; x: number; y: number; dx: number; dy: number; target: string };
  const [preview, setPreview] = useState<string[] | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const nodes = useRef<Record<string, View | null>>({});
  const bounds = useRef<Record<string, { x: number; y: number; width: number; height: number }>>({});
  const held = useRef(false);
  const move = useRef<(x: number, y: number) => void>(() => {});
  const finish = useRef<(save: boolean) => void>(() => {});
  function reorder(id: string, target: string) {
    if (id === target || busy) return;
    const ids = accounts.map(account => account.id);
    const from = ids.indexOf(id), to = ids.indexOf(target);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1); ids.splice(to, 0, id);
    setPreview(ids);
    void saveAccountOrder(ids).finally(() => setPreview(null)).catch(() => {}); // The provider presents failed saves in the top toast.
  }
  finish.current = save => {
    const current = dragRef.current;
    if (!current) return;
    dragRef.current = null; setDrag(null); onDraggingChange?.(false);
    if (!save || current.id === current.target) setPreview(null);
    if (save) reorder(current.id, current.target);
  };
  move.current = (x, y) => {
    const current = dragRef.current;
    if (!current) return;
    const target = accounts.find(account => {
      const box = bounds.current[account.id];
      return account.purpose === current.purpose && box && x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
    });
    const next = { ...current, dx: x - current.x, dy: y - current.y, target: target?.id ?? current.id };
    const ids = accounts.map(account => account.id);
    ids.splice(ids.indexOf(current.id), 1); ids.splice(accounts.findIndex(account => account.id === next.target), 0, current.id);
    setPreview(ids);
    dragRef.current = next; setDrag(next);
  };
  const [pan] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: () => !!dragRef.current,
    onPanResponderMove: (_event, gesture) => move.current(gesture.moveX, gesture.moveY),
    onPanResponderRelease: () => finish.current(true),
    onPanResponderTerminate: () => finish.current(false),
    onPanResponderTerminationRequest: () => false,
  }));
  useEffect(() => { if (busy) finish.current(false); }, [busy]);
  useEffect(() => () => { onDraggingChange?.(false); }, [onDraggingChange]);
  function start(id: string, purpose: string, x: number, y: number) {
    if (busy || compact || dragRef.current) return;
    held.current = true; bounds.current = {};
    const next = { id, purpose, x, y, dx: 0, dy: 0, target: id };
    dragRef.current = next; setDrag(next); onDraggingChange?.(true); Vibration.vibrate(15);
    for (const [key, node] of Object.entries(nodes.current)) node?.measureInWindow((left, top, width, height) => {
      if (dragRef.current?.id === id) bounds.current[key] = { x: left, y: top, width, height };
    });
  }
  const accountOrder = accounts.map(row => row.id).join('|');
  const cards = !compact && layout === 'cards';
  const active = accounts.filter((account) => !account.archived);
  const visible = compact ? active.slice(0, 3) : accounts.filter((account) => showArchived || !account.archived);
  return <View style={{ gap: 12 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
      <ThemedText type="smallBold" accessibilityRole="header">Your accounts</ThemedText>
      <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
        {compact ? <ActionButton compact label="View all" disabled={busy} onPress={() => router.navigate('/accounts')} /> : (['cards', 'list'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value === 'cards' ? 'Account cards' : 'Account list'} accessibilityState={{ selected: layout === value }} disabled={busy || !!drag} onPress={() => setLayout(value)} style={{ minWidth: 44, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: layout === value ? theme.backgroundSelected : theme.backgroundElement }}><Ionicons name={value === 'cards' ? 'grid-outline' : 'list-outline'} size={18} color={theme.accent} /></Pressable>)}
        {showAdd ? <ActionButton compact label="Add account" disabled={busy} onPress={() => router.push('/account')} /> : null}
      </View>
    </View>
    {(['spending', 'savings'] as const).map((purpose) => {
      const rows = visible.filter((account) => account.purpose === purpose);
      if (!rows.length) return null;
      const projected = preview && (drag || !preview.every((id, index) => accounts[index]?.id === id)) ? rows.slice().sort((a, b) => preview.indexOf(a.id) - preview.indexOf(b.id)) : rows;
      return <View key={purpose} style={{ gap: 8 }}>
        <ThemedText type="small" style={{ fontSize: 11, lineHeight: 16 }} themeColor="textSecondary" accessibilityRole="header">{purpose === 'spending' ? 'Spending' : 'Savings'}</ThemedText>
        <View {...pan.panHandlers} onTouchEnd={() => finish.current(true)} onTouchCancel={() => finish.current(false)} style={{ flexDirection: cards ? 'row' : 'column', flexWrap: 'wrap', gap: 10 }}>{rows.map((account) => {
          const balance = calculateAccountSummary(account, transactions, '1900-01').balance;
          const color = accountCardColor(account, dark);
          const original = bounds.current[account.id];
          const slot = bounds.current[rows[projected.findIndex(row => row.id === account.id)]?.id];
          const moving = drag?.id === account.id;
          const x = moving ? drag.dx : original && slot && preview ? slot.x - original.x : 0;
          const y = moving ? drag.dy : original && slot && preview ? slot.y - original.y : 0;
          return <MovingCard key={account.id} x={x} y={y} active={moving} order={accountOrder} style={{ ...(cards ? { flexBasis: fontScale > 1.3 ? '100%' : '47%', flexGrow: 0, minWidth: 135 } : { width: '100%' }), zIndex: moving ? 10 : 0 }}><Pressable ref={node => { nodes.current[account.id] = node; }} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy }} accessibilityLabel={account.name + ', ' + formatMoney(balance) + (account.archived ? ', archived' : '')}
            accessibilityHint={compact ? undefined : 'Hold and drag to rearrange within this group.'}
            accessibilityActions={compact ? undefined : [{ name: 'increment', label: 'Move later' }, { name: 'decrement', label: 'Move earlier' }]}
            onAccessibilityAction={event => {
              const index = rows.findIndex(row => row.id === account.id);
              const next = rows[index + (event.nativeEvent.actionName === 'increment' ? 1 : -1)];
              if (next) reorder(account.id, next.id);
            }}
            delayLongPress={350} onPressIn={() => { held.current = false; }}
            onLongPress={event => start(account.id, purpose, event.nativeEvent.pageX, event.nativeEvent.pageY)}
            onPress={() => { if (!held.current) router.push({ pathname: '/account', params: { id: account.id } }); }}
            style={({ pressed }) => ({ ...(cards ? { minHeight: 154 } : { width: '100%' }), padding: 14, borderRadius: cards ? 20 : 16, borderWidth: 1, borderColor: drag?.target === account.id ? theme.accent : account.archived || !cards ? theme.border : color, boxShadow: cards ? '0 3px 8px rgba(20, 36, 67, 0.08)' : undefined, flexDirection: cards ? 'column' : 'row', alignItems: cards ? 'stretch' : 'center', gap: 10, backgroundColor: cards && !account.archived ? color : theme.backgroundElement, opacity: busy ? 0.5 : drag?.id === account.id ? 0.95 : pressed ? 0.5 : 1, zIndex: drag?.id === account.id ? 10 : 0, elevation: drag?.id === account.id ? 8 : 0, transform: drag?.id === account.id ? [{ scale: 1.04 }] : [] })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: cards ? undefined : 1 }}>
              <Ionicons name={purpose === 'savings' ? 'shield-checkmark-outline' : 'wallet-outline'} size={20} color={cards && !account.archived ? cardText : color} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <ThemedText type="smallBold" numberOfLines={1} style={{ fontSize: 12, lineHeight: 17, color: cards && !account.archived ? cardText : theme.text }}>{account.name}</ThemedText>
                <ThemedText type="small" style={{ fontSize: 10, lineHeight: 14, color: cards && !account.archived ? cardText : theme.textSecondary }}>{account.archived ? 'Archived / PHP' : purpose === 'savings' ? 'Savings / PHP' : 'Spending / PHP'}</ThemedText>
              </View>
            </View>
            <View style={{ gap: 3, marginTop: cards ? 'auto' : 0 }}>
              <ThemedText type="small" style={{ fontSize: 10, lineHeight: 14, color: cards && !account.archived ? cardText : theme.textSecondary }}>CURRENT BALANCE</ThemedText>
              <ThemedText style={{ fontSize: cards ? 18 : 16, lineHeight: 24, fontWeight: '700', fontVariant: ['tabular-nums'], color: cards && !account.archived ? cardText : theme.text }}>{formatMoney(balance)}</ThemedText>
              {balance < 0 ? <ThemedText type="small" accessibilityRole="alert" style={{ color: cards && !account.archived ? cardText : theme.text }}>Negative balance</ThemedText> : null}
            </View>
            {cards ? <ThemedText type="small" style={{ fontSize: 10, lineHeight: 14, color: account.archived ? theme.textSecondary : cardText }}>{account.includedInAvailable ? 'Included in Available Money' : 'Excluded from Available Money'}</ThemedText> : <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />}
          </Pressable></MovingCard>;
        })}</View>
      </View>;
    })}
    {visible.length === 0 ? <ThemedText type="small">No active accounts. Add one or show archived accounts.</ThemedText> : null}
    {!compact && accounts.some((account) => account.archived) ? <ActionButton compact label={showArchived ? 'Hide archived accounts' : 'Show archived accounts'} selected={showArchived} disabled={busy || !!drag} onPress={() => setShowArchived(!showArchived)} /> : null}
  </View>;
}
