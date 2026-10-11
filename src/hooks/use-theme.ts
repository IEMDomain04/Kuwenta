import { Colors } from '@/constants/theme';
import { useColorScheme } from './use-color-scheme';
export function useTheme() { return Colors[useColorScheme()]; }
