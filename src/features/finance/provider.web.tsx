import type { ReactNode } from 'react';
import { ThemedText } from '@/components/themed-text';
import { FinanceScreen } from './components/ui';
import type { FinanceState } from './provider';

// Avoid bundling native SQLite into the unsupported web preview.
export function FinanceProvider({ children: _children }: { children: ReactNode }) {
  return <FinanceScreen title="Kuwenta"><ThemedText>Open Kuwenta on your Android phone to access your local financial records.</ThemedText></FinanceScreen>;
}
export function useFinance(): FinanceState {
  throw new Error('Financial records are available in the native app.');
}
