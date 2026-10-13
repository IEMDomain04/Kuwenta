import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, Vibration, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from '@/components/themed-text';
import type { budgetReport } from '../budgets';

type Row = ReturnType<typeof budgetReport>['rows'][number];
function MovingBudget({ y, active, order, children }: { y: number; active: boolean; order: string; children: ReactNode }) {
  const [position] = useState(() => new Animated.Value(0));
  const previous = useRef(order);
  useLayoutEffect(() => {
    if (active || previous.current !== order) { previous.current = order; position.setValue(y); return; }
    const animation = Animated.timing(position, { toValue: y, duration: 160, useNativeDriver: true });
    animation.start(); return () => animation.stop();
  }, [position, y, active, order]);
  return <Animated.View style={{ transform: [{ translateY: position }], zIndex: active ? 10 : 0, opacity: active ? 0.9 : 1 }}>{children}</Animated.View>;
}

export function BudgetList({ rows, disabled, onReorder, onDraggingChange, renderRow }: {
  rows: Row[]; disabled: boolean; onReorder: (categories: string[]) => Promise<void>;
  onDraggingChange?: (dragging: boolean) => void; renderRow: (row: Row, onHold: NonNullable<React.ComponentProps<typeof Pressable>['onLongPress']>) => ReactNode;
}) {
  const theme = useTheme();
  type Drag = { token: number; id: string; start: number; dy: number; target: string };
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const saving = useRef(false);
  const gesture = useRef(0);
  const nodes = useRef<Record<string, View | null>>({});
  const bounds = useRef<Record<string, { top: number; height: number }>>({});
  const finish = useRef<(save: boolean) => void>(() => {});
  const move = useRef<(y: number) => void>(() => {});
  const order = rows.map(row => row.category);
  function reorder(id: string, target: string) {
    if (disabled || saving.current || id === target) return;
    const next = [...order];
    const from = next.indexOf(id), to = next.indexOf(target);
    if (from < 0 || to < 0) return;
    next.splice(from, 1); next.splice(to, 0, id);
    saving.current = true; setPreview(next);
    void (async () => {
      try { await onReorder(next); }
      catch { /* The provider presents save failures. Allow another attempt. */ }
      finally { saving.current = false; bounds.current = {}; setPreview(null); }
    })();
  }
  finish.current = save => {
    const current = dragRef.current;
    if (!current) return;
    dragRef.current = null; gesture.current++; setDrag(null); onDraggingChange?.(false); setPreview(null);
    if (save) reorder(current.id, current.target);
  };
  move.current = y => {
    const current = dragRef.current;
    if (!current) return;
    const measured = order.filter(id => bounds.current[id]);
    if (!measured.length) return;
    const target = measured.reduce((best, id) => Math.abs(y - bounds.current[id].top - bounds.current[id].height / 2) < Math.abs(y - bounds.current[best].top - bounds.current[best].height / 2) ? id : best);
    const next = [...order]; next.splice(next.indexOf(current.id), 1); next.splice(order.indexOf(target), 0, current.id);
    const value = { ...current, dy: y - current.start, target };
    dragRef.current = value; setDrag(value); setPreview(next);
  };
  const [pan] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: () => !!dragRef.current,
    onPanResponderMove: (_event, gesture) => move.current(gesture.moveY),
    onPanResponderRelease: () => finish.current(true),
    onPanResponderTerminate: () => finish.current(false),
    onPanResponderTerminationRequest: () => false,
  }));
  useEffect(() => { if (disabled) finish.current(false); }, [disabled]);
  useEffect(() => () => { dragRef.current = null; gesture.current++; onDraggingChange?.(false); }, [onDraggingChange]);
  const projectedTops: Record<string, number> = {};
  let top = bounds.current[order[0]]?.top ?? 0;
  for (const id of preview ?? order) { projectedTops[id] = top; top += (bounds.current[id]?.height ?? 0) + 12; }
  return <View style={{ gap: 12 }}>
    <View {...pan.panHandlers} onTouchEnd={() => finish.current(true)} onTouchCancel={() => finish.current(false)} style={{ gap: 12 }}>
      {rows.map(row => {
        const active = drag?.id === row.category;
        const hold: NonNullable<React.ComponentProps<typeof Pressable>['onLongPress']> = event => {
          if (disabled || rows.length < 2 || saving.current || dragRef.current) return;
          const current = { token: ++gesture.current, id: row.category, start: event.nativeEvent.pageY, dy: 0, target: row.category };
          bounds.current = {}; dragRef.current = current; setDrag(current); onDraggingChange?.(true); Vibration.vibrate(15);
          for (const [id, node] of Object.entries(nodes.current)) node?.measureInWindow((_x, top, _width, height) => { if (dragRef.current?.token === current.token) bounds.current[id] = { top, height }; });
        };
        return <MovingBudget key={row.category} order={order.join('|')} active={active} y={active ? drag!.dy : preview && bounds.current[row.category] ? projectedTops[row.category] - bounds.current[row.category].top : 0}>
          <Pressable collapsable={false} ref={node => { nodes.current[row.category] = node; }} accessibilityRole="button" accessibilityLabel={row.category + ' budget'} accessibilityHint="Hold and drag to rearrange."
            disabled={disabled} delayLongPress={350} onLongPress={hold}
            accessibilityActions={[{ name: 'increment', label: 'Move later' }, { name: 'decrement', label: 'Move earlier' }]}
            onAccessibilityAction={event => { const next = order[order.indexOf(row.category) + (event.nativeEvent.actionName === 'increment' ? 1 : -1)]; if (next) reorder(row.category, next); }}
            style={{ padding: 12, borderRadius: 16, backgroundColor: active ? theme.backgroundSelected : theme.backgroundElement, borderWidth: 1, borderColor: active ? theme.accent : theme.border, elevation: active ? 8 : 0, transform: [{ scale: active ? 1.025 : 1 }], gap: 6 }}>
            {active ? <ThemedText type="small" themeColor="accent" accessibilityLiveRegion="polite" style={{ position: 'absolute', top: -20, right: 8, fontSize: 10, lineHeight: 16, backgroundColor: theme.backgroundSelected, paddingHorizontal: 6, borderRadius: 6 }}>Move to rearrange</ThemedText> : null}
            {renderRow(row, hold)}
          </Pressable>
        </MovingBudget>;
      })}
    </View>
  </View>;
}
