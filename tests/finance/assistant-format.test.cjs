const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assistantTextBlocks, readableAssistantDates } = require('../../.expo/finance-tests/assistant-format.js');

test('assistant dates are readable and independent of device timezone; invalid dates stay intact', () => {
  assert.equal(readableAssistantDates('In 2026-10, recorded 2026-10-16.'), 'In October 2026, recorded October 16, 2026.');
  assert.equal(readableAssistantDates('2024-02-29 to 2026-03-01'), 'February 29, 2024 to March 1, 2026');
  for (const invalid of ['2026-02-29', '2026-13', '2026-10-99', '2026-10-16T12:00:00Z', 'account2026-10', '1899-12']) assert.equal(readableAssistantDates(invalid), invalid);
  assert.equal(readableAssistantDates('PHP 2026.10 and PHP 800.25'), 'PHP 2026.10 and PHP 800.25');
});
test('paired bold spans, paragraphs and lists preserve text and ordering without visible markup', () => {
  const blocks = assistantTextBlocks(`**You would have PHP 200 left.**

You have **PHP 1000** recorded.

- Budget: **PHP 300**
- 2026-10

1. Review records
2. Keep savings separate`);
  assert.equal(blocks.length, 6);
  assert.deepEqual(blocks[0].parts, [{ text: 'You would have PHP 200 left.', bold: true }]);
  assert.deepEqual(blocks[1].parts.map(part => part.bold), [false, true, false]);
  assert.equal(blocks[2].marker, '•');
  assert.equal(blocks[3].parts[0].text, 'October 2026');
  assert.equal(blocks[4].marker, '1.'); assert.equal(blocks[5].marker, '2.');
  assert.ok(blocks.every(block => block.parts.every(part => !part.text.includes('**'))));
});
test('literal HTML and unmatched markup remain plain text, without links or code execution', () => {
  const text = '<script>alert(1)</script> **unfinished';
  assert.deepEqual(assistantTextBlocks(text)[0].parts, [{ text, bold: false }]);
  assert.deepEqual(assistantTextBlocks(''), []);
  assert.deepEqual(assistantTextBlocks('A **first** and **second** amount.')[0].parts.filter(part => part.bold).map(part => part.text), ['first', 'second']);
});


test('an unfinished bold delimiter stays hidden while a checked reply is streaming', () => {
  const text = '**PHP 1000 available.';
  assert.ok(assistantTextBlocks(text, true).every(block => block.parts.every(part => !part.text.includes('**'))));
  assert.equal(assistantTextBlocks('**PHP 1000 available.**', true)[0].parts[0].bold, true);
});
