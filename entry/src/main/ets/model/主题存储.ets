// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID MODEL-THEME-STORE-001
// @名称 主题存储
//
// @作用
// 通过 HarmonyOS preferences 持久化用户选择的主题模式（system/light/dark），
// 提供加载与保存两个异步入口。加载失败时回退到默认主题模式，保证学习入口不中断。
//
// @输入
// （加载）无参数，从 preferences 读取
// （保存）主题模式 枚举值
//
// @输出
// 加载主题模式：Promise<主题模式>
// 保存主题模式：Promise<void>
//
// @业务规则
// preferences store 名 'jidecards_settings'、键名 'theme_mode' 是持久化协议字段，禁止修改。
// AppStorage 键名 'abilityContext' 是与 Ability 启动代码约定的协议字段，禁止修改。
// 加载时调用 规范化主题模式 把任意字符串安全转为 主题模式 枚举，非法值回退默认。
//
// @副作用
// 读取/写入 HarmonyOS preferences（异步 IO）。
// 启动读取不可用时回退默认值；公共设置入口使用严格读取和可观察写入结果。
// ========================================================

import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { 默认主题模式, 规范化主题模式, 主题模式 } from './主题设置';

const 存储名: string = 'jidecards_settings';
const 主题模式键: string = 'theme_mode';
const 上下文键: string = 'abilityContext';

function 取能力上下文(): common.UIAbilityContext | null {
  const 上下文: common.UIAbilityContext | undefined =
    AppStorage.get<common.UIAbilityContext>(上下文键);
  return 上下文 === undefined ? null : 上下文;
}

/** 从 preferences 加载主题模式；上下文缺失或读取失败时回退到 默认主题模式。 */
export async function 加载主题模式(): Promise<主题模式> {
  const 上下文: common.UIAbilityContext | null = 取能力上下文();
  if (上下文 === null) {
    return 默认主题模式;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    const 值: preferences.ValueType = await 存储.get(主题模式键, 默认主题模式);
    return typeof 值 === 'string' ? 规范化主题模式(值) : 默认主题模式;
  } catch (错误) {
    return 默认主题模式;
  }
}

/** @throws {Error} 读取失败与默认值不同；助手及公共写入入口必须保留失败。 */
export async function readSavedThemeMode(): Promise<主题模式> {
  const context: common.UIAbilityContext | null = 取能力上下文();
  if (context === null) { throw new Error('ability_context_unavailable'); }
  const store: preferences.Preferences = await preferences.getPreferences(context, 存储名);
  const value: preferences.ValueType = await store.get(主题模式键, 默认主题模式);
  if (value !== 'system' && value !== 'light' && value !== 'dark') { throw new Error('invalid_saved_theme_mode'); }
  return value;
}

/** @throws {Error} 写入或 flush 失败必须由调用方展示，不得声称已保存。 */
export async function 保存主题模式(模式: 主题模式): Promise<void> {
  const 上下文: common.UIAbilityContext | null = 取能力上下文();
  if (上下文 === null) {
    throw new Error('ability_context_unavailable');
  }
  const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
  await 存储.put(主题模式键, 模式);
  await 存储.flush();
}
