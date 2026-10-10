import type { SavingsGoal } from '../types';
import { validateGoal } from '../validation';
import { calculateGoalProgress } from '../calculations';
import { listAccounts } from './accounts';
import { listTransactions } from './transactions';
import type { FinanceDatabase } from './database';

export async function listGoals(db: FinanceDatabase): Promise<SavingsGoal[]> {
  const rows = await db.getAllAsync<Omit<SavingsGoal, 'targetDate'> & { targetDate: string | null }>('SELECT * FROM goals ORDER BY createdAt, id');
  const accounts = await listAccounts(db);
  return rows.map((row) => {
    const goal = { ...row, targetDate: row.targetDate ?? undefined };
    validateGoal(goal, accounts);
    return goal;
  });
}
export async function saveGoal(db: FinanceDatabase, goal: SavingsGoal, creating: boolean): Promise<void> {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const accounts = await listAccounts(transaction);
    validateGoal(goal, accounts);
    if (accounts.find((row) => row.id === goal.accountId)!.archived) throw new Error('Unarchive the savings account before saving the goal.');
    const existing = await transaction.getFirstAsync<SavingsGoal>('SELECT * FROM goals WHERE id = ?', goal.id);
    if (creating && existing) return;
    if (!creating && !existing) throw new Error('Goal no longer exists.');
    const linked = await transaction.getFirstAsync<{ id: string }>('SELECT id FROM goals WHERE accountId = ? AND id <> ?', goal.accountId, goal.id);
    if (linked) throw new Error('This savings account already has a goal. Choose a dedicated account.');
    const saved = { ...goal, name: goal.name.trim(), createdAt: existing?.createdAt ?? goal.createdAt, updatedAt: [goal.updatedAt, existing?.updatedAt ?? ''].sort().at(-1)! };
    calculateGoalProgress(saved, accounts, await listTransactions(transaction));
    if (creating) await transaction.runAsync('INSERT INTO goals(id, name, accountId, targetAmount, targetDate, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)', saved.id, saved.name, saved.accountId, saved.targetAmount, saved.targetDate ?? null, saved.createdAt, saved.updatedAt);
    else await transaction.runAsync('UPDATE goals SET name = ?, accountId = ?, targetAmount = ?, targetDate = ?, updatedAt = ? WHERE id = ?', saved.name, saved.accountId, saved.targetAmount, saved.targetDate ?? null, saved.updatedAt, saved.id);
  });
}
export async function deleteGoal(db: FinanceDatabase, id: string): Promise<void> {
  await db.withExclusiveTransactionAsync(async (transaction) => { await transaction.runAsync('DELETE FROM goals WHERE id = ?', id); });
}
