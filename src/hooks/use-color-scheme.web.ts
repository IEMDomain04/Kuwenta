import { useAppearance } from './appearance-provider';
export function useColorScheme() { return useAppearance().scheme; }
