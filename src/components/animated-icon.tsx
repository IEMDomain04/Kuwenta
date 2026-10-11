import { useTheme } from '@/hooks/use-theme';
import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';

export function AnimatedSplashOverlay() {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!ready) return;
    const fade = Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true });
    fade.start(({ finished }) => { if (finished) setVisible(false); });
    return () => fade.stop();
  }, [ready, opacity]);

  if (!visible) return null;
  return <Animated.View
    onLayout={() => { if (!ready) SplashScreen.hideAsync().finally(() => setReady(true)); }}
    style={[styles.overlay, { opacity, backgroundColor: theme.background }]}>
    <Image style={styles.image} source={require('@/assets/images/expo-logo.png')} />
  </Animated.View>;
}

const styles = StyleSheet.create({
  image: { width: 76, height: 71 },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
