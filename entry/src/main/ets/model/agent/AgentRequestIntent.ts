// SPDX-License-Identifier: AGPL-3.0-or-later

function positiveCount(value: string): number {
  const count: number = Number(value);
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

/** 只识别带制卡量词的显式数量，避免把 1949 等知识内容误当卡片数。 */
export function inferRequestedCardCount(text: string): number {
  const compact: string = text.toLocaleLowerCase().replace(/\s+/g, '');
  const patterns: RegExp[] = [
    /(\d+)(?:张|道|个|条)(?:卡|题|闪卡)?/,
    /(\d+)(?:zhang|dao|ge|tiao)(?:ka|ti|flashcard)?/,
    /(\d+)(?:flashcards?|cards?)/
  ];
  for (const pattern of patterns) {
    const match: RegExpMatchArray | null = compact.match(pattern);
    if (match !== null && match.length > 1) {
      const count: number = positiveCount(match[1]);
      if (count > 0) { return count; }
    }
  }
  return 0;
}

/** 只在用户明确要求“年份本身作为填空答案”时启用确定性约束。 */
export function explicitYearClozeRequested(text: string): boolean {
  const compact: string = text.toLocaleLowerCase().replace(/\s+/g, '');
  if (/(?:年份|年代).*(?:填空|挖空|空白|空格)|(?:填空|挖空).*(?:年份|年代)/.test(compact)) {
    return true;
  }
  if (/(?:考察|考查|测试).*(?:年份|年代)/.test(compact)) { return true; }
  if (/(?:year|date).*(?:cloze|blank|answer)|(?:cloze|blank).*(?:year|date)/.test(compact)) {
    return true;
  }
  return /nianfen.*(?:tiankong|wakong)|(?:tiankong|wakong).*nianfen/.test(compact);
}
