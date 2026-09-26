// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID MODEL-SIMPLE-MODE-001
// @名称 简洁模式持久化
//
// @作用
// 「简洁版/实验版模式」开关的 preferences 持久化 + AppStorage 跨组件广播。
// 简洁版默认开启：隐藏设置页调度分组、数据管理只留导出导入+媒体管理、
// 长按牌组不显示自定义学习、新建菜单不显示创建筛选牌组、牌组选项不显示高级设置。
// 实验版（false）：在简洁版基础上额外显示高级功能与实验性功能。
//
// @输入
// 无（读取）；开启: boolean（保存）
//
// @输出
// 加载简洁模式(): Promise<boolean>
// 保存简洁模式(开启: Promise<void>
// 简洁模式AppStorage键: string  // 跨组件广播键名常量
//
// @业务规则
// 默认值 true（简洁版）：新用户开箱即用简洁界面，减少认知负担。
// 'simpleMode' 是 AppStorage 协议字段，保留英文，不可中文化。
//
// @副作用
// 读写 preferences 的 jidecards_settings store；
// 保存时同步写 AppStorage 触发 @StorageLink 监听方重渲染。
// ========================================================

import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';

const 存储名: string = 'jidecards_settings';
const 简洁模式键: string = 'simple_mode';
const 上下文键: string = 'abilityContext';

export const 简洁模式AppStorage键: string = 'simpleMode';

function 取上下文(): common.UIAbilityContext | null {
  const 上下文: common.UIAbilityContext | undefined =
    AppStorage.get<common.UIAbilityContext>(上下文键);
  return 上下文 === undefined ? null : 上下文;
}

export async function 加载简洁模式(): Promise<boolean> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return true;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    const 值: preferences.ValueType = await 存储.get(简洁模式键, true);
    return 值 !== false;
  } catch (错误) {
    return true;
  }
}

export async function 保存简洁模式(开启: boolean): Promise<void> {
  AppStorage.setOrCreate<boolean>(简洁模式AppStorage键, 开启);
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    await 存储.put(简洁模式键, 开启);
    await 存储.flush();
  } catch (错误) {
    // 持久化失败可接受：UI 已切换，下次启动会回退到上次保存的值。
  }
}
