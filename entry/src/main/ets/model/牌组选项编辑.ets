// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID MODEL-DECK-OPTIONS-001
// @名称 牌组选项编辑
//
// @作用
// 当前牌组限额（DeckLimits）与请求级调度器开关的 UI 草稿与校验器。
// 维护源限额与已应用限额两份快照，提供统一校验入口、应用入口、
// 以及转换为后端请求字段（牌组选项请求字段）的出口。
//
// @输入
// DeckLimits | null 与若干调度器开关作为初始来源；
// UI 层直接读写公开文本 / 布尔字段。
//
// @输出
// 校验问题列表（校验问题类型来自 牌组配置表单.ets）；
// apply 成功后更新内部已应用限额；
// 转换为请求字段 返回 牌组选项请求字段 实例供服务层使用。
//
// @业务规则
// 限额草稿（LimitDraft）implements DeckLimits，其字段名（review / new / reviewToday / ...）
// 必须保留 proto 接口字段名，不得中文化。
// 牌组选项请求字段（DeckOptionsRequestFields）为 DTO，字段名对齐后端协议，保留英文。
// @Observed 类（牌组选项编辑）的公开字段为 UI 状态，已中文化。
// i18n 消息键（deck_*_validation_error）保留英文。
//
// @副作用
// 无。本类只在内存中维护草稿与已应用快照，不直接读写数据库或 preferences。
//
// @注意
// @Observed 类的字段中文化后，UI 绑定调用方需同步更新（由主代理统一处理）。
// ========================================================

import type { DeckLimits } from '../proto/messages/DeckConfigMessages';
import type { 校验问题 } from './牌组配置表单';

export class 牌组选项请求字段 {
  limits: DeckLimits | null = null;
  newCardsIgnoreReviewLimit: boolean = false;
  fsrs: boolean = false;
  applyAllParentLimits: boolean = false;
  fsrsReschedule: boolean = false;
  fsrsHealthCheck: boolean = false;
}

class 限额草稿 implements DeckLimits {
  review: number | null = null;
  new: number | null = null;
  reviewToday: number | null = null;
  newToday: number | null = null;
  reviewTodayActive: boolean = false;
  newTodayActive: boolean = false;
  desiredRetention: number | null = null;
}

function 复制限额(源限额: DeckLimits): 限额草稿 {
  const 目标 = new 限额草稿(); 目标.review = 源限额.review; 目标.new = 源限额.new; 目标.reviewToday = 源限额.reviewToday; 目标.newToday = 源限额.newToday; 目标.reviewTodayActive = 源限额.reviewTodayActive; 目标.newTodayActive = 源限额.newTodayActive; 目标.desiredRetention = 源限额.desiredRetention; return 目标;
}
function 限额转文本(值: number | null): string { return 值 === null ? '' : 值.toString(); }
function 解析无符号32位整数(输入文本: string): number | null { const 去除空白后: string = 输入文本.trim(); if (去除空白后 === '') return null; if (!/^\d+$/.test(去除空白后)) return null; const 解析结果: number = Number(去除空白后); return Number.isSafeInteger(解析结果) && 解析结果 <= 4294967295 ? 解析结果 : null; }
function 解析保留率(输入文本: string): number | null { const 去除空白后: string = 输入文本.trim(); if (去除空白后 === '') return null; const 解析结果: number = Number(去除空白后); return Number.isFinite(解析结果) && 解析结果 >= 0.7 && 解析结果 <= 0.99 ? 解析结果 : null; }

/** 仅用于 UI 的当前牌组限额与请求级调度器开关草稿。 */
@Observed
export class 牌组选项编辑 {
  sharedDeckCount: number = 0;
  applyToSharedDecks: boolean = false;
  复习限额文本: string = '';
  新卡限额文本: string = '';
  今日复习文本: string = '';
  今日新卡文本: string = '';
  目标保留率覆盖文本: string = '';
  今日复习启用: boolean = false;
  今日新卡启用: boolean = false;
  新卡忽略复习限额: boolean = false;
  是否启用FSRS: boolean = false;
  应用所有父级限额: boolean = false;
  FSRS重排: boolean = false;
  FSRS健康检查: boolean = false;
  private 源限额: DeckLimits | null = null;
  private 已应用限额: DeckLimits | null = null;

  private constructor(限额: DeckLimits | null, 新卡忽略复习限额: boolean, 是否启用FSRS: boolean, 应用所有父级限额: boolean, FSRS健康检查: boolean) {
    if (限额 !== null) { this.源限额 = 复制限额(限额); this.已应用限额 = 复制限额(限额); this.复习限额文本 = 限额转文本(限额.review); this.新卡限额文本 = 限额转文本(限额.new); this.今日复习文本 = 限额转文本(限额.reviewToday); this.今日新卡文本 = 限额转文本(限额.newToday); this.目标保留率覆盖文本 = 限额转文本(限额.desiredRetention); this.今日复习启用 = 限额.reviewTodayActive; this.今日新卡启用 = 限额.newTodayActive; }
    this.新卡忽略复习限额 = 新卡忽略复习限额; this.是否启用FSRS = 是否启用FSRS; this.应用所有父级限额 = 应用所有父级限额; this.FSRS健康检查 = FSRS健康检查;
  }

  static 从视图创建(限额: DeckLimits | null, 新卡忽略复习限额: boolean, 是否启用FSRS: boolean, 应用所有父级限额: boolean, FSRS健康检查: boolean): 牌组选项编辑 { return new 牌组选项编辑(限额, 新卡忽略复习限额, 是否启用FSRS, 应用所有父级限额, FSRS健康检查); }

  校验(): 校验问题[] {
    const 问题列表: 校验问题[] = []; const 字段键列表: string[] = ['reviewLimit', 'newLimit', 'reviewToday', 'newToday']; const 字段值列表: string[] = [this.复习限额文本, this.新卡限额文本, this.今日复习文本, this.今日新卡文本];
    for (let i = 0; i < 字段键列表.length; i++) if (字段值列表[i].trim() !== '' && 解析无符号32位整数(字段值列表[i]) === null) 问题列表.push({ 字段键: 字段键列表[i], 消息键: 'deck_limit_validation_error' });
    if (this.目标保留率覆盖文本.trim() !== '' && 解析保留率(this.目标保留率覆盖文本) === null) 问题列表.push({ 字段键: 'desiredRetentionOverride', 消息键: 'deck_retention_validation_error' }); return 问题列表;
  }

  应用(): boolean {
    if (this.校验().length > 0) return false;
    if (this.源限额 === null) { this.已应用限额 = null; return true; }
    const 下一个限额 = new 限额草稿(); 下一个限额.review = 解析无符号32位整数(this.复习限额文本); 下一个限额.new = 解析无符号32位整数(this.新卡限额文本); 下一个限额.reviewToday = 解析无符号32位整数(this.今日复习文本); 下一个限额.newToday = 解析无符号32位整数(this.今日新卡文本); 下一个限额.reviewTodayActive = this.今日复习启用; 下一个限额.newTodayActive = this.今日新卡启用; 下一个限额.desiredRetention = 解析保留率(this.目标保留率覆盖文本); this.已应用限额 = 下一个限额; return true;
  }

  转换为请求字段(): 牌组选项请求字段 { const 请求字段 = new 牌组选项请求字段(); 请求字段.limits = this.已应用限额 === null ? null : 复制限额(this.已应用限额); 请求字段.newCardsIgnoreReviewLimit = this.新卡忽略复习限额; 请求字段.fsrs = this.是否启用FSRS; 请求字段.applyAllParentLimits = this.应用所有父级限额; 请求字段.fsrsReschedule = this.FSRS重排; 请求字段.fsrsHealthCheck = this.FSRS健康检查; return 请求字段; }
}
