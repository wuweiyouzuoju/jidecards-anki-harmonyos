// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @名称 欢迎弹窗「版本更新时弹一次」持久化
//
// @作用
// 版本更新时展示欢迎弹窗（介绍此次更新改动 / 获取牌组 / 作者的话），
// 用 preferences 持久化「已展示版本号」，版本号变化时重新展示。
// 复用 AnkiWeb引导存储 的「只弹一次」模式，扩展为版本号对比。
//
// @输入
// 无（内部从 AppStorage 取 abilityContext）
//
// @输出
// 是否已展示欢迎弹窗(): Promise<boolean>
// 标记已展示欢迎弹窗(): Promise<void>
//
// @业务规则
// STORE_NAME 同为 jidecards_settings，KEY 为 welcome_shown（存版本号字符串，如 '1.0.2'）。
// 版本号变化时重新展示；失败静默降级，不阻断首页加载；最坏情况下下次启动可能再弹一次。
//
// @副作用
// 读写 preferences（@kit.ArkData）的 jidecards_settings store。
//
// @注意
// preferences 中的字符串键（'jidecards_settings' / 'welcome_shown' /
// 'abilityContext'）属持久化协议字段，保留英文，不可中文化。
// ========================================================

import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';

const 存储名: string = 'jidecards_settings';
const 欢迎已展示键: string = 'welcome_shown';
const 上下文键: string = 'abilityContext';
// 当前应用版本号：与 AppScope/app.json5 保持一致。
const 当前版本: string = '2.3.6';
// 静默版本：这些版本不弹欢迎弹窗（无更新日志内容的过渡版本，用户决策 2026-08-24）。
// 直接视为已展示且不写 preferences——下个非静默版本对比旧存储值仍会正常弹。
// 2.3.6 的更新内容由官方公告承载，避免同一次启动连续展示两份更新说明。
const 静默版本: string = '2.3.6';

function 取上下文(): common.UIAbilityContext | null {
  const 上下文: common.UIAbilityContext | undefined =
    AppStorage.get<common.UIAbilityContext>(上下文键);
  return 上下文 === undefined ? null : 上下文;
}

export async function 是否已展示欢迎弹窗(): Promise<boolean> {
  // 静默版本：任何情况下都不弹欢迎弹窗（新装用户也不弹）。
  // 不写 preferences，保证下个非静默版本仍按旧存储值对比正常触发。
  if (当前版本 === 静默版本) {
    return true;
  }
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return false;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    const 值: preferences.ValueType = await 存储.get(欢迎已展示键, '');
    // 新安装（值为空）或老用户升级（值是旧版本号）→ 未展示，需弹窗
    if (值 !== 当前版本) {
      return false;
    }
    return true;
  } catch (错误) {
    return false;
  }
}

// ========================================================
// @名称 标记已展示欢迎弹窗
//
// @作用
// 将当前版本号写入 preferences，保证欢迎弹窗「每版本只弹一次」。
//
// @副作用
// 写 preferences（@kit.ArkData）的 jidecards_settings store。
// ========================================================
export async function 标记已展示欢迎弹窗(): Promise<void> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    await 存储.put(欢迎已展示键, 当前版本);
    await 存储.flush();
  } catch (错误) {
    // 偏好不可用时不阻断；下次启动可能再次尝试展示。
  }
}
