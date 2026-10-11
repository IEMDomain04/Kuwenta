import { philippineDateTime } from '../dates';
import { BudgetOverview } from '../components/budget-overview';
import { SavingsOverview } from '../components/savings-overview';
import { FinanceScreen } from '../components/ui';

export default function PlansScreen() {
  const month = philippineDateTime().transactionDate.slice(0, 7);
  return <FinanceScreen title="Plans">
    <BudgetOverview reportingMonth={month} />
    <SavingsOverview reportingMonth={month} />
  </FinanceScreen>;
}
