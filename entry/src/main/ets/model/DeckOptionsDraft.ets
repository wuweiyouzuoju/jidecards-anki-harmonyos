// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DeckConfig } from '../proto/messages/DeckConfigMessages';
import { copyDeckConfig } from './DeckConfigSave';
import type { DeckConfigRequestOptions } from './DeckConfigSave';
import { 牌组配置表单 } from './牌组配置表单';
import { 牌组选项编辑 } from './牌组选项编辑';

export interface DeckOptionsDraft {
  config: DeckConfig | null;
  options: DeckConfigRequestOptions | null;
  shared: boolean;
  errorKey: string;
}

/** 先完整校验，再复制配置；失败不会污染预设或部分提交。 */
export function prepareDeckOptionsDraft(original: DeckConfig, form: 牌组配置表单,
  options: 牌组选项编辑): DeckOptionsDraft {
  const issues = form.校验().concat(options.校验());
  const draft: DeckConfig = copyDeckConfig(original);
  if (issues.length > 0 || draft.config === null || !form.应用到配置(draft.config) || !options.应用()) {
    return { config: null, options: null, shared: false,
      errorKey: issues.length > 0 ? issues[0].消息键 : 'deck_learn_steps_validation_error' };
  }
  return { config: draft, options: options.转换为请求字段(), shared: options.applyToSharedDecks, errorKey: '' };
}
