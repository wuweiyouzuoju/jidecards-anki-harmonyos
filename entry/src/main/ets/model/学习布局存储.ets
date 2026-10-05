// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID MODEL-STUDY-LAYOUT-001
// @名称 复习页布局持久化
//
// @作用
// 复习页布局持久化：底部 / 浮动 / 智感模式与工具栏位置。
// 用 preferences（@kit.ArkData）存储，与 DeckMetaStore 同一 store 但 key 前缀独立。
// 浮动模式下的工具栏位置以 vp 为单位，避免与屏幕分辨率耦合；
// 拖出屏幕外时由调用方夹紧。
//
// @输入
// 无（读取布局/工具栏位置）；mode / x / y（保存）
//
// @输出
// 加载学习布局模式(): Promise<学习布局模式>
// 保存学习布局模式(mode): Promise<void>
// 加载工具栏位置(toolbarId): Promise<工具栏位置 | null>
// 保存工具栏位置(toolbarId, x, y): Promise<void>
//
// @业务规则
// 'bottom' / 'float' / 'smart' / 'main' / 'aux' 是字符串字面量联合类型的值，
// 同时也是持久化协议字段，保留英文，不可中文化。
//
// @副作用
// 读写 preferences 的 jidecards_study_layout store。
//
// @注意
// preferences 中的字符串键（'jidecards_study_layout' /
// 'study_layout_mode' / 'study_main_toolbar_x' / 'study_main_toolbar_y' /
// 'study_aux_toolbar_x' / 'study_aux_toolbar_y' / 'abilityContext'）
// 属持久化协议字段，保留英文，不可中文化。
// ========================================================

import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { StudyLayoutMode, decodeStudyLayout } from './StudyLayout';

const 存储名: string = 'jidecards_study_layout';
const 布局模式键: string = 'study_layout_mode';
const 主工具栏X键: string = 'study_main_toolbar_x';
const 主工具栏Y键: string = 'study_main_toolbar_y';
const 辅工具栏X键: string = 'study_aux_toolbar_x';
const 辅工具栏Y键: string = 'study_aux_toolbar_y';
const 上下文键: string = 'abilityContext';
let gripHeightWrite: Promise<void> = Promise.resolve();

// ========================================================
// @块ID MODEL-STUDY-LAYOUT-002
// @名称 学习布局模式
//
// @作用
// 复习页操作按钮布局模式类型。
//
// @输入
// 无（类型定义）
//
// @输出
// 字符串字面量联合类型：'bottom' | 'float' | 'smart'
// - 'bottom' = 贴底部（默认，保持原体验）
// - 'float' = 浮动可拖动
// - 'smart' = 智感握姿换边，独立保存高度
//
// @业务规则
// 'bottom' / 'float' / 'smart' 是持久化协议字段值，保留英文。
//
// @副作用
// 无
// ========================================================
export type 学习布局模式 = StudyLayoutMode;

// ========================================================
// @块ID MODEL-STUDY-LAYOUT-003
// @名称 学习工具栏标识
//
// @作用
// 浮动工具栏标识类型。
//
// @输入
// 无（类型定义）
//
// @输出
// 字符串字面量联合类型：'main' | 'aux'
// - 'main' = 主操作（显示答案 / 4 评分按钮）
// - 'aux' = 辅助操作（埋藏 / 暂停）
//
// @业务规则
// 'main' / 'aux' 是持久化协议字段值，保留英文。
//
// @副作用
// 无
// ========================================================
export type 学习工具栏标识 = 'main' | 'aux';

// ========================================================
// @块ID MODEL-STUDY-LAYOUT-004
// @名称 工具栏位置
//
// @作用
// 浮动工具栏屏幕坐标（vp）。
//
// @输入
// 无（数据结构定义）
//
// @输出
// 字段：
// x - 工具栏左上角相对屏幕左上角的水平偏移（vp）
// y - 工具栏左上角相对屏幕左上角的垂直偏移（vp）
//
// @副作用
// 无
// ========================================================
export interface 工具栏位置 {
  x: number;
  y: number;
}

function 取上下文(): common.UIAbilityContext | null {
  const 上下文: common.UIAbilityContext | undefined =
    AppStorage.get<common.UIAbilityContext>(上下文键);
  return 上下文 === undefined ? null : 上下文;
}

// ========================================================
// @块ID MODEL-STUDY-LAYOUT-005
// @名称 加载学习布局模式
//
// @作用
// 读取复习页布局模式。
//
// @输入
// 无
//
// @输出
// Promise<学习布局模式>：读取失败或未设置时返回 'bottom'（默认保持原体验）。
//
// @副作用
// 只读 preferences，不写入。
// ========================================================
export async function 加载学习布局模式(): Promise<学习布局模式> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return 'bottom';
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    const 值: preferences.ValueType = await 存储.get(布局模式键, 'bottom');
    return typeof 值 === 'string' ? decodeStudyLayout(值) : 'bottom';
  } catch (错误) {
    return 'bottom';
  }
}

// ========================================================
// @块ID MODEL-STUDY-LAYOUT-006
// @名称 保存学习布局模式
//
// @作用
// 持久化布局模式。
//
// @输入
// mode: 学习布局模式
//
// @输出
// Promise<void>
//
// @副作用
// 写入 preferences 的 study_layout_mode 并 flush 落盘。
// ========================================================
export async function 保存学习布局模式(模式: 学习布局模式): Promise<void> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    await 存储.put(布局模式键, 模式);
    await 存储.flush();
  } catch (错误) {
    // 偏好不可用时仅丢失持久化，不阻塞 UI。
  }
}

/** 自动换边不覆盖自由拖动 X/Y；智感模式只保存独立高度。
 * @throws {Error} 读取失败由工具栏提示，不当作首次使用。 */
export async function loadStudyGripHeight(): Promise<number | null> {
  const context: common.UIAbilityContext | null = 取上下文();
  if (context === null) return null;
  await gripHeightWrite;
  const store: preferences.Preferences = await preferences.getPreferences(context, 存储名);
  const value: preferences.ValueType = await store.get('study_grip_toolbar_y', -1);
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** @throws {Error} 保存失败由工具栏显示重试提示。 */
export async function saveStudyGripHeight(y: number): Promise<void> {
  const context: common.UIAbilityContext | null = 取上下文();
  if (context === null) throw new Error('ability_context_unavailable');
  const work: Promise<void> = gripHeightWrite.then(async (): Promise<void> => {
    const store: preferences.Preferences = await preferences.getPreferences(context, 存储名);
    await store.put('study_grip_toolbar_y', y);
    await store.flush();
  });
  // 调用者仍收到原始失败；队列尾恢复，后续拖动可以重试。
  gripHeightWrite = work.catch((): void => {});
  return work;
}

// ========================================================
// @块ID MODEL-STUDY-LAYOUT-007
// @名称 加载工具栏位置
//
// @作用
// 读取指定浮动工具栏的拖动位置（vp）。
//
// @输入
// toolbarId: 学习工具栏标识（'main' 或 'aux'）
//
// @输出
// Promise<工具栏位置 | null>：未持久化时返回 null，
// 调用方应使用默认位置（如主工具栏贴右下、辅助工具栏贴左下）。
//
// @副作用
// 只读 preferences，不写入。
// ========================================================
export async function 加载工具栏位置(工具栏ID: 学习工具栏标识): Promise<工具栏位置 | null> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return null;
  }
  const X键: string = 工具栏ID === 'main' ? 主工具栏X键 : 辅工具栏X键;
  const Y键: string = 工具栏ID === 'main' ? 主工具栏Y键 : 辅工具栏Y键;
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    const X存在: boolean = await 存储.has(X键);
    if (!X存在) {
      return null;
    }
    const X值: preferences.ValueType = await 存储.get(X键, 0);
    const Y值: preferences.ValueType = await 存储.get(Y键, 0);
    if (typeof X值 !== 'number' || typeof Y值 !== 'number') {
      return null;
    }
    const 位置: 工具栏位置 = { x: X值, y: Y值 };
    return 位置;
  } catch (错误) {
    return null;
  }
}

// ========================================================
// @块ID MODEL-STUDY-LAYOUT-008
// @名称 保存工具栏位置
//
// @作用
// 持久化指定浮动工具栏的拖动位置（vp）。
//
// @输入
// toolbarId: 学习工具栏标识（'main' 或 'aux'）
// x: number - 水平偏移（vp）
// y: number - 垂直偏移（vp）
//
// @输出
// Promise<void>
//
// @副作用
// 写入 preferences 的 study_main_toolbar_x/y 或 study_aux_toolbar_x/y 并 flush 落盘。
// ========================================================
export async function 保存工具栏位置(工具栏ID: 学习工具栏标识, x: number, y: number): Promise<void> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return;
  }
  const X键: string = 工具栏ID === 'main' ? 主工具栏X键 : 辅工具栏X键;
  const Y键: string = 工具栏ID === 'main' ? 主工具栏Y键 : 辅工具栏Y键;
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    await 存储.put(X键, x);
    await 存储.put(Y键, y);
    await 存储.flush();
  } catch (错误) {
    // 偏好不可用时仅丢失持久化，不阻塞 UI。
  }
}
