// SPDX-License-Identifier: AGPL-3.0-or-later

/** 按牌组全名查询并包含子牌组；转义引号及 Anki 通配符，别名不进入查询。 */
export function deckScopeSearch(fullName: string): string {
  let escaped: string = '';
  for (const character of fullName) {
    if (character === '\\' || character === '"' || character === '*' || character === '_') escaped += '\\';
    escaped += character;
  }
  return `deck:"${escaped}"`;
}
