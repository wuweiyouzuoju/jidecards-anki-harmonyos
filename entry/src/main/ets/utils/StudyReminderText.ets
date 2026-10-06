// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';

/** 发布与预览共用资源和替换规则；用户存储的文案不随语言切换改写。 */
export function reminderText(key: string, ...args: Array<string | number>): string {
  try {
    const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
    if (context === undefined) throw new Error('reminder_context_unavailable');
    return context.resourceManager.getStringByNameSync(key, ...args);
  } catch (error) {
    console.error('[reminder] Resource unavailable: ' + key);
    return '[' + key + ']';
  }
}
export function reminderTitle(title: string): string {
  return title.length > 0 ? title : reminderText('reminder_edit_title_placeholder');
}
export function reminderContent(content: string, learning: string, review: string): string {
  const template: string = content.length > 0 ? content : reminderText('reminder_edit_content_placeholder');
  return template.replace(/{{待学}}|{{new}}/g, learning).replace(/{{待复习}}|{{review}}/g, review);
}
