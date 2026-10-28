const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spendingBlocks } = require('../../.expo/finance-tests/spending-blocks.js');

function verify(amounts, width = 320, height = 184) {
  const rows = amounts.map((amount, i) => ({ category: 'Category ' + i, amount }));
  const before = JSON.stringify(rows);
  const blocks = spendingBlocks(rows, width, height);
  assert.equal(JSON.stringify(rows), before);
  assert.equal(blocks.length, rows.length);
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  for (const block of blocks) {
    for (const value of [block.x, block.y, block.width, block.height]) assert.ok(Number.isFinite(value) && value >= 0);
    assert.ok(block.x + block.width <= width + 1e-8);
    assert.ok(block.y + block.height <= height + 1e-8);
    assert.ok(Math.abs(block.width * block.height / (width * height) - block.amount / total) < 1e-10);
  }
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
    const a = blocks[i], b = blocks[j];
    assert.ok(Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) <= 1e-8 || Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) <= 1e-8);
  }
  assert.ok(Math.abs(blocks.reduce((sum, block) => sum + block.width * block.height, 0) - width * height) < 1e-7);
}

test('spending blocks preserve proportional area without overlap on narrow and wide cards', () => {
  for (const amounts of [[100], [95, 5], [100, 100, 100], [9000000000000000, 1], Array.from({ length: 45 }, (_, i) => i + 1)]) {
    verify(amounts); verify(amounts, 180, 240); verify(amounts, 640, 184);
  }
});

test('empty and unmeasured charts have no invalid rectangles', () => {
  for (const width of [0, -1, Infinity, NaN]) assert.deepEqual(spendingBlocks([{ category: 'Meals', amount: 100 }], width, 184), []);
  assert.deepEqual(spendingBlocks([], 320, 184), []);
  assert.deepEqual(spendingBlocks([{ category: 'Meals', amount: 0 }], 320, 184), []);
});
