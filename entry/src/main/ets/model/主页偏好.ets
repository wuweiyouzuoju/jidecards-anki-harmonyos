// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID MODEL-HOME-PREF-001
// @名称 主页偏好持久化
//
// @作用
// 主页 UI 显示项的 preferences 持久化：当前包含「是否显示今日进度卡片」开关
// （跨组件同步用 AppStorage 'homeShowTodaySummary'）。
// 用 preferences（@kit.ArkData）存储，复用 jidecards_settings store
// （与 AnkiWeb引导存储 同 store，key 前缀独立）。
//
// @输入
// 无（读取开关）；开启: boolean（保存）
//
// @输出
// 加载显示今日进度卡(): Promise<boolean>
// 保存显示今日进度卡(开启): Promise<void>
// 主页今日进度卡AppStorage键: string  // 跨组件广播键名常量
//
// @业务规则
// 「今日进度卡」默认值 true：保持新用户开箱即见体验；
// 'homeShowTodaySummary' 是 AppStorage 协议字段，保留英文，不可中文化。
//
// @副作用
// 读写 preferences 的 jidecards_settings store；
// 「今日进度卡」保存时同步写 AppStorage 触发 @StorageLink 监听方重渲染。
//
// @注意
// preferences 中的字符串键（'jidecards_settings' / 'home_show_today_summary' /
// 'abilityContext'）属持久化协议字段，保留英文，不可中文化。
// ========================================================

import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { saveLocalPreference } from '../utils/LocalPreferenceWrite';

const 存储名: string = 'jidecards_settings';
const 显示今日进度卡键: string = 'home_show_today_summary';
const 上下文键: string = 'abilityContext';

// ========================================================
// @块ID MODEL-HOME-PREF-002
// @名称 主页今日进度卡 AppStorage 键
//
// @作用
// 跨组件广播键名常量：首页 @StorageLink 监听此键，
// 设置页 布局分组 切换开关时写此键触发首页重渲染。
//
// @输入
// 无（常量定义）
//
// @输出
// string：'homeShowTodaySummary'
//
// @业务规则
// 此键名是 AppStorage 协议字段，保留英文，不可中文化。
//
// @副作用
// 无
// ========================================================
export const 主页今日进度卡AppStorage键: string = 'homeShowTodaySummary';

function 取上下文(): common.UIAbilityContext | null {
  const 上下文: common.UIAbilityContext | undefined =
    AppStorage.get<common.UIAbilityContext>(上下文键);
  return 上下文 === undefined ? null : 上下文;
}

// ========================================================
// @块ID MODEL-HOME-PREF-003
// @名称 加载显示今日进度卡
//
// @作用
// 读取「是否显示今日进度卡片」开关的持久化值。
//
// @输入
// 无
//
// @输出
// Promise<boolean>：true=显示（默认）；false=用户已关闭。
// 读取失败或未设置时返回 true（保持新用户开箱即见体验）。
//
// @副作用
// 只读 preferences，不写入。
// ========================================================
export async function 加载显示今日进度卡(): Promise<boolean> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return true;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    const 值: preferences.ValueType = await 存储.get(显示今日进度卡键, true);
    return 值 !== false;
  } catch (错误) {
    return true;
  }
}

// ========================================================
// @块ID MODEL-HOME-PREF-004
// @名称 保存显示今日进度卡
//
// @作用
// 持久化「是否显示今日进度卡片」开关，并同步写 AppStorage 触发 @StorageLink 监听方重渲染。
//
// @输入
// 开启: boolean - true=显示今日进度卡；false=隐藏
//
// @输出
// Promise<void>。持久化失败仅丢失下次启动后的值，不回滚 UI（与 学习布局存储 同款）。
//
// @副作用
// 写入 preferences 的 home_show_today_summary 并 flush 落盘；
// 同步写 AppStorage 的 'homeShowTodaySummary' 键触发首页 @StorageLink 重渲染。
// ========================================================
/** @throws {Error} 保存失败不广播已应用状态。 */
export async function 保存显示今日进度卡(开启: boolean, expected: boolean | null = null): Promise<void> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) throw new Error('home_summary_storage_unavailable');
  const 存储 = await preferences.getPreferences(上下文,存储名);
  await saveLocalPreference(存储,显示今日进度卡键,开启,true,expected,
    (): void => { AppStorage.setOrCreate<boolean>(主页今日进度卡AppStorage键,开启); });
}
