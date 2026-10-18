import 'expo-sqlite/localStorage/install';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { formatMoney } from '@/features/finance/money';

const key = 'kuwenta.hideAmounts';
export const HIDDEN_AMOUNT = '\u2022\u2022\u2022\u2022';
export function concealAmounts(text: string, hidden: boolean): string {
  return hidden ? text.replace(/-?(?:\u20b1|PHP\s*)\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?%/g, HIDDEN_AMOUNT) : text;
}
const Context = createContext({ hidden: false, toggle: () => {} });
export function AmountVisibilityProvider({ children }: { children: ReactNode }) {
  // Read synchronously so a saved hidden preference never flashes amounts on startup.
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(key) === 'true'; } catch { return false; }
  });
  function toggle() {
    const next = !hidden;
    try { localStorage.setItem(key, String(next)); } catch { /* Still support hiding for this session. */ }
    setHidden(next);
  }
  return <Context.Provider value={{ hidden, toggle }}>{children}</Context.Provider>;
}
export function useAmountVisibility() {
  const state = useContext(Context);
  const formatAmount = useCallback((amount: number, trimWhole = false) => state.hidden ? HIDDEN_AMOUNT : formatMoney(amount, trimWhole), [state.hidden]);
  const conceal = useCallback((text: string) => concealAmounts(text, state.hidden), [state.hidden]);
  return { ...state, formatAmount, conceal };
}
