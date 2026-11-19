export type InsightAction = {
  label: string;
  pathname: '/(tabs)/transactions' | '/(tabs)/accounts' | '/(tabs)/plans' | '/budgets' | '/goals' | '/account';
  params?: Record<string, string>;
  month?: string;
};
export type FinancialInsight = {
  message: string;
  title: string;
  summary: string;
  icon: 'wallet-outline' | 'pie-chart-outline' | 'flag-outline' | 'swap-horizontal-outline' | 'trending-up-outline' | 'trending-down-outline' | 'people-outline' | 'cash-outline' | 'receipt-outline' | 'create-outline' | 'archive-outline' | 'bar-chart-outline' | 'alert-circle-outline' | 'bulb-outline';
  calculation: string;
  meaning?: string;
  figures?: { label: string; value: string }[];
  action?: InsightAction;
};

// Keep existing plain messages for mascot reactions and existing consumers.
// Details are supplied beside the calculation, never inferred from its wording.
export function insightDetailsCollector() {
  const entries = new Map<string, FinancialInsight>();
  return {
    describe(message: string, detail: Omit<FinancialInsight, 'message'>): string {
      entries.set(message, { message, ...detail });
      return message;
    },
    selected(messages: readonly string[]) {
      return messages.map(message => {
        const entry = entries.get(message);
        if (!entry) throw new Error('Missing insight details.');
        return entry;
      });
    },
  };
}

export const unavailableInsight: FinancialInsight = {
  message: 'Insights are unavailable. Review your records in Accounts and History.',
  title: 'Insights are unavailable', summary: 'You can still review your recorded activity.',
  icon: 'bulb-outline', calculation: 'An insight could not be calculated from the current records.',
  action: { label: 'Review accounts', pathname: '/(tabs)/accounts' },
};
