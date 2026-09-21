// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID MODEL-DATA-TRANSFER-001
// @名称 数据传输模型
//
// @作用
// 定义导入导出流程中跨层传递的选项与结果类型：
// 牌组级导出选项、整库导出选项、导入汇总（类型转发）。
// 仅供 UI / 服务 / 编解码层共享类型签名，本身不含业务行为。
//
// @输入
// 无（纯类型声明模块）。
//
// @输出
// 牌组导出选项（接口）
// 整库导出选项（接口）
// 导入汇总（从 proto 层 re-export 的类型别名）
//
// @业务规则
// 字段名沿用 proto / JSON 序列化字段名（withScheduling / includeMedia / legacy 等），
// 以便直接对齐后端编解码，不擅自中文化。
// 导入汇总为类型转发，避免调用方直接依赖 proto 模块。
//
// @副作用
// 无。
// ========================================================

import type { ImportSummary } from '../proto/messages/ImportExportMessages';

export interface 牌组导出选项 {
  withScheduling: boolean;
  withDeckConfigs: boolean;
  withMedia: boolean;
  legacy: boolean;
}

export interface 整库导出选项 {
  includeMedia: boolean;
  legacy: boolean;
}

export type { ImportSummary as 导入汇总 };
