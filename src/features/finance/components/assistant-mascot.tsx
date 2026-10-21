import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/hooks/use-theme';

export function AssistantMascot({ thinking = false, concerned = false, animated = false, size = 44, children }: { thinking?: boolean; concerned?: boolean; animated?: boolean; size?: number; children?: ReactNode }) {
  const theme = useTheme();
  const [reducedMotion, setReducedMotion] = useState(true);
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!animated) return;
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReducedMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, [animated]);
  useEffect(() => {
    if (!animated || reducedMotion) { pulse.setValue(0); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true, isInteraction: false }),
      Animated.timing(pulse, { toValue: 0, duration: 550, useNativeDriver: true, isInteraction: false }),
    ]));
    animation.start();
    return () => { animation.stop(); pulse.setValue(0); };
  }, [animated, reducedMotion, pulse]);
  return <View accessible={false} style={{ flexDirection: children ? 'row' : 'column', alignItems: 'center', gap: children ? 10 : 3, flexShrink: 1 }}>
    <Animated.View style={{ transform: [{ translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] }}>
      <Image source={thinking ? require('../../../../assets/images/mascot/thinking.png') : concerned ? require('../../../../assets/images/mascot/concerned.png') : require('../../../../assets/images/mascot/friendly.png')}
        accessible={false} contentFit="contain" style={{ width: size, height: size }} />
    </Animated.View>
    {children || animated ? <View style={{ alignItems: 'flex-start', gap: 4, flexShrink: 1 }}>{children}
    {animated ? <View style={{ flexDirection: 'row', gap: 4 }}>{[0, 1, 2].map(index => <Animated.View key={index} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: theme.accent, opacity: reducedMotion ? 1 : pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: index === 1 ? [1, 0.35, 1] : [0.35, 1, 0.35] }) }} />)}</View> : null}
    </View> : null}
  </View>;
}
