// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DirectoryRow, DirectoryChoice } from '../DirectoryTree';
import { directoryChoiceRows, directorySpecial } from '../DirectoryTree';

export interface MemoryScopeChoice { value: string; scope: string; }

/** 记忆范围保留 global/deck:id 身份；全部与全局不参与牌组层级。 */
export function memoryScopeRows(choices: MemoryScopeChoice[], selected: string): DirectoryRow[] {
  return choices.filter((choice: MemoryScopeChoice): boolean => !choice.scope.startsWith('deck:'))
    .map((choice: MemoryScopeChoice): DirectoryRow => directorySpecial(choice.scope, choice.value,
      choice.scope === selected ? 1 : 0))
    .concat(directoryChoiceRows(choices.filter((choice: MemoryScopeChoice): boolean => choice.scope.startsWith('deck:'))
      .map((choice: MemoryScopeChoice): DirectoryChoice => ({ id: choice.scope, path: choice.value })), selected));
}
