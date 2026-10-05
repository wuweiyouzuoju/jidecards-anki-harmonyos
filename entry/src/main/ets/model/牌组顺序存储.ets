// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID MODEL-DECK-ORDER-001
// @名称 同级子牌组顺序持久化
//
// @作用
// 前端独立方案持久化同级子牌组的展示顺序（Anki 后端不支持 deck 排序）。
// 用 preferences（@kit.ArkData）存储，key 形如 deck_order_<parentId>，
// value 是 JSON 字符串 ["id1","id2",...]，表示该 parent 下子牌组的前端展示顺序。
// 顶层（parentId=''）的 key 用 deck_order_root。
// 未持久化的 parent 仍按 Anki 返回的默认顺序
// （即 DeckTreeNode.children 原序，通常按 name 字典序）。
//
// @输入
// 无（读取）；parentId: string / parentIds: string[] / childIds: string[]
//
// @输出
// 加载牌组顺序(parentId): Promise<string[] | null>
// 加载全部牌组顺序(parentIds): Promise<Map<string, string[]>>
// 保存牌组顺序(parentId, childIds): Promise<void>
// 清除牌组顺序(parentId): Promise<void>
//
// @业务规则
// 同步语义：Anki Desktop / 其他设备看到的仍是后端默认顺序，本机自定义顺序不同步。
// jidecards 是 offline-first 单机应用，此限制可接受。
//
// @副作用
// 读写 preferences 的 jidecards_deck_meta store。
//
// @注意
// preferences 中的字符串键（'jidecards_deck_meta' / 'deck_order_' 前缀 /
// 'root' 后缀 / 'abilityContext'）属持久化协议字段，保留英文，不可中文化。
// ========================================================

import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';

const 存储名: string = 'jidecards_deck_meta';
const 顺序键前缀: string = 'deck_order_';
const 根键后缀: string = 'root';
const 上下文键: string = 'abilityContext';

function 取上下文(): common.UIAbilityContext | null {
  const 上下文: common.UIAbilityContext | undefined =
    AppStorage.get<common.UIAbilityContext>(上下文键);
  return 上下文 === undefined ? null : 上下文;
}

/** parentId=''（顶层）映射到 deck_order_root；其余映射到 deck_order_<parentId>。 */
function 顺序键(父ID: string): string {
  return 父ID === '' ? `${顺序键前缀}${根键后缀}` : `${顺序键前缀}${父ID}`;
}

// ========================================================
// @块ID MODEL-DECK-ORDER-002
// @名称 加载牌组顺序
//
// @作用
// 读取某 parent 下用户自定义的子牌组顺序。
//
// @输入
// parentId: string - 父牌组 ID（空串表示顶层）
//
// @输出
// Promise<string[] | null>：子牌组 ID 列表；null 表示未持久化，
// 调用方应回退到后端默认顺序。解析失败或 JSON 非数组时也返回 null，不抛异常。
//
// @副作用
// 只读 preferences，不写入。
// ========================================================
export async function 加载牌组顺序(父ID: string, strict: boolean = false): Promise<string[] | null> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    if (strict) throw new Error('deck_reorder_storage_unavailable');
    return null;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    const 存在: boolean = await 存储.has(顺序键(父ID));
    if (!存在) {
      return null;
    }
    const 值: preferences.ValueType = await 存储.get(顺序键(父ID), '');
    if (typeof 值 !== 'string' || 值 === '') {
      if (strict) throw new Error('deck_reorder_storage_unavailable');
      return null;
    }
    const 解析结果: object = JSON.parse(值);
    if (!Array.isArray(解析结果)) {
      if (strict) throw new Error('deck_reorder_storage_unavailable');
      return null;
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
    if (strict) throw new Error('deck_reorder_storage_unavailable');
    return null;
  }
}

// ========================================================
// @块ID MODEL-DECK-ORDER-003
// @名称 加载全部牌组顺序
//
// @作用
// 批量加载多个 parent 的子牌组顺序。
//
// @输入
// parentIds: string[] - 父牌组 ID 列表
//
// @输出
// Promise<Map<string, string[]>>：parentId → string[] 的 Map。
// 未持久化的 parent 不出现在 Map 中，调用方回退到后端默认顺序。
//
// @业务规则
// 去重，避免重复 IO。
//
// @副作用
// 只读 preferences，不写入。
// ========================================================
export async function 加载全部牌组顺序(父ID列表: string[]): Promise<Map<string, string[]>> {
  const 结果: Map<string, string[]> = new Map<string, string[]>();
  if (父ID列表.length === 0) {
    return 结果;
  }
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return 结果;
  }
  // 去重，避免重复 IO
  const 已处理: Set<string> = new Set<string>();
  for (let i: number = 0; i < 父ID列表.length; i++) {
    const 父ID: string = 父ID列表[i];
    if (已处理.has(父ID)) {
      continue;
    }
    已处理.add(父ID);
    const 顺序: string[] | null = await 加载牌组顺序(父ID);
    if (顺序 !== null) {
      结果.set(父ID, 顺序);
    }
  }
  return 结果;
}

// ========================================================
// @块ID MODEL-DECK-ORDER-004
// @名称 保存牌组顺序
//
// @作用
// 持久化某 parent 下子牌组的顺序。
//
// @输入
// parentId: string - 父牌组 ID（空串表示顶层）
// childIds: string[] - 子牌组 ID 列表（空数组也写入，表示用户主动清空排序）
//
// @输出
// Promise<void>
//
// @业务规则
// 调用方在原 onMove 松手回调中调用；共同命令串行写入，冻结输入后 await 落盘。
// 保存失败抛出，不能向主页或 JIDE 报告未落盘的成功。
//
// @副作用
// 写入 preferences 的 deck_order_<parentId> 并 flush 落盘。
// ========================================================
export async function 保存牌组顺序(父ID: string, 子ID列表: string[]): Promise<void> {
  const accepted: string = JSON.stringify(子ID列表);
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    throw new Error('deck_reorder_storage_unavailable');
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    await 存储.put(顺序键(父ID), accepted);
    await 存储.flush();
  } catch (错误) {
    throw new Error('deck_reorder_storage_unavailable');
  }
}

// ========================================================
// @块ID MODEL-DECK-ORDER-005
// @名称 清除牌组顺序
//
// @作用
// 删除某 parent 的顺序覆盖，恢复后端默认顺序。
//
// @输入
// parentId: string - 父牌组 ID
//
// @输出
// Promise<void>
//
// @业务规则
// 用户在「完成排序」模式下点击「恢复默认」时调用。
//
// @副作用
// 删除 preferences 中的 deck_order_<parentId> 键并 flush 落盘。
// ========================================================
export async function 清除牌组顺序(父ID: string): Promise<void> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    const 存在: boolean = await 存储.has(顺序键(父ID));
    if (存在) {
      await 存储.delete(顺序键(父ID));
      await 存储.flush();
    }
  } catch (错误) {
    // 偏好不可用时仅丢失持久化，不阻塞 UI。
  }
}
