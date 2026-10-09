const cash = {
  id: 'cash', name: 'Cash', currency: 'PHP', openingBalance: 100000,
  purpose: 'spending', includedInAvailable: true, archived: false,
};
function record(overrides = {}) {
  return {
    id: 'expense-1', accountId: 'cash', type: 'EXPENSE', amount: 12000, category: 'Food',
    transactionDate: '2026-10-09', transactionTime: '14:35:00',
    createdAt: '2026-10-09T06:35:00.000Z', updatedAt: '2026-10-09T06:35:00.000Z',
    ...overrides,
  };
}
module.exports = { cash, record };
