// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DeckConfigSettings } from '../proto/messages/DeckConfigMessages';
import { DECK_OPTION_GROUPS, deckOptionStepsText, percentageText } from './DeckOptionsCatalog';
import { fsrsParams } from './FsrsOptions';

export interface DeckOptionDefaultValue {
  key: string;
  value: string;
}

/** 组件仅接收默认值的文字；完整协议和不透明字节留在选项会话，避免 @Prop 深拷贝破坏类型。 */
export function deckOptionDefaultValues(config: DeckConfigSettings | null): DeckOptionDefaultValue[] {
  if (config === null) return [];
  const result: DeckOptionDefaultValue[] = [];
  for (const group of DECK_OPTION_GROUPS) {
    for (const field of group.fields) {
      if (field.kind === 'unsupported' || field.kind === 'week' || field.kind === 'script') continue;
      let value: string = '';
      if (field.kind === 'global') {
        value = field.key === 'fsrsHealthCheck' ? 'true' : 'false';
      } else if (field.kind === 'steps') {
        value = deckOptionStepsText(field.key === 'learnSteps' ? config.learnSteps : config.relearnSteps);
      } else if (field.kind === 'params') {
        value = fsrsParams(config).join(' ');
      } else {
        const source = config[field.key as keyof DeckConfigSettings];
        if (typeof source === 'number' || typeof source === 'boolean' || typeof source === 'string') {
          value = String(source);
        }
        if (field.kind === 'percentage') value = percentageText(value);
      }
      result.push({ key: field.key, value });
    }
  }
  return result;
}
