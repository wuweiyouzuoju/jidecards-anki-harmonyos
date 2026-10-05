// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID MODEL-DECK-HIERARCHY-001
// @名称 牌组层级
//
// @作用
// 处理牌组路径与树形结构的工具函数：
// - 规范化牌组路径（中英文分隔符统一为 Anki 的 :: 形式）
// - 组合父路径与叶节点为完整牌组路径
// - 把后端 DeckTreeNode 平铺为前序行（保留聚合计数、应用色调/别名/顺序/背景图覆盖）
// - 按展开集合与隐藏集合过滤可见行
//
// @输入
// 原始路径字符串 / 父路径与叶节点 / DeckTreeNode 根节点 / 各种覆盖 Map / 展开与隐藏集合
//
// @输出
// 规范化路径字符串 / 牌组汇总数组（平铺后的前序行）
//
// @业务规则
// 路径分隔符统一为 Anki 的 `::`，支持中文 `：` 与单 `:` 自动修正。
// 平铺时 fallback 色调用 deckId 稳定 hash（与位置无关），保证拖动排序后色条不变。
// 兄弟节点重排时按用户持久化顺序，未出现的新增牌组追加到末尾。
// toneOverrides / displayNameOverrides / orderOverrides / backgroundImageOverrides
// 均为前端展示层覆盖，不影响后端 DeckTreeNode.children 顺序与字段。
//
// @副作用
// 无。所有函数均为纯函数，不读写 preferences、不修改入参。
// ========================================================

import type { DeckTreeNode } from '../proto/messages/DeckMessages';
import { 牌组色调 } from './主页模型';
import type { 牌组汇总 } from './主页模型';
import { orderDeckChildren } from './DeckReorder';

const 色调轮转池: 牌组色调[] = [牌组色调.Blue, 牌组色调.Purple, 牌组色调.Mint, 牌组色调.Amber];

/** 把接受的中文与 ASCII 层级分隔符转换为 Anki 的 `::` 形式。 */
export function 规范化牌组路径(原始: string): string | null {
  let 规范化结果: string = 原始.trim()
    .replace(/：/g, '::')
    .replace(/:{3,}/g, '::');
  规范化结果 = 规范化结果.replace(/(^|[^:]):(?=[^:]|$)/g, '$1::');
  const 各段: string[] = 规范化结果.split('::').map((段: string): string => 段.trim());
  if (各段.length === 0 || 各段.some((段: string): boolean => 段.length === 0)) {
    return null;
  }
  return 各段.join('::');
}

/** 把选定的父路径与用户输入的叶节点组合为规范化的完整牌组路径。 */
export function 组合牌组路径(父路径: string, 叶节点: string): string | null {
  const 规范化叶节点: string | null = 规范化牌组路径(叶节点);
  if (规范化叶节点 === null) {
    return null;
  }
  const 规范化父路径: string | null = 父路径 === '' ? '' : 规范化牌组路径(父路径);
  if (规范化父路径 === null) {
    return null;
  }
  return 规范化父路径 === '' ? 规范化叶节点 : `${规范化父路径}::${规范化叶节点}`;
}

/** 把 Anki 的合成根节点平铺为前序行，不修改后端聚合计数。
 *  色调覆盖：牌组ID → 牌组色调，若该牌组有持久化记录则覆盖自动轮转；未传入时走原有轮转逻辑。
 *  别名覆盖：牌组ID → 自定义别名，命中时填入 牌组汇总.displayName（空串表示无覆盖）。
 *  顺序覆盖：父ID → 子牌组ID[]，按此顺序重排同 parent 的兄弟节点；未命中或子项不存在时保留原序追加。
 *    父ID='' 表示顶层（root 的直接子节点）。覆盖仅在前端展示层生效，后端 DeckTreeNode.children 顺序不变。
 *  背景图覆盖：牌组ID → 沙盒背景图绝对路径，命中且非空时填入 牌组汇总.backgroundImage；
 *    未命中或 Map 为 null 时保持空串，DeckListItem 走原 surface_card 背景。 */
export function 平铺牌组树(根节点: DeckTreeNode,
  色调覆盖: Map<string, 牌组色调> | null = null,
  别名覆盖: Map<string, string> | null = null,
  顺序覆盖: Map<string, string[]> | null = null,
  背景图覆盖: Map<string, string> | null = null): 牌组汇总[] {
  const 行集: 牌组汇总[] = [];

  const 访问 = (节点: DeckTreeNode, 完整名: string, 深度: number,
    父ID: string, 祖先ID列表: string[]):void => {
    const 当前ID: string = 节点.deckId.toString();
    // fallback 色调用 deckId 稳定 hash 而非 行集.length 索引：
    // 这样未主动设 tone 的牌组色条固定（与位置无关），用户拖动排序后色条不变。
    // 旧实现用 行集.length % len 会让连续创建的 deck 自动轮转 4 色，但拖动后位置变 fallback tone 跟着变，
    // 与用户期望「色条跟着牌组走」矛盾。
    const 兜底色调: 牌组色调 = 色调轮转池[Math.abs(节点.deckId) % 色调轮转池.length];
    const 覆盖色调: 牌组色调 | undefined =
      色调覆盖 !== null ? 色调覆盖.get(当前ID) : undefined;
    const 当前色调: 牌组色调 = 覆盖色调 === undefined ? 兜底色调 : 覆盖色调;
    const 当前别名: string =
      别名覆盖 !== null ? (别名覆盖.get(当前ID) ?? '') : '';
    const 当前背景图: string =
      背景图覆盖 !== null ? (背景图覆盖.get(当前ID) ?? '') : '';
    行集.push({
      id: 当前ID,
      name: 节点.name,
      fullName: 完整名,
      depth: 深度,
      parentId: 父ID,
      hasChildren: 节点.children.length > 0,
      ancestorIds: 祖先ID列表,
      filtered: 节点.filtered,
      description: '',
      newCount: 节点.newCount,
      learningCount: 节点.learnCount,
      reviewCount: 节点.reviewCount,
      totalCards: 节点.totalIncludingChildren,
      tone: 当前色调,
      displayName: 当前别名,
      backgroundImage: 当前背景图
    });
    const 下层祖先: string[] = 祖先ID列表.concat(当前ID);
    const 重排后子节点: DeckTreeNode[] = 重排子节点(节点.children, 当前ID, 顺序覆盖);
    for (const 子节点 of 重排后子节点) {
      const 子节点完整名: string = 完整名 === '' ? 子节点.name : `${完整名}::${子节点.name}`;
      访问(子节点, 子节点完整名, 深度 + 1, 当前ID, 下层祖先);
    }
  };

  // 顶层 children 用 父ID='' 查找顺序覆盖
  const 重排后顶层: DeckTreeNode[] = 重排子节点(根节点.children, '', 顺序覆盖);
  for (const 顶层节点 of 重排后顶层) {
    访问(顶层节点, 顶层节点.name, 0, '', []);
  }
  return 行集;
}

/**
 * 按用户持久化的顺序重排兄弟节点。
 * 规则：
 *  - 顺序覆盖命中 父ID 且 entry 非空：按 entry 中的 id 顺序排
 *  - entry 中未出现的子节点追加到末尾（保留原顺序，防止新增牌组被丢失）
 *  - entry 中存在但 children 中已不存在的 id 跳过（防止删除牌组后顺序卡住）
 */
function 重排子节点(子节点列表: DeckTreeNode[], 父ID: string,
  顺序覆盖: Map<string, string[]> | null): DeckTreeNode[] {
  return orderDeckChildren(子节点列表, 顺序覆盖?.get(父ID) ?? null);
}

/** 返回祖先路径已全部展开的前序行。
 *  隐藏集合：用户主动隐藏的 deck id 集合，命中的行直接过滤掉（不渲染、不计入列表）。
 *    传 null 或不传等同于空集（无隐藏），保持与旧调用方兼容。 */
export function 可见牌组行(行集: 牌组汇总[], 展开ID集合: Set<string>,
  隐藏ID集合: Set<string> | null = null): 牌组汇总[] {
  const 隐藏集: Set<string> = 隐藏ID集合 ?? new Set<string>();
  return 行集.filter((行: 牌组汇总): boolean =>
    !隐藏集.has(行.id) &&
    行.ancestorIds.every((祖先ID: string): boolean => 展开ID集合.has(祖先ID)));
}
