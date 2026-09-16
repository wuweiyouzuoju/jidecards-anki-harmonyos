// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID MODEL-COLOR-THEME-STORE-001
// @名称 颜色主题存储
//
// @作用
// 通过 HarmonyOS preferences 持久化用户选择的颜色主题，
// 提供加载与保存两个异步入口。加载失败时回退到默认主题，保证学习入口不中断。
//
// @输入
// （加载）无参数，从 preferences 读取
// （保存）颜色主题 枚举值
//
// @输出
// 加载颜色主题：Promise<颜色主题>
// 保存颜色主题：Promise<void>
//
// @业务规则
// preferences store 名 'jidecards_settings'、键名 'color_theme' 是持久化协议字段，禁止修改。
// AppStorage 键名 'abilityContext' 是与 Ability 启动代码约定的协议字段，禁止修改。
// 加载时调用 规范化颜色主题 把任意字符串安全转为 颜色主题 枚举，非法值回退默认。
//
// @副作用
// 读取/写入 HarmonyOS preferences（异步 IO）。
// 偏好不可用时保留当前内存状态，不中断学习入口（catch 静默）。
// ========================================================

import { UNLOCKED_CONTENTS_KEY, isThemeAvailable } from './ThemeCatalog';
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { 默认颜色主题, 规范化颜色主题, 颜色主题 } from './颜色主题';

const 存储名: string = 'jidecards_settings';
const 颜色主题键: string = 'color_theme';
const 上下文键: string = 'abilityContext';

function 取能力上下文(): common.UIAbilityContext | null {
  const 上下文: common.UIAbilityContext | undefined =
    AppStorage.get<common.UIAbilityContext>(上下文键);
  return 上下文 === undefined ? null : 上下文;
}

/** 从 preferences 加载颜色主题；上下文缺失或读取失败时回退到 默认颜色主题。 */
export async function 加载颜色主题(): Promise<颜色主题> {
  const 上下文: common.UIAbilityContext | null = 取能力上下文();
  if (上下文 === null) {
    return 默认颜色主题;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    const 值: preferences.ValueType = await 存储.get(颜色主题键, 默认颜色主题);
    const theme: 颜色主题 = typeof 值 === 'string' ? 规范化颜色主题(值) : 默认颜色主题;
    return !isThemeAvailable(theme, AppStorage.get<string[]>(UNLOCKED_CONTENTS_KEY) ?? []) ? 默认颜色主题 : theme;
  } catch (错误) {
    return 默认颜色主题;
  }
}

/** 把颜色主题写入 preferences 并 flush；上下文缺失或写入失败时静默跳过。 */
export async function 保存颜色主题(主题: 颜色主题): Promise<void> {
  if (!isThemeAvailable(主题, AppStorage.get<string[]>(UNLOCKED_CONTENTS_KEY) ?? [])) return;
  const 上下文: common.UIAbilityContext | null = 取能力上下文();
  if (上下文 === null) {
    return;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    await 存储.put(颜色主题键, 主题);
    await 存储.flush();
  } catch (错误) {
    // 偏好不可用时保留当前内存状态，不中断学习入口。
  }
}
