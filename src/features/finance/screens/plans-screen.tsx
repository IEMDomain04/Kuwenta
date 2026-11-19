import { DebtsOverview } from '../components/debts/debts-overview';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useFinance } from '../provider';
import { philippineDateTime } from '../domain/dates';
import { BudgetOverview } from '../components/budgets/budget-overview';
import { SavingsOverview } from '../components/savings/savings-overview';
import { FinanceScreen, AddTransactionButton } from '../components/shared/ui';

export default function PlansScreen() {
  const [draggingBudget, setDraggingBudget] = useState(false);
  const { busy } = useFinance();
  const params = useLocalSearchParams<{ section?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const debtsY = useRef<number | null>(null);
  const contentHeight = useRef(0);
  const pendingDebts = useRef(params.section === 'debts');
  function revealDebts() {
    if (!pendingDebts.current || debtsY.current === null || contentHeight.current <= debtsY.current || !scrollRef.current) return;
    scrollRef.current.scrollTo({ y: Math.max(0, debtsY.current - 12), animated: true });
    pendingDebts.current = false;
    router.setParams({ section: undefined });
  }
  useEffect(() => {
    pendingDebts.current = params.section === 'debts';
    revealDebts();
  }, [params.section]);
  const month = philippineDateTime().transactionDate.slice(0, 7);
  return <FinanceScreen title="Plans" scrollRef={scrollRef} onContentSizeChange={(_, height) => { contentHeight.current = height; revealDebts(); }} scrollEnabled={!draggingBudget} floatingAction={<AddTransactionButton disabled={busy} />}>
    <BudgetOverview reportingMonth={month} onDraggingChange={setDraggingBudget} />
    <SavingsOverview reportingMonth={month} />
    <View onLayout={event => { debtsY.current = event.nativeEvent.layout.y; revealDebts(); }}>
      <DebtsOverview />
    </View>
  </FinanceScreen>;
}
