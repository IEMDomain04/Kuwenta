import { AccountsOverview } from '../components/accounts-overview';
import { FinanceScreen } from '../components/ui';
export default function AccountsScreen() {
  return <FinanceScreen title="Accounts" tabScreen={false}><AccountsOverview /></FinanceScreen>;
}
