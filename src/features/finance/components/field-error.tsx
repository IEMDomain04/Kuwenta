import { ThemedText } from '@/components/themed-text';
export function FieldError({ message }: { message?: string }) {
  return message ? <ThemedText type="small" themeColor="error" accessibilityRole="alert" accessibilityLiveRegion="polite">{message}</ThemedText> : null;
}
