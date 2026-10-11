import { SavingsOverview } from '../components/savings-overview';
import { FinanceScreen } from '../components/ui';
export default function GoalsScreen() {
  return <FinanceScreen title="Savings & Goals" tabScreen={false}><SavingsOverview /></FinanceScreen>;
}
