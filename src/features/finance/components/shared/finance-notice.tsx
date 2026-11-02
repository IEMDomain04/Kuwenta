import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { useAmountVisibility } from '@/hooks/amount-visibility';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export type FinanceNoticeData = { message: string; detail?: string; expiresAt?: number; tone?: 'success' | 'info' | 'income' | 'expense' | 'error' };

export function FinanceNotice({ notice, onDismiss }: { notice: FinanceNoticeData | null; onDismiss: () => void }) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const { conceal } = useAmountVisibility();
  const insets = useSafeAreaInsets();
  const [displayed, setDisplayed] = useState(notice);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [opaque, setOpaque] = useState(true);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); }).catch(() => {});
    const transparency = Platform.OS === 'ios' ? AccessibilityInfo.isReduceTransparencyEnabled() : AccessibilityInfo.isHighTextContrastEnabled();
    void transparency.then(value => { if (active) setOpaque(value); }).catch(() => {});
    const motionListener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const transparencyListener = Platform.OS === 'ios' ? AccessibilityInfo.addEventListener('reduceTransparencyChanged', setOpaque) : undefined;
    return () => { active = false; motionListener.remove(); transparencyListener?.remove(); };
  }, []);
  useEffect(() => {
    if (notice) setDisplayed(notice);
    const animation = Animated.timing(progress, { toValue: notice ? 1 : 0, duration: reduceMotion ? 0 : notice ? 180 : 140, useNativeDriver: true });
    animation.start(({ finished }) => { if (finished && !notice) setDisplayed(null); });
    return () => animation.stop();
  }, [notice, reduceMotion, progress]);
  if (!displayed) return null;
  const color = displayed.tone === 'expense' || displayed.tone === 'error' ? theme.error : displayed.tone === 'info' ? theme.secondary : theme.income;
  const message = conceal(displayed.message);
  const detail = displayed.detail ? conceal(displayed.detail) : '';
  return <View pointerEvents={notice ? 'box-none' : 'none'} style={{ position: 'absolute', top: insets.top + 80, left: Math.max(16, insets.left), right: Math.max(16, insets.right), zIndex: 1000, alignItems: 'center' }}>
    <Animated.View style={{ width: '100%', maxWidth: 320, borderRadius: 28, backgroundColor: opaque ? theme.backgroundElement : dark ? 'rgba(18,39,29,0.92)' : 'rgba(244,253,247,0.90)', borderWidth: 1, borderColor: opaque ? theme.border : dark ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.95)', shadowColor: dark ? '#000000' : '#063B25', shadowOffset: { width: 0, height: 4 }, shadowOpacity: dark ? 0.24 : 0.14, shadowRadius: 12, elevation: 5, opacity: progress, transform: [{ translateY: reduceMotion ? 0 : progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }}>
      <View style={{ borderRadius: 28, overflow: 'hidden' }}>
        {!opaque ? <LinearGradient pointerEvents="none" colors={dark ? ['rgba(255,255,255,0.09)', 'rgba(255,255,255,0.01)'] : ['rgba(255,255,255,0.65)', 'rgba(255,255,255,0.03)']} start={{ x: 0, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} /> : null}
        <View style={{ paddingLeft: 12, paddingRight: 4, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View accessible={false} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: color + '20', justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons accessible={false} name={displayed.tone === 'error' ? 'alert-circle-outline' : displayed.tone === 'income' ? 'arrow-up' : displayed.tone === 'expense' ? 'arrow-down' : displayed.tone === 'info' ? 'information' : 'checkmark'} size={17} color={color} />
          </View>
          <View accessible accessibilityLabel={message + (detail ? '. ' + detail : '')} accessibilityRole={displayed.tone === 'error' ? 'alert' : undefined} accessibilityLiveRegion={displayed.tone === 'error' ? 'assertive' : 'polite'} style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <ThemedText type="smallBold" style={{ color: theme.text, fontSize: 13, lineHeight: 18 }}>{message}</ThemedText>
            {detail ? <ThemedText type="small" style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 17 }}>{detail}</ThemedText> : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notice" onPress={onDismiss} style={({ pressed }) => ({ minHeight: 44, minWidth: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
            <Ionicons accessible={false} name="close" size={16} color={theme.textSecondary} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  </View>;
}
