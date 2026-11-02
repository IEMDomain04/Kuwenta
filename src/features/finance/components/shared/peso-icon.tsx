import Svg, { Path } from 'react-native-svg';
export function PesoIcon({ color, size = 28 }: { color: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible accessibilityRole="image" accessibilityLabel="Philippine pesos"><Path d="M7 21V3H12C21 3 21 14 12 14H7M3 7H21M3 10H21" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
