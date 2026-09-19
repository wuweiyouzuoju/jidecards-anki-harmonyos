// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID MODEL-LAST-DECK-001
// @名称 上次选中牌组持久化
//
// @作用
// 前端记忆用户上次选中的牌组 ID，重启后恢复选中状态。
// 用 preferences（@kit.ArkData）存储，store 为 jidecards_deck_meta
// （与 HiddenDeckStore 等共用），key 为 last_selected_deck，
// value 是 deck id 字符串。
//
// @输入
// 无（读取）；deckId: string（保存/清空）
//
// @输出
// 加载上次牌组ID(): Promise<string>
// 保存上次牌组ID(deckId): Promise<void>
// 清除上次牌组ID(): Promise<void>
//
// @业务规则
// - 用户点击牌组或新建牌组选中时写入 lastDeckId
// - 进入应用 loadHomeData 完成后读取，恢复 selectedDeckId
//   （平板宽屏直接显示详情，手机窄屏仅高亮列表项不推栈）
// - 删除/隐藏牌组时若命中 lastDeckId 则清空，避免悬空
// - 同步语义：本机记忆状态不同步 AnkiWeb，单机偏好可接受
//
// @副作用
// 读写 preferences 的 jidecards_deck_meta store。
//
// @注意
// preferences 中的字符串键（'jidecards_deck_meta' / 'last_selected_deck' /
// 'abilityContext'）属持久化协议字段，保留英文，不可中文化。
// ========================================================

import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';

const 存储名: string = 'jidecards_deck_meta';
const 上次牌组键: string = 'last_selected_deck';
const 上下文键: string = 'abilityContext';

function 取上下文(): common.UIAbilityContext | null {
  const 上下文: common.UIAbilityContext | undefined =
    AppStorage.get<common.UIAbilityContext>(上下文键);
  return 上下文 === undefined ? null : 上下文;
}

// ========================================================
// @块ID MODEL-LAST-DECK-002
// @名称 加载上次牌组ID
//
// @作用
// 读取本地持久化的上次选中牌组 ID。
//
// @输入
// 无
//
// @输出
// Promise<string>：deck id；空串表示无记忆（未持久化或读取失败均降级为空）。
//
// @副作用
// 只读 preferences，不写入。
// ========================================================
export async function 加载上次牌组ID(): Promise<string> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return '';
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    const 存在: boolean = await 存储.has(上次牌组键);
    if (!存在) {
      return '';
    }
    const 值: preferences.ValueType = await 存储.get(上次牌组键, '');
    if (typeof 值 !== 'string') {
      return '';
    }
    return 值;
  } catch (错误) {
    return '';
  }
}

// ========================================================
// @块ID MODEL-LAST-DECK-003
// @名称 保存上次牌组ID
//
// @作用
// 记忆上次选中的 deck id。空串无副作用。
//
// @输入
// deckId: string - 牌组 ID（空串则直接返回不写入）
//
// @输出
// Promise<void>
//
// @副作用
// 写入 preferences 的 last_selected_deck 并 flush 落盘。
// ========================================================
export async function 保存上次牌组ID(牌组ID: string): Promise<void> {
  if (牌组ID === '') {
    return;
  }
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    await 存储.put(上次牌组键, 牌组ID);
    await 存储.flush();
  } catch (错误) {
    // 偏好不可用时仅丢失持久化，不阻塞 UI。
  }
}

// ========================================================
// @块ID MODEL-LAST-DECK-004
// @名称 清除上次牌组ID
//
// @作用
// 清空记忆的 deck id（删除/隐藏命中时调用）。
//
// @输入
// 无
//
// @输出
// Promise<boolean>：是否成功清除并落盘。
//
// @副作用
// 删除 preferences 中的 last_selected_deck 键并 flush 落盘。
// ========================================================
export async function 清除上次牌组ID(): Promise<boolean> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return false;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    await 存储.delete(上次牌组键);
    await 存储.flush();
    return true;
  } catch (错误) {
    return false;
  }
}
