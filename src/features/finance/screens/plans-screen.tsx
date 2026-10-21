import { DebtsOverview } from '../components/debts-overview';
import { useState } from 'react';
import { useFinance } from '../provider';
import { philippineDateTime } from '../dates';
import { BudgetOverview } from '../components/budget-overview';
import { SavingsOverview } from '../components/savings-overview';
import { FinanceScreen, AddTransactionButton } from '../components/ui';

export default function PlansScreen() {
  const [draggingBudget, setDraggingBudget] = useState(false);
  const { busy, assistantEnabled } = useFinance();
  const month = philippineDateTime().transactionDate.slice(0, 7);
  return <FinanceScreen title="Plans" scrollEnabled={!draggingBudget} floatingAction={<AddTransactionButton disabled={busy} assistantEnabled={assistantEnabled} />}>
    <BudgetOverview reportingMonth={month} onDraggingChange={setDraggingBudget} />
    <SavingsOverview reportingMonth={month} />
    <DebtsOverview />
  </FinanceScreen>;
}
