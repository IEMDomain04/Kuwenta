import { SavingsOverview } from '../components/savings/savings-overview';
import { FinanceScreen } from '../components/shared/ui';
export default function GoalsScreen() {
  return <FinanceScreen title="Savings & Goals" tabScreen={false}><SavingsOverview /></FinanceScreen>;
}
