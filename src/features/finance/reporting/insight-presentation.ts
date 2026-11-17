/** Presentation only: the recorded insight remains the source of the explanation. */
export function insightPresentation(message: string) {
  if (/shows -/.test(message)) return { title: 'An account needs a balance check', icon: 'alert-circle-outline' } as const;
  if (/Your budgets have/.test(message)) return { title: 'Budget limits exceed available money', icon: 'wallet-outline' } as const;
  if (/more than your .* (?:budget|limit)/.test(message)) return { title: 'Spending passed a budget limit', icon: 'alert-circle-outline' } as const;
  if (/You've used your/.test(message)) return { title: 'A budget limit has been reached', icon: 'pie-chart-outline' } as const;
  if (/You've spent .* remains/.test(message)) return { title: 'A budget is near its limit', icon: 'pie-chart-outline' } as const;
  if (/left for|spending limit/.test(message)) return { title: 'Your remaining budget', icon: 'pie-chart-outline' } as const;
  if (/goal reached/.test(message)) return { title: 'You reached a savings goal', icon: 'flag-outline' } as const;
  if (/goal has/.test(message)) return { title: 'Your savings goal progress', icon: 'flag-outline' } as const;
  if (/more so far|more over the first|more during/.test(message)) return { title: 'Spending increased this month', icon: 'trending-up-outline' } as const;
  if (/less so far|less over the first|less during/.test(message)) return { title: 'Spending decreased this month', icon: 'trending-down-outline' } as const;
  if (/moved into savings|moved out of savings/.test(message)) return { title: 'Money moved in your savings', icon: 'swap-horizontal-outline' } as const;
  if (/owe you|owed to you|You lent|in repayments/.test(message)) return { title: 'Money owed to you', icon: 'people-outline' } as const;
  if (/left to repay|remains to repay|in borrowed money|You repaid/.test(message)) return { title: 'Your borrowing and repayments', icon: 'people-outline' } as const;
  if (/fees this month/.test(message)) return { title: 'Your cash-in and cash-out fees', icon: 'receipt-outline' } as const;
  if (/service-exchange earnings/.test(message)) return { title: 'Your service-exchange earnings', icon: 'cash-outline' } as const;
  if (/moved from/.test(message)) return { title: 'Money moved between your accounts', icon: 'swap-horizontal-outline' } as const;
  if (/balance adjustment|Balance adjustment/.test(message)) return { title: 'An account balance was corrected', icon: 'create-outline' } as const;
  if (/is archived but still holds/.test(message)) return { title: 'An archived account still has money', icon: 'archive-outline' } as const;
  if (/excluded from Available Money/.test(message)) return { title: 'Some money is excluded from spending', icon: 'wallet-outline' } as const;
  if (/is in savings accounts/.test(message)) return { title: 'Your savings and spending money', icon: 'wallet-outline' } as const;
  if (/holds .* total money/.test(message)) return { title: 'Where most of your money is held', icon: 'wallet-outline' } as const;
  if (/largest income source/.test(message)) return { title: 'Your largest income source', icon: 'cash-outline' } as const;
  if (/made up .* spending this month/.test(message)) return { title: 'Your largest spending category', icon: 'bar-chart-outline' } as const;
  if (/You spent .* from/.test(message)) return { title: 'The account you spent from most', icon: 'card-outline' } as const;
  if (/money you already had/.test(message)) return { title: 'Spending from existing money', icon: 'wallet-outline' } as const;
  return { title: 'Your recorded money activity', icon: 'bulb-outline' } as const;
}
