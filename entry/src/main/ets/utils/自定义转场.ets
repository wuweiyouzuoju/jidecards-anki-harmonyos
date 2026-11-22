// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID UTIL-CUSTOM-TRANSITION-001
// @名称 自定义转场协调器（Navigation customNavContentTransition 配套）
//
// @作用
// 配合 Navigation.customNavContentTransition 实现 NavDestination 推栈的淡入淡出转场。
// 每个 NavDestination 在 aboutToAppear 时注册自身的 opacity 设置回调，
// Navigation 的 customNavContentTransition 回调内通过本单例触发 from/to 双方的 opacity 动画。
//
// @输入
// NavDestination 注册：navDestinationId + 设置 opacity 的回调
// Navigation 触发：from.navDestinationId / to.navDestinationId + isPush + isExit
//
// @输出
// CustomTransition 单例：
//   .注册NavParam(id, 起点回调, 终点回调)
//   .取起点回调(id) / 取终点回调(id)
//   .注销NavParam(id)
//
// @业务规则
// ArkUI 不支持通过 navDestinationId 直接反查组件实例设置属性，
// 必须由 NavDestination 主动注册回调（闭包捕获自身 @State opacity），
// Navigation 转场回调内通过 id 查找回调并调用。
// 回调签名：(isPush: boolean, isExit: boolean) => void
//   - isPush=true 表示 push 操作，isExit=true 表示该页是退出方（被覆盖），isExit=false 表示该页是进入方
//   - isPush=false 表示 pop 操作，isExit=true 表示该页是退出方（被弹出），isExit=false 表示该页是进入方（恢复显示）
// 起点回调：设置 opacity 起始值（push 时进入方 opacity=0、退出方 opacity=1；pop 时进入方 opacity=0、退出方 opacity=1）
// 终点回调：设置 opacity 终止值（均为 opacity=1，淡入到完全显示）
//
// @Invariants
// - 注册的回调在 NavDestination aboutToDisappear 时必须注销，避免内存泄漏与野回调
// - 同一 navDestinationId 重复注册时覆盖旧回调（NavDestination 重建场景）
//
// @Extension Points
// - 若未来需扩展为 translate/scale 等更复杂转场，可在 回调签名 内增加 effectType 参数
//
// @副作用
// 维护模块级 Map<id, 回调>，注册/注销时写入/删除。
// ========================================================

import { navigationEnterOffset } from './AppMotion';

/** NavDestination 注册的转场回调对：起点设置 + 终点设置。 */
export interface 转场回调对 {
  prepare?: () => Promise<void>;
  /** 起点回调：设置 opacity 起始值。isPush=true 是 push 操作；isExit=true 是退出方。 */
  起点: (isPush: boolean, isExit: boolean) => void;
  /** 终点回调：设置 opacity 终止值（通常为 1.0）。isPush=true 是 push 操作；isExit=true 是退出方。 */
  终点: (isPush: boolean, isExit: boolean) => void;
}

/** 自定义转场协调器单例。 */
export class CustomTransition {
  private static 实例: CustomTransition | null = null;
  private 回调表: Map<string, 转场回调对> = new Map<string, 转场回调对>();

  private constructor() {}

  /** 取单例。 */
  static getInstance(): CustomTransition {
    if (CustomTransition.实例 === null) {
      CustomTransition.实例 = new CustomTransition();
    }
    return CustomTransition.实例;
  }

  /** 注册 NavDestination 的转场回调。同一 id 重复注册时覆盖。 */
  注册NavParam(id: string, 起点: (isPush: boolean, isExit: boolean) => void,
    终点: (isPush: boolean, isExit: boolean) => void, prepare?: () => Promise<void>): void {
    this.回调表.set(id, { 起点, 终点, prepare });
  }

  /** 共用页面入场位移与显隐时序，读取当前动效档位。 */
  registerPage(id: string, update: (opacity: number, offset: number) => void, prepare?: () => Promise<void>): void {
    this.注册NavParam(id,
      (isPush: boolean, isExit: boolean): void => { update(isExit ? 1 : 0, isExit ? 0 : navigationEnterOffset(isPush)); },
      (_isPush: boolean, isExit: boolean): void => { update(isExit ? 0 : 1, 0); },
      prepare);
  }

  /** 取指定 id 的起点回调；不存在返回 null。 */
  取起点回调(id: string): ((isPush: boolean, isExit: boolean) => void) | null {
    const 回调对: 转场回调对 | undefined = this.回调表.get(id);
    return 回调对 ? 回调对.起点 : null;
  }

  /** 取指定 id 的终点回调；不存在返回 null。 */
  取终点回调(id: string): ((isPush: boolean, isExit: boolean) => void) | null {
    const 回调对: 转场回调对 | undefined = this.回调表.get(id);
    return 回调对 ? 回调对.终点 : null;
  }

  preparation(id: string): (() => Promise<void>) | null {
    return this.回调表.get(id)?.prepare ?? null;
  }

  /** 注销指定 id 的回调（NavDestination aboutToDisappear 时调用）。 */
  注销NavParam(id: string): void {
    this.回调表.delete(id);
  }
}
