// SPDX-License-Identifier: AGPL-3.0-or-later

import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { isFreshInstall } from '../utils/HomeIntroStore';
import { CLOUD_DECK_CHANNEL_ENABLED } from './ReleaseFeatures';

const 存储名: string = 'jidecards_settings';
// 固定代际键：后续普通版本升级不得再次触发本次强制引导。
const 引导完成键: string = 'cloud_deck_required_onboarding_completed_v1';
// 下载配额：本机只要成功导入过 ≥1 个直链牌组就用尽，用尽后不再自动弹引导、菜单入口隐藏。
// 卸载重装会清空 preferences，配额自然恢复——这是刻意保留的正常行为。
const 下载配额已用尽键: string = 'cloud_deck_download_quota_used_v1';
const 上下文键: string = 'abilityContext';

function 取能力上下文(): common.UIAbilityContext | null {
  const context: common.UIAbilityContext | undefined =
    AppStorage.get<common.UIAbilityContext>(上下文键);
  return context === undefined ? null : context;
}

/** 读取布尔标记；读取失败一律返回 false，让调用方按「未完成」处理以便下次重试。 */
async function 读取标记(键: string): Promise<boolean> {
  const context: common.UIAbilityContext | null = 取能力上下文();
  if (context === null) {
    return false;
  }
  try {
    const store: preferences.Preferences = await preferences.getPreferences(context, 存储名);
    const value: preferences.ValueType = await store.get(键, false);
    return value === true;
  } catch (error) {
    return false;
  }
}

/** 写入布尔标记并立即落盘；返回是否真正持久化成功。 */
async function 写入标记(键: string): Promise<boolean> {
  const context: common.UIAbilityContext | null = 取能力上下文();
  if (context === null) {
    return false;
  }
  try {
    const store: preferences.Preferences = await preferences.getPreferences(context, 存储名);
    await store.put(键, true);
    await store.flush();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 读取本机首次云端牌组引导是否还需要展示。
 * Invariants: 引导完成标记与下载配额任一为真即不再展示——配额用尽后再弹也没有可下载的牌组。
 */
export async function 是否已完成云端牌组引导(): Promise<boolean> {
  return await 读取标记(引导完成键) || await 读取标记(下载配额已用尽键);
}

/** 读取本机直链牌组下载配额是否已用尽；用尽后菜单入口隐藏。 */
export async function 是否已用尽云端牌组下载配额(): Promise<boolean> {
  return await 读取标记(下载配额已用尽键);
}

/** 首页与 JIDE 共用新安装和未用配额条件。 */
export async function isCloudDeckAvailable(): Promise<boolean> {
  return CLOUD_DECK_CHANNEL_ENABLED && await isFreshInstall() && !await 是否已用尽云端牌组下载配额();
}

/** 标记首次云端牌组引导已完成；只有真正落盘后才允许进入软件。 */
export async function 标记已完成云端牌组引导(): Promise<boolean> {
  return await 写入标记(引导完成键);
}

/**
 * 标记本机下载配额已用尽。
 * Invariants: 一批下载里只要有 ≥1 个牌组导入成功就调用，不看失败数量——否则用户可以靠
 * 「故意留一个失败」让弹窗不收尾，反复分批下载绕过配额。
 */
export async function 标记已用尽云端牌组下载配额(): Promise<boolean> {
  return await 写入标记(下载配额已用尽键);
}
