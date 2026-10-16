import { isValidDate, isValidMonth, readableReportingMonth } from './dates';

/** Display only: leave invalid dates unchanged; storage keeps its original date keys. */
export function readableAssistantDates(text: string): string {
  return text.replace(/\b\d{4}-\d{2}(?:-\d{2})?\b(?![-\w])/g, value => {
    if (isValidMonth(value)) return readableReportingMonth(value);
    if (!isValidDate(value)) return value;
    const month = readableReportingMonth(value.slice(0, 7));
    return month.slice(0, -5) + ' ' + Number(value.slice(8)) + ', ' + value.slice(0, 4);
  });
}
export type AssistantTextBlock = { marker?: string; parts: { text: string; bold: boolean }[] };
/** Deliberately supports just paragraphs, simple lists, and paired **bold** spans. */
export function assistantTextBlocks(text: string, streaming = false): AssistantTextBlock[] {
  if (streaming && (text.match(/\*\*/g)?.length ?? 0) % 2) {
    const open = text.lastIndexOf('**'); text = text.slice(0, open) + text.slice(open + 2);
  }
  const blocks: { marker?: string; text: string }[] = [];
  let paragraph: string[] = [];
  function flush() { if (paragraph.length) blocks.push({ text: paragraph.join('\n') }); paragraph = []; }
  for (const line of readableAssistantDates(text).split(/\r?\n/)) {
    const list = line.match(/^\s*([-*\u2022]|\d+[.)])\s+(.+)$/);
    if (!line.trim()) flush();
    else if (list) { flush(); blocks.push({ marker: /^\d/.test(list[1]) ? list[1] : '\u2022', text: list[2] }); }
    else paragraph.push(line);
  }
  flush();
  return blocks.map(block => {
    const parts: AssistantTextBlock['parts'] = [];
    let offset = 0;
    for (const match of block.text.matchAll(/\*\*([^*\n]+)\*\*/g)) {
      if (match.index > offset) parts.push({ text: block.text.slice(offset, match.index), bold: false });
      parts.push({ text: match[1], bold: true }); offset = match.index + match[0].length;
    }
    if (offset < block.text.length) parts.push({ text: block.text.slice(offset), bold: false });
    return { marker: block.marker, parts };
  });
}
