export type SpendingBlock = { category: string; amount: number; x: number; y: number; width: number; height: number };

/** Divide a rectangle by spending weight, keeping every category's area proportional. */
export function spendingBlocks(rows: readonly { category: string; amount: number }[], width: number, height: number): SpendingBlock[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];
  const items = rows.filter(row => Number.isSafeInteger(row.amount) && row.amount > 0)
    .slice().sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
  const blocks: SpendingBlock[] = [];
  function divide(group: typeof items, x: number, y: number, w: number, h: number) {
    if (!group.length) return;
    if (group.length === 1) { blocks.push({ ...group[0], x, y, width: w, height: h }); return; }
    const total = group.reduce((sum, row) => sum + row.amount, 0);
    let split = 1;
    let first = group[0].amount;
    while (split < group.length - 1 && Math.abs(first + group[split].amount - total / 2) < Math.abs(first - total / 2)) {
      first += group[split++].amount;
    }
    const ratio = first / total;
    if (w >= h) {
      divide(group.slice(0, split), x, y, w * ratio, h);
      divide(group.slice(split), x + w * ratio, y, w * (1 - ratio), h);
    } else {
      divide(group.slice(0, split), x, y, w, h * ratio);
      divide(group.slice(split), x, y + h * ratio, w, h * (1 - ratio));
    }
  }
  divide(items, 0, 0, width, height);
  return blocks;
}
