// SPDX-License-Identifier: AGPL-3.0-or-later
export type AgentPreferenceValue = boolean | number | string;

/** 只公开已经共用保存入口的设备偏好；新增项须同时接通执行器与确认预览。 */
export function agentWritablePreferenceIds(): string[] {
  return ['card_text_size', 'deck_list_narrow', 'study_haptics'];
}

/** @throws {Error} 模型只能提交白名单设置的规范值，不能选择底层存储键。 */
export function decodeWritablePreference(id: string, value: string): AgentPreferenceValue {
  if (!agentWritablePreferenceIds().includes(id)) { throw new Error('unsupported_setting_write'); }
  if (id === 'card_text_size') {
    const number: number = Number(value);
    if (!Number.isInteger(number) || number < 50 || number > 200 || `${number}` !== value) {
      throw new Error('invalid_setting_value');
    }
    return number;
  }
  if (value !== 'true' && value !== 'false') { throw new Error('invalid_setting_value'); }
  return value === 'true';
}

export interface AgentPreferenceDefinition {
  id: string;
  description: string;
  store: string;
  key: string;
  defaultValue: AgentPreferenceValue;
  allowedValues: string[];
  encoding: string;
}

/** 持久化协议白名单；模型不能选择存储名或键，也不能枚举凭证存储。 */
export function agentPreferenceDefinitions(): AgentPreferenceDefinition[] {
  return [
    { id: 'simple_mode', description: '简洁学习界面。', store: 'jidecards_settings', key: 'simple_mode', defaultValue: true, allowedValues: [], encoding: 'native' },
    { id: 'home_today_summary', description: '首页是否展示今日学习进度。', store: 'jidecards_settings', key: 'home_show_today_summary', defaultValue: true, allowedValues: [], encoding: 'native' },
    { id: 'study_haptics', description: '学习操作触觉反馈偏好，不保证设备支持振动。', store: 'jidecards_settings', key: 'studyHapticsEnabled', defaultValue: true, allowedValues: [], encoding: 'native' },
    { id: 'card_text_size', description: '卡片文字缩放百分比，50–200；模板可以有自己的字号。', store: 'jidecards_settings', key: 'cardTextSizePercent', defaultValue: 100, allowedValues: [], encoding: 'native' },
    { id: 'deck_list_narrow', description: '牌组列表是否使用紧凑宽度。', store: 'jidecards_settings', key: 'deckListNarrow', defaultValue: false, allowedValues: [], encoding: 'native' },
    { id: 'study_layout', description: '学习工具栏位置：bottom 底部，float 浮动。', store: 'jidecards_study_layout', key: 'study_layout_mode', defaultValue: 'bottom', allowedValues: ['bottom', 'float'], encoding: 'native' },
    { id: 'theme_motion', description: '主题背景动效偏好。', store: 'jidecards_redemption', key: 'motion', defaultValue: true, allowedValues: [], encoding: 'native' },
    { id: 'automatic_backups', description: '本地自动备份开关，不表示已有备份数量。', store: 'jidecards_settings', key: 'automatic_backups', defaultValue: true, allowedValues: [], encoding: 'native' },
    { id: 'auto_sync', description: '首页自动同步开关，不表示已登录或同步成功。', store: 'jidecards_sync', key: 'auto_sync_enabled_v2', defaultValue: false, allowedValues: [], encoding: 'native' },
    { id: 'sync_media', description: '是否随同步传输媒体。', store: 'jidecards_sync', key: 'sync_media_enabled', defaultValue: '1', allowedValues: ['0', '1'], encoding: 'string_boolean' },
    { id: 'media_sync_pending', description: '媒体同步是否尚未完成；不表示正在同步。', store: 'jidecards_sync', key: 'media_sync_pending', defaultValue: '0', allowedValues: ['0', '1'], encoding: 'string_boolean' },
    { id: 'stats_hours_range', description: '答题小时分布窗口：0 近1月，1 近3月，2 近1年，3 全部。', store: 'jidecards_settings', key: 'stats_hours_range', defaultValue: 2, allowedValues: ['0', '1', '2', '3'], encoding: 'native' },
    { id: 'stats_days_range', description: '统计历史窗口：365 近一年，0 全部历史。', store: 'jidecards_settings', key: 'stats_days_range', defaultValue: 365, allowedValues: ['0', '365'], encoding: 'native' }
  ];
}

/** @throws {Error} 已保存值损坏时显式失败；未保存项才使用产品默认值。 */
export function decodeAgentPreference(definition: AgentPreferenceDefinition, value: AgentPreferenceValue): AgentPreferenceValue {
  if (typeof value !== typeof definition.defaultValue ||
    (typeof value === 'number' && (!Number.isFinite(value) || !Number.isInteger(value))) ||
    (definition.allowedValues.length > 0 && !definition.allowedValues.includes(`${value}`)) ||
    (definition.id === 'card_text_size' && (Number(value) < 50 || Number(value) > 200))) {
    throw new Error('invalid_saved_setting:' + definition.id);
  }
  return definition.encoding === 'string_boolean' ? value === '1' : value;
}
