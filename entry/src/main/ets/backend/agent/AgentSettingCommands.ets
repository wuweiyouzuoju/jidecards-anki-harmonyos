// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { readAgentPreference } from './AgentPreferenceReader';
import { decodeWritablePreference } from '../../model/agent/AgentPreferenceSettings';
import { 当前语言模式, 设置语言模式 } from '../../model/语言存储';
import type { 语言模式 } from '../../model/语言存储';
import { readSavedStudyQuickAnswerMode, saveStudyQuickAnswerMode } from '../../model/实验性功能存储';
import { 保存简洁模式 } from '../../model/简洁模式存储';
import { 保存显示今日进度卡 } from '../../model/主页偏好';
import { 保存学习布局模式 } from '../../model/学习布局存储';
import type { 学习布局模式 } from '../../model/学习布局存储';
import { 保存小时分布窗口, 保存统计天数 } from '../../model/桌面卡片数据存储';
import { saveAutoSyncEnabled, saveMediaSyncEnabled } from '../../model/同步凭证存储';
import { saveAutomaticBackup } from '../LocalBackups';
import { saveThemeMotion } from '../../utils/RedemptionStore';
import { saveCardTextSize } from '../../utils/CardTextSizeStore';
import { saveDeckListStyle } from '../../utils/DeckListAppearanceStore';
import { saveMotionStyle } from '../../utils/MotionStyleStore';
import { saveStudyHaptics } from '../../utils/StudyHaptics';
import { 统计服务 } from '../统计服务';
import type { WritableGraphPreferences } from '../GraphPreferencesCommands';
import { graphPreferencesSnapshot, saveGraphPreferences } from '../GraphPreferencesCommands';

/** @throws {Error} 读取失败必须拒绝准备或执行提案。 */
export async function readAgentSettingValue(id: string): Promise<string> {
  if (id === 'language') return 当前语言模式();
  if (id === 'study_quick_answer') return String(await readSavedStudyQuickAnswerMode());
  if (id === 'graph_preferences') return graphPreferencesSnapshot(await new 统计服务().获取图表偏好());
  return String((await readAgentPreference(id)).value);
}
let tail: Promise<void> = Promise.resolve();
/** 所有已接通偏好通过原领域保存入口提交；不会暴露底层键。 */
/** @throws {Error} 过期、保存或应用失败由确认执行器区分处理。 */
export function saveAgentSettingValue(id: string, after: string, before: string): Promise<void> {
  decodeWritablePreference(id,after);
  const result = tail.then(async (): Promise<void> => {
    if (await readAgentSettingValue(id) !== before) throw new Error('setting_changed_since_proposal');
    switch (id) {
      case 'card_text_size': await saveCardTextSize(Number(after),Number(before)); break;
      case 'deck_list_style': await saveDeckListStyle(after,before); break;
      case 'motion_style': await saveMotionStyle(after,before); break;
      case 'study_haptics': await saveStudyHaptics(after === 'true',before === 'true'); break;
      case 'simple_mode': await 保存简洁模式(after === 'true',before === 'true'); break;
      case 'home_today_summary': await 保存显示今日进度卡(after === 'true',before === 'true'); break;
      case 'study_layout': await 保存学习布局模式(after as 学习布局模式,before); break;
      case 'theme_motion': await saveThemeMotion(after === 'true'); break;
      case 'automatic_backups': {
        const context = AppStorage.get<common.UIAbilityContext>('abilityContext'); if (context === undefined) throw new Error('ability_context_unavailable');
        await saveAutomaticBackup(context,after === 'true',before === 'true'); break;
      }
      case 'auto_sync': await saveAutoSyncEnabled(after === 'true'); break;
      case 'sync_media': await saveMediaSyncEnabled(after === 'true'); break;
      case 'stats_hours_range': await 保存小时分布窗口(Number(after)); break;
      case 'stats_days_range': await 保存统计天数(Number(after)); break;
      case 'language': 设置语言模式(after as 语言模式); break;
      case 'study_quick_answer': await saveStudyQuickAnswerMode(Number(after)); break;
      case 'graph_preferences': await saveGraphPreferences(JSON.parse(after) as WritableGraphPreferences,before); break;
      default: throw new Error('unsupported_setting_write');
    }
    const expectedAfter = id === 'graph_preferences' ? graphPreferencesSnapshot(JSON.parse(after) as WritableGraphPreferences) : after;
    if (id !== 'language' && await readAgentSettingValue(id) !== expectedAfter) throw new Error('setting_save_unverified');
    AppStorage.setOrCreate<number>('需要刷新主页',Date.now());
  });
  tail = result.then((): void => {}, (): void => {}); return result;
}
