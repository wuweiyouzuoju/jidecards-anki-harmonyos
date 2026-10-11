// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID MODEL-HIDDEN-DECK-001
// @名称 已隐藏牌组持久化
//
// @作用
// 前端独立方案持久化用户主动隐藏的牌组 ID 列表（Anki 后端不支持 deck 隐藏）。
// 用 preferences（@kit.ArkData）存储，store 为 jidecards_deck_meta
// （与 LastDeckStore 等共用），key 为 hidden_decks，
// value 是 JSON 字符串 ["id1","id2",...]。
//
// @输入
// 无（读取）；deckId: string（隐藏/取消隐藏）
//
// @输出
// 加载已隐藏牌组ID列表(): Promise<string[]>
// 隐藏牌组(deckId): Promise<void>
// 取消隐藏牌组(deckId): Promise<void>
// 取消隐藏全部牌组(): Promise<void>
//
// @业务规则
// 隐藏语义：
// - 仅隐藏当前 deck id（子牌组不联动隐藏，但父 deck 隐藏后子 deck 本来就看不见）
// - 隐藏后主页 visibleDeckRows 过滤掉这些 id
// - 恢复入口在设置页「已隐藏牌组」，用户可随时取消隐藏
//
// 同步语义：Anki Desktop / 其他设备看到的仍是所有 deck，本机隐藏状态不同步。
// jidecards 是 offline-first 单机应用，此限制可接受。
//
// @副作用
// 读写 preferences 的 jidecards_deck_meta store。
//
// @注意
// preferences 中的字符串键（'jidecards_deck_meta' / 'hidden_decks' /
// 'abilityContext'）属持久化协议字段，保留英文，不可中文化。
// ========================================================

import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { readLocalPreference, saveLocalPreference } from '../utils/LocalPreferenceWrite';

const 存储名: string = 'jidecards_deck_meta';
const 已隐藏牌组键: string = 'hidden_decks';
const 上下文键: string = 'abilityContext';

function 取上下文(): common.UIAbilityContext | null {
  const 上下文: common.UIAbilityContext | undefined =
    AppStorage.get<common.UIAbilityContext>(上下文键);
  return 上下文 === undefined ? null : 上下文;
}

// ========================================================
// @块ID MODEL-HIDDEN-DECK-002
// @名称 加载已隐藏牌组ID列表
//
// @作用
// 读取本地持久化的已隐藏 deck id 列表。
//
// @输入
// 无
//
// @输出
// Promise<string[]>：deck id 数组；空数组表示无隐藏
// （未持久化或解析失败均降级为空）。
//
// @副作用
// 只读 preferences，不写入。
// ========================================================
export async function 加载已隐藏牌组ID列表(): Promise<string[]> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return [];
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    const 存在: boolean = await 存储.has(已隐藏牌组键);
    if (!存在) {
      return [];
    }
    const 值: preferences.ValueType = await 存储.get(已隐藏牌组键, '');
    if (typeof 值 !== 'string' || 值 === '') {
      return [];
    }
    const 解析结果: object = JSON.parse(值);
    if (!Array.isArray(解析结果)) {
      return [];
    }
    const 结果: string[] = [];
    for (let i: number = 0; i < 解析结果.length; i++) {
      const 项: string = 解析结果[i] as string;
      if (typeof 项 === 'string' && 项 !== '') {
        结果.push(项);
      }
    }
    return 结果;
  } catch (错误) {
    return [];
  }
}

/** @throws {Error} 写入与 JIDE 快照使用严格读取；损坏值不允许覆盖。 */
export async function readHiddenDeckIds(): Promise<string[]> {
  const context = 取上下文(); if (context === null) throw new Error('hidden_decks_unavailable');
  const store = await preferences.getPreferences(context, 存储名);
  const raw = await readLocalPreference(store, 已隐藏牌组键, '[]');
  if (typeof raw !== 'string') throw new Error('invalid_hidden_decks');
  const ids: string[] = JSON.parse(raw) as string[];
  if (!Array.isArray(ids) || ids.some((id): boolean => typeof id !== 'string' || !/^[1-9][0-9]*$/.test(id))) throw new Error('invalid_hidden_decks');
  return ids;
}

// ========================================================
// @块ID MODEL-HIDDEN-DECK-003
// @名称 隐藏牌组
//
// @作用
// 将一个 deck 加入隐藏列表。已在列表内则幂等无副作用。
//
// @输入
// deckId: string - 牌组 ID（空串则直接返回不写入）
//
// @输出
// Promise<void>
//
// @副作用
// 重写 preferences 的 hidden_decks 键并 flush 落盘。
// ========================================================
/** @throws {Error} 严格读写失败由调用方报告。 */
export async function 隐藏牌组(牌组ID: string, expected: string | null = null): Promise<void> {
  if (牌组ID === '') {
    return;
  }
  await changeHiddenDecks((ids: string[]): string[] => ids.includes(牌组ID) ? ids : ids.concat([牌组ID]),expected);
}

// ========================================================
// @块ID MODEL-HIDDEN-DECK-004
// @名称 取消隐藏牌组
//
// @作用
// 从隐藏列表移除一个 deck。不在列表内则幂等无副作用。
//
// @输入
// deckId: string - 牌组 ID
//
// @输出
// Promise<void>
//
// @副作用
// 重写 preferences 的 hidden_decks 键并 flush 落盘。
// ========================================================
/** @throws {Error} 严格读写失败由调用方报告。 */
export async function 取消隐藏牌组(牌组ID: string, expected: string | null = null): Promise<void> {
  await changeHiddenDecks((ids: string[]): string[] => ids.filter((id: string): boolean => id !== 牌组ID),expected);
}

// ========================================================
// @块ID MODEL-HIDDEN-DECK-005
// @名称 取消隐藏全部牌组
//
// @作用
// 批量取消隐藏，清空整个隐藏列表。
//
// @输入
// 无
//
// @输出
// Promise<void>
//
// @副作用
// 重写 preferences 的 hidden_decks 键为空数组并 flush 落盘。
// ========================================================
/** @throws {Error} 严格读写失败由调用方报告。 */
export async function 取消隐藏全部牌组(): Promise<void> {
  await changeHiddenDecks((_ids: string[]): string[] => []);
}

let hiddenSaving: Promise<void> = Promise.resolve();
/** @throws {Error} 手动与 JIDE 读改写串行，旧列表不能覆盖并发保存。 */
function changeHiddenDecks(change: (ids: string[]) => string[], expected: string | null = null): Promise<void> {
  const work = hiddenSaving.then(async (): Promise<void> => {
    const before = await readHiddenDeckIds();
    if (expected !== null && JSON.stringify(before) !== expected) throw new Error('setting_changed_since_proposal');
    const after = change(before.slice());
    if (JSON.stringify(before) !== JSON.stringify(after)) await 写入已隐藏牌组列表(after,JSON.stringify(before));
  });
  hiddenSaving = work.catch((): void => {}); return work;
}

/** @throws {Error} 保存失败不广播已应用状态。 */
async function 写入已隐藏牌组列表(牌组ID列表: string[], expected: string): Promise<void> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) throw new Error('hidden_decks_unavailable');
  const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
  await saveLocalPreference(存储, 已隐藏牌组键, JSON.stringify(牌组ID列表), '[]', expected);
}
