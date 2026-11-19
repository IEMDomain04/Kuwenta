import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useAmountVisibility } from '@/hooks/amount-visibility';
import type { FinancialInsight } from '../../reporting/insight-details';
import { useFinance } from '../../provider';

export function InsightsSheet({ visible, insights, onClose, title = 'Your money, at a glance' }: {
  visible: boolean; insights: readonly FinancialInsight[]; onClose: () => void; title?: string;
}) {
  const theme = useTheme();
  const { conceal } = useAmountVisibility();
  const { height } = useWindowDimensions();
  const { setMonth } = useFinance();
  const [selected, setSelected] = useState<string | null>(null);
  const [calculationFor, setCalculationFor] = useState<string | null>(null);
  const insight = insights.find(item => item.message === selected);
  useEffect(() => { if (!visible) { setSelected(null); setCalculationFor(null); } }, [visible]);
  function close() { setSelected(null); setCalculationFor(null); onClose(); }
  const calculationOpen = !!insight && calculationFor === insight.message;
  function backOrClose() { if (calculationOpen) setCalculationFor(null); else if (insight) setSelected(null); else close(); }
  function review() {
    if (!insight?.action) return;
    const { pathname, params, month } = insight.action;
    if (month) setMonth(month);
    close();
    router.push({ pathname, params });
  }
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={backOrClose}>
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.overlay }}>
      <View accessibilityElementsHidden={calculationOpen} importantForAccessibility={calculationOpen ? 'no-hide-descendants' : 'auto'} pointerEvents={calculationOpen ? 'none' : 'auto'} style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close insights" onPress={close} style={{ flex: 1 }} />
      <SafeAreaView edges={['bottom', 'left', 'right']} style={{ maxHeight: height * 0.85, backgroundColor: theme.backgroundElement, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
        <View accessibilityViewIsModal style={{ padding: 16, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {insight ? <Pressable accessibilityRole="button" accessibilityLabel="Back to insights" onPress={() => setSelected(null)} style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }}><Ionicons name="arrow-back" size={20} color={theme.text} /></Pressable> : null}
            <ThemedText type="smallBold" accessibilityRole="header" style={{ flex: 1 }}>{insight ? 'Insight details' : title}</ThemedText>
            <Pressable accessibilityRole="button" accessibilityLabel="Close insights" onPress={close} style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }}><Ionicons name="close" size={20} color={theme.text} /></Pressable>
          </View>
          <ScrollView key={insight?.message ?? 'list'} style={{ maxHeight: height * 0.62 }} contentContainerStyle={{ gap: 12, paddingBottom: 12 }}>
            {insight ? <>
              <View testID="insight-icon-row" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Ionicons accessible={false} name={insight.icon} size={24} color={theme.accent} />
                <Pressable accessibilityRole="button" accessibilityLabel="How this is calculated" accessibilityState={{ expanded: calculationOpen }} onPress={() => setCalculationFor(insight.message)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons accessible={false} name="help-circle-outline" size={18} color={theme.accent} />
                </Pressable>
              </View>
              <View style={{ gap: 4 }}>
                <ThemedText type="smallBold" style={{ fontSize: 18, lineHeight: 26 }}>{conceal(insight.title)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{conceal(insight.summary)}</ThemedText>
              </View>
              {insight.figures?.length ? <View testID="insight-figures" style={{ gap: 10, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.border }}>
              {insight.figures.map((figure, index) => <View key={index} style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 }}>
                <ThemedText type="small" themeColor="textSecondary" style={{ flexShrink: 1 }}>{conceal(figure.label)}</ThemedText>
                <ThemedText type="smallBold">{conceal(figure.value)}</ThemedText>
              </View>)}
              </View> : null}
              <View testID="insight-meaning" style={{ gap: 4 }}>
                <ThemedText type="smallBold">What this means</ThemedText>
                <ThemedText type="small">{conceal(insight.meaning ?? insight.message)}</ThemedText>
              </View>
              {insight.action ? <Pressable accessibilityRole="button" onPress={review} style={{ width: '100%', minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 12, backgroundColor: theme.backgroundSelected }}>
                <ThemedText type="smallBold" themeColor="accent" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{insight.action.label}</ThemedText><Ionicons accessible={false} name="arrow-forward" size={18} color={theme.accent} />
              </Pressable> : null}
            </> : insights.slice(0, 5).map((item, index) => <Pressable key={item.message} accessibilityRole="button" accessibilityHint="Opens the supporting figures and explanation" onPress={() => { setCalculationFor(null); setSelected(item.message); }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: index === 0 ? 14 : 4, paddingVertical: index === 0 ? 14 : 10, borderRadius: index === 0 ? 16 : 0, backgroundColor: index === 0 ? theme.backgroundSelected : undefined, opacity: pressed ? 0.7 : 1 })}>
              <Ionicons accessible={false} name={item.icon} size={index === 0 ? 22 : 18} color={theme.accent} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <ThemedText type="smallBold" style={index === 0 ? { fontSize: 16, lineHeight: 23 } : undefined}>{conceal(item.title)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{conceal(item.summary)}</ThemedText>
              </View>
              <Ionicons accessible={false} name="chevron-forward" size={16} color={theme.textSecondary} style={{ marginTop: 3 }} />
            </Pressable>)}
          </ScrollView>
        </View>
      </SafeAreaView>
      </View>
      {calculationOpen ? <View testID="insight-calculation-drawer" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end', backgroundColor: theme.overlay }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close calculation" onPress={() => setCalculationFor(null)} style={{ flex: 1 }} />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={{ maxHeight: height * 0.65, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: theme.backgroundElement }}>
          <View accessibilityViewIsModal style={{ padding: 16, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ThemedText type="smallBold" accessibilityRole="header" style={{ flex: 1 }}>How this is calculated</ThemedText>
              <Pressable accessibilityRole="button" accessibilityLabel="Close calculation" onPress={() => setCalculationFor(null)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons accessible={false} name="close" size={20} color={theme.text} /></Pressable>
            </View>
            <ScrollView style={{ maxHeight: height * 0.4 }} contentContainerStyle={{ paddingBottom: 12 }}>
              <ThemedText type="small" style={{ lineHeight: 22 }}>{conceal(insight.calculation)}</ThemedText>
            </ScrollView>
          </View>
        </SafeAreaView>
      </View> : null}
    </View>
  </Modal>;
}
