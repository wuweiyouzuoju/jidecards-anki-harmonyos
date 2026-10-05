// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID MODEL-DECK-CONFIG-FORM-001
// @名称 牌组配置表单
//
// @作用
// 牌组配置（DeckConfigSettings）的 UI 编辑表单与校验器。
// 把 proto 层的数字 / 数组型配置项转换为字符串文本供 UI 绑定，
// 维护原始编辑缓冲与无效键集合，提供统一校验入口与回写入口。
//
// @输入
// DeckConfigSettings（来自 proto 层）作为初始来源；
// UI 层通过 set* 系列方法写入文本值。
//
// @输出
// 校验问题（ValidationIssue）列表；
// applyToSettings 成功时把合并后的配置写回目标 DeckConfigSettings。
//
// @业务规则
// 公开文本字段为 UI 文本态（字符串），与 proto 字段同名但类型不同，
// 改名后通过中文名显式区分（如 学习步骤文本 vs proto.learnSteps）。
// 所有以 keyof DeckConfigSettings 为键的字符串字面量（'learnSteps' / 'newPerDay' 等）
// 必须保留 proto 字段名，因为它们用于索引 proto 类型。
// i18n 消息键（deck_*_validation_error）保留英文。
//
// @副作用
// 无。本类只在内存中维护草稿，不直接读写数据库或 preferences。
//
// @注意
// @Observed 类的字段中文化后，UI 绑定调用方需同步更新（由主代理统一处理）。
// ========================================================

import { emptyDeckConfigSettings } from '../proto/messages/DeckConfigMessages';
import { parseDeckOptionSteps, deckOptionStepsText, deckOptionFloatInRange } from './DeckOptionsCatalog';
import type { DeckConfigSettings } from '../proto/messages/DeckConfigMessages';

export interface 校验问题 { 字段键: string; 消息键: string; }
class 原始编辑项 { 键: string = ''; 值: string = ''; }
class 整数范围规则 { 键: string = ''; 最小值: number = 0; 最大值: number = 0; }
class 浮点范围规则 { 键: string = ''; 最小值: number = 0; 最大值: number = 0; }

function 复制配置到(源配置: DeckConfigSettings, 目标配置: DeckConfigSettings): void {
  目标配置.learnSteps = 源配置.learnSteps.slice(); 目标配置.relearnSteps = 源配置.relearnSteps.slice(); 目标配置.fsrsParams4 = 源配置.fsrsParams4.slice(); 目标配置.easyDaysPercentages = 源配置.easyDaysPercentages.slice(); 目标配置.fsrsParams5 = 源配置.fsrsParams5.slice(); 目标配置.fsrsParams6 = 源配置.fsrsParams6.slice();
  目标配置.newPerDay = 源配置.newPerDay; 目标配置.reviewsPerDay = 源配置.reviewsPerDay; 目标配置.initialEase = 源配置.initialEase; 目标配置.easyMultiplier = 源配置.easyMultiplier; 目标配置.hardMultiplier = 源配置.hardMultiplier; 目标配置.lapseMultiplier = 源配置.lapseMultiplier; 目标配置.intervalMultiplier = 源配置.intervalMultiplier; 目标配置.maximumReviewInterval = 源配置.maximumReviewInterval; 目标配置.minimumLapseInterval = 源配置.minimumLapseInterval; 目标配置.graduatingIntervalGood = 源配置.graduatingIntervalGood; 目标配置.graduatingIntervalEasy = 源配置.graduatingIntervalEasy; 目标配置.newCardInsertOrder = 源配置.newCardInsertOrder; 目标配置.leechAction = 源配置.leechAction; 目标配置.leechThreshold = 源配置.leechThreshold; 目标配置.disableAutoplay = 源配置.disableAutoplay; 目标配置.capAnswerTimeToSecs = 源配置.capAnswerTimeToSecs; 目标配置.showTimer = 源配置.showTimer; 目标配置.skipQuestionWhenReplayingAnswer = 源配置.skipQuestionWhenReplayingAnswer; 目标配置.buryNew = 源配置.buryNew; 目标配置.buryReviews = 源配置.buryReviews; 目标配置.buryInterdayLearning = 源配置.buryInterdayLearning; 目标配置.newMix = 源配置.newMix; 目标配置.interdayLearningMix = 源配置.interdayLearningMix; 目标配置.newCardSortOrder = 源配置.newCardSortOrder; 目标配置.reviewOrder = 源配置.reviewOrder; 目标配置.newCardGatherPriority = 源配置.newCardGatherPriority; 目标配置.newPerDayMinimum = 源配置.newPerDayMinimum; 目标配置.questionAction = 源配置.questionAction; 目标配置.desiredRetention = 源配置.desiredRetention; 目标配置.stopTimerOnAnswer = 源配置.stopTimerOnAnswer; 目标配置.historicalRetention = 源配置.historicalRetention; 目标配置.secondsToShowQuestion = 源配置.secondsToShowQuestion; 目标配置.secondsToShowAnswer = 源配置.secondsToShowAnswer; 目标配置.answerAction = 源配置.answerAction; 目标配置.waitForAudio = 源配置.waitForAudio; 目标配置.paramSearch = 源配置.paramSearch; 目标配置.ignoreRevlogsBeforeDate = 源配置.ignoreRevlogsBeforeDate; 目标配置.other = 源配置.other.slice(); 目标配置.preserved = 源配置.preserved.map((数组值: Uint8Array): Uint8Array => 数组值.slice());
}
function 解析学习步骤(输入文本: string): number[] | null { return parseDeckOptionSteps(输入文本); }
function 解析浮点数组(输入文本: string): number[] | null { const 结果: number[] = []; const 去除空白后 = 输入文本.trim(); if (去除空白后 === '') return 结果; const 分词 = 去除空白后.split(/\s+/); for (let i = 0; i < 分词.length; i++) { const 解析的数值 = Number(分词[i]); if (!Number.isFinite(解析的数值)) return null; 结果.push(解析的数值); } return 结果; }
function 解析数值(输入文本: string): number | null { const 解析结果 = Number(输入文本.trim()); return Number.isFinite(解析结果) ? 解析结果 : null; }
function 在整数范围内(值: number, 最小值: number, 最大值: number): boolean { return Number.isInteger(值) && 值 >= 最小值 && 值 <= 最大值; }
function 在数值范围内(值: number, 最小值: number, 最大值: number): boolean { return deckOptionFloatInRange(值, 最小值, 最大值); }
function 日期合法(输入文本: string): boolean { if (输入文本 === '') return true; if (!/^\d{4}-\d{2}-\d{2}$/.test(输入文本)) return false; const 日期分段: string[] = 输入文本.split('-'); const 日期对象: Date = new Date(`${输入文本}T00:00:00Z`); return Number.isFinite(日期对象.getTime()) && 日期对象.getUTCFullYear() === Number(日期分段[0]) && 日期对象.getUTCMonth() + 1 === Number(日期分段[1]) && 日期对象.getUTCDate() === Number(日期分段[2]); }
function 枚举值合法(字段键: string, 值: number): boolean { if (!Number.isInteger(值)) return false; if (字段键 === 'newCardInsertOrder') return 值 === 0 || 值 === 1; if (字段键 === 'newCardGatherPriority') return [0, 1, 2, 3, 4, 5].includes(值); if (字段键 === 'newCardSortOrder') return [0, 1, 2, 3, 4].includes(值); if (字段键 === 'reviewOrder') return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(值); if (字段键 === 'newMix' || 字段键 === 'interdayLearningMix') return [0, 1, 2].includes(值); if (字段键 === 'leechAction') return 值 === 0 || 值 === 1; if (字段键 === 'answerAction') return [0, 1, 2, 3, 4].includes(值); if (字段键 === 'questionAction') return 值 === 0 || 值 === 1; return true; }

@Observed
export class 牌组配置表单 {
  学习步骤文本: string = ''; 重学步骤文本: string = ''; 每日新卡数文本: string = ''; 每日复习数文本: string = ''; 目标保留率文本: string = '';
  private 草稿: DeckConfigSettings;
  private 无效原始键列表: string[] = [];
  private 原始编辑列表: 原始编辑项[] = [];
  private constructor(源配置: DeckConfigSettings) { this.草稿 = emptyDeckConfigSettings(); 复制配置到(源配置, this.草稿); this.学习步骤文本 = deckOptionStepsText(源配置.learnSteps); this.重学步骤文本 = deckOptionStepsText(源配置.relearnSteps); this.每日新卡数文本 = 源配置.newPerDay.toString(); this.每日复习数文本 = 源配置.reviewsPerDay.toString(); this.目标保留率文本 = 源配置.desiredRetention.toString(); }
  static 从配置创建(配置: DeckConfigSettings): 牌组配置表单 { return new 牌组配置表单(配置); }
  取配置(): DeckConfigSettings { return this.草稿; }
  private 标记原始键状态(字段键: string, 是否合法: boolean): void { const 索引 = this.无效原始键列表.indexOf(字段键); if (!是否合法 && 索引 < 0) this.无效原始键列表.push(字段键); if (是否合法 && 索引 >= 0) this.无效原始键列表.splice(索引, 1); }
  private 保存原始编辑(字段键: string, 文本值: string): void { for (let i = 0; i < this.原始编辑列表.length; i++) { if (this.原始编辑列表[i].键 === 字段键) { this.原始编辑列表[i].值 = 文本值; return; } } const 新建编辑 = new 原始编辑项(); 新建编辑.键 = 字段键; 新建编辑.值 = 文本值; this.原始编辑列表.push(新建编辑); }
  取字段文本值(字段键: keyof DeckConfigSettings): string { for (let i = 0; i < this.原始编辑列表.length; i++) if (this.原始编辑列表[i].键 === 字段键) return this.原始编辑列表[i].值; const 当前值 = this.草稿[字段键]; return typeof 当前值 === 'number' ? 当前值.toString() : ''; }
  设置数值字段(字段键: keyof DeckConfigSettings, 文本值: string): void { this.保存原始编辑(字段键 as string, 文本值); const 解析结果 = 解析数值(文本值); this.标记原始键状态(字段键 as string, 解析结果 !== null); if (解析结果 !== null && typeof this.草稿[字段键] === 'number') this.草稿[字段键] = 解析结果 as never; }
  设置布尔字段(字段键: keyof DeckConfigSettings, 布尔值: boolean): void { if (typeof this.草稿[字段键] === 'boolean') this.草稿[字段键] = 布尔值 as never; }
  设置文本字段(字段键: keyof DeckConfigSettings, 文本值: string): void { if (typeof this.草稿[字段键] === 'string') this.草稿[字段键] = 文本值 as never; }
  取浮点数组文本(字段键: keyof DeckConfigSettings): string { for (let i = 0; i < this.原始编辑列表.length; i++) if (this.原始编辑列表[i].键 === 字段键) return this.原始编辑列表[i].值; const 当前值 = this.草稿[字段键]; return Array.isArray(当前值) ? (当前值 as number[]).join(' ') : ''; }
  设置浮点数组字段(字段键: keyof DeckConfigSettings, 文本值: string): void { this.保存原始编辑(字段键 as string, 文本值); const 解析结果 = 解析浮点数组(文本值); this.标记原始键状态(字段键 as string, 解析结果 !== null); if (解析结果 !== null && Array.isArray(this.草稿[字段键])) this.草稿[字段键] = 解析结果 as never; }
  校验(): 校验问题[] {
    const 问题列表: 校验问题[] = []; for (let i = 0; i < this.无效原始键列表.length; i++) 问题列表.push({ 字段键: this.无效原始键列表[i], 消息键: 'deck_invalid_number_validation_error' }); if (解析学习步骤(this.学习步骤文本) === null) 问题列表.push({ 字段键: 'learnSteps', 消息键: 'deck_learn_steps_validation_error' }); if (解析学习步骤(this.重学步骤文本) === null) 问题列表.push({ 字段键: 'relearnSteps', 消息键: 'deck_relearn_steps_validation_error' }); if (!/^\d+$/.test(this.每日新卡数文本.trim()) || !在整数范围内(Number(this.每日新卡数文本.trim()), 0, 9999)) 问题列表.push({ 字段键: 'newPerDay', 消息键: 'deck_limit_validation_error' }); if (!/^\d+$/.test(this.每日复习数文本.trim()) || !在整数范围内(Number(this.每日复习数文本.trim()), 0, 9999)) 问题列表.push({ 字段键: 'reviewsPerDay', 消息键: 'deck_limit_validation_error' }); const 保留率 = 解析数值(this.目标保留率文本); if (保留率 === null || (保留率 !== 0 && !在数值范围内(保留率, 0.7, 0.99))) 问题列表.push({ 字段键: 'desiredRetention', 消息键: 'deck_retention_validation_error' });
    const 整数规则列表: 整数范围规则[] = []; const 新卡最小数规则 = new 整数范围规则(); 新卡最小数规则.键 = 'newPerDayMinimum'; 新卡最小数规则.最小值 = 0; 新卡最小数规则.最大值 = 9999; 整数规则列表.push(新卡最小数规则); const 最大复习间隔规则 = new 整数范围规则(); 最大复习间隔规则.键 = 'maximumReviewInterval'; 最大复习间隔规则.最小值 = 1; 最大复习间隔规则.最大值 = 36500; 整数规则列表.push(最大复习间隔规则); const 最小失败间隔规则 = new 整数范围规则(); 最小失败间隔规则.键 = 'minimumLapseInterval'; 最小失败间隔规则.最小值 = 1; 最小失败间隔规则.最大值 = 9999; 整数规则列表.push(最小失败间隔规则); const 毕业良好间隔规则 = new 整数范围规则(); 毕业良好间隔规则.键 = 'graduatingIntervalGood'; 毕业良好间隔规则.最小值 = 0; 毕业良好间隔规则.最大值 = 9999; 整数规则列表.push(毕业良好间隔规则); const 毕业简单间隔规则 = new 整数范围规则(); 毕业简单间隔规则.键 = 'graduatingIntervalEasy'; 毕业简单间隔规则.最小值 = 0; 毕业简单间隔规则.最大值 = 9999; 整数规则列表.push(毕业简单间隔规则); const 水蛭阈值规则 = new 整数范围规则(); 水蛭阈值规则.键 = 'leechThreshold'; 水蛭阈值规则.最小值 = 1; 水蛭阈值规则.最大值 = 9999; 整数规则列表.push(水蛭阈值规则); const 答题时长上限规则 = new 整数范围规则(); 答题时长上限规则.键 = 'capAnswerTimeToSecs'; 答题时长上限规则.最小值 = 1; 答题时长上限规则.最大值 = 7200; 整数规则列表.push(答题时长上限规则);
    for (let i = 0; i < 整数规则列表.length; i++) { const 当前规则 = 整数规则列表[i]; if (!在整数范围内(this.草稿[当前规则.键 as keyof DeckConfigSettings] as number, 当前规则.最小值, 当前规则.最大值)) 问题列表.push({ 字段键: 当前规则.键, 消息键: 'deck_range_validation_error' }); }
    const 浮点规则列表: 浮点范围规则[] = []; const 初始难度规则 = new 浮点范围规则(); 初始难度规则.键 = 'initialEase'; 初始难度规则.最小值 = 1.31; 初始难度规则.最大值 = 5; 浮点规则列表.push(初始难度规则); const 简单倍率规则 = new 浮点范围规则(); 简单倍率规则.键 = 'easyMultiplier'; 简单倍率规则.最小值 = 1; 简单倍率规则.最大值 = 5; 浮点规则列表.push(简单倍率规则); const 困难倍率规则 = new 浮点范围规则(); 困难倍率规则.键 = 'hardMultiplier'; 困难倍率规则.最小值 = 0.5; 困难倍率规则.最大值 = 1.3; 浮点规则列表.push(困难倍率规则); const 失败倍率规则 = new 浮点范围规则(); 失败倍率规则.键 = 'lapseMultiplier'; 失败倍率规则.最小值 = 0; 失败倍率规则.最大值 = 1; 浮点规则列表.push(失败倍率规则); const 间隔倍率规则 = new 浮点范围规则(); 间隔倍率规则.键 = 'intervalMultiplier'; 间隔倍率规则.最小值 = 0.5; 间隔倍率规则.最大值 = 2; 浮点规则列表.push(间隔倍率规则); const 历史保留率规则 = new 浮点范围规则(); 历史保留率规则.键 = 'historicalRetention'; 历史保留率规则.最小值 = 0.5; 历史保留率规则.最大值 = 1; 浮点规则列表.push(历史保留率规则); const 显示问题秒数规则 = new 浮点范围规则(); 显示问题秒数规则.键 = 'secondsToShowQuestion'; 显示问题秒数规则.最小值 = 0; 显示问题秒数规则.最大值 = 9999; 浮点规则列表.push(显示问题秒数规则); const 显示答案秒数规则 = new 浮点范围规则(); 显示答案秒数规则.键 = 'secondsToShowAnswer'; 显示答案秒数规则.最小值 = 0; 显示答案秒数规则.最大值 = 9999; 浮点规则列表.push(显示答案秒数规则);
    for (let i = 0; i < 浮点规则列表.length; i++) { const 当前规则 = 浮点规则列表[i]; if (!在数值范围内(this.草稿[当前规则.键 as keyof DeckConfigSettings] as number, 当前规则.最小值, 当前规则.最大值)) 问题列表.push({ 字段键: 当前规则.键, 消息键: 'deck_range_validation_error' }); }
    const 枚举字段键列表 = ['newCardInsertOrder', 'newCardGatherPriority', 'newCardSortOrder', 'reviewOrder', 'newMix', 'interdayLearningMix', 'leechAction', 'answerAction', 'questionAction']; for (let i = 0; i < 枚举字段键列表.length; i++) { const 当前键 = 枚举字段键列表[i]; if (!枚举值合法(当前键, this.草稿[当前键 as keyof DeckConfigSettings] as number)) 问题列表.push({ 字段键: 当前键, 消息键: 'deck_enum_validation_error' }); }
    const FSRS4参数 = this.草稿.fsrsParams4; const FSRS5参数 = this.草稿.fsrsParams5; const FSRS6参数 = this.草稿.fsrsParams6; const 轻松日百分比 = this.草稿.easyDaysPercentages;
    if (FSRS4参数.length !== 0 && FSRS4参数.length !== 17) 问题列表.push({ 字段键: 'fsrsParams4', 消息键: 'deck_fsrs_parameters_validation_error' }); if (FSRS5参数.length !== 0 && FSRS5参数.length !== 19) 问题列表.push({ 字段键: 'fsrsParams5', 消息键: 'deck_fsrs_parameters_validation_error' }); if (FSRS6参数.length !== 0 && FSRS6参数.length !== 21) 问题列表.push({ 字段键: 'fsrsParams6', 消息键: 'deck_fsrs_parameters_validation_error' }); if ((轻松日百分比.length !== 0 && 轻松日百分比.length !== 7) || 轻松日百分比.some((值: number): boolean => !在数值范围内(值, 0, 1))) 问题列表.push({ 字段键: 'easyDaysPercentages', 消息键: 'deck_easy_days_validation_error' });
    if (!日期合法(this.草稿.ignoreRevlogsBeforeDate)) 问题列表.push({ 字段键: 'ignoreRevlogsBeforeDate', 消息键: 'deck_date_validation_error' }); return 问题列表;
  }
  应用到配置(目标配置: DeckConfigSettings): boolean { if (this.校验().length > 0) return false; const 学习步骤数组 = 解析学习步骤(this.学习步骤文本); const 重学步骤数组 = 解析学习步骤(this.重学步骤文本); if (学习步骤数组 === null || 重学步骤数组 === null) return false; const 候选配置 = emptyDeckConfigSettings(); 复制配置到(this.草稿, 候选配置); 候选配置.learnSteps = 学习步骤数组; 候选配置.relearnSteps = 重学步骤数组; 候选配置.newPerDay = Number(this.每日新卡数文本.trim()); 候选配置.reviewsPerDay = Number(this.每日复习数文本.trim()); 候选配置.desiredRetention = Number(this.目标保留率文本.trim()); 复制配置到(候选配置, 目标配置); return true; }
}
