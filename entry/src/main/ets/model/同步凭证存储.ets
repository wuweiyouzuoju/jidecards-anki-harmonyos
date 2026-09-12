// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID MODEL-SYNC-AUTH-001
// @名称 AnkiWeb 同步凭证本地持久化
//
// @作用
// 持久化 AnkiWeb 登录成功后的会话令牌 hkey / endpoint / username 到本地
// （M10-T14 云同步）。应用重启后可直接携带 hkey 访问同步接口，
// 实现「重启免登录」；hkey 失效（401）时由调用方走重新登录流程并覆盖。
//
// @输入
// 无（读取）；SyncAuthInfo（保存）；endpoint: string（仅更新端点）
//
// @输出
// 保存同步凭证(auth): void
// 加载同步凭证(): SyncAuthInfo | null
// 保存同步端点(endpoint): void
// 清除同步凭证(): void
//
// @业务规则
// 安全红线：用户密码绝不落盘——本 store 只保存 hkey / endpoint / username，
// 登录请求中的密码仅在内存中短暂存在，登录成功后立即丢弃。
// 同步 API（getPreferencesSync/putSync/getSync/deleteSync）：
// 登录态读取在启动路径上需同步返回，避免 UI 闪烁；
// flush 为 fire-and-forget，写盘失败静默（与既有 store 策略一致）。
//
// @副作用
// 读写 preferences 的 jidecards_sync store。
//
// @注意
// preferences 中的字符串键（'jidecards_sync' / 'sync_hkey' /
// 'sync_endpoint' / 'sync_username' / 'abilityContext'）
// 属持久化协议字段，保留英文，不可中文化。
// ========================================================

import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { hilog } from '@kit.PerformanceAnalysisKit';

import { 解析生效同步端点 } from './同步流程';
import type { 自定义同步服务器决策信息 } from './同步流程';

const 存储名: string = 'jidecards_sync';
const HKEY键: string = 'sync_hkey';
const 端点键: string = 'sync_endpoint';
const 用户名键: string = 'sync_username';
const 上下文键: string = 'abilityContext';
// 媒体同步待完成标志：集合同步成功后置 true，媒体同步成功后置 false。
// 用于"集合同步完成但媒体同步被中断（删后台/进程被杀）"场景：再次同步时 syncStatus
// 只检查集合层面返回 NO_CHANGES，但媒体尚未同步完——此时凭此标志继续媒体阶段。
const 媒体待同步键: string = 'media_sync_pending';
// 媒体同步开关：对齐 Anki 桌面端 Preferences → Sync → "Sync media"。
// 默认 true（保持既有行为）。用户关闭后 syncCollection 传 syncMedia=false，
// rslib 不会挂起媒体同步任务，同步面板也不进媒体阶段。
const 媒体同步开关键: string = 'sync_media_enabled';

// ========================================================
// @块ID MODEL-SYNC-AUTH-002
// @名称 同步凭证信息
//
// @作用
// 描述一次成功登录后的 AnkiWeb 同步凭证。
//
// @输入
// 无（数据结构定义）
//
// @输出
// 字段：
// hkey - AnkiWeb 会话令牌（登录成功后后端下发）
// username - 登录用户名（仅用于 UI 展示，不参与鉴权）
// endpoint - 自定义同步端点；空串 = 官方 AnkiWeb 默认端点
//
// @副作用
// 无
// ========================================================
export interface 同步凭证信息 {
  /** AnkiWeb 会话令牌（登录成功后后端下发） */
  hkey: string;
  /** 登录用户名（仅用于 UI 展示，不参与鉴权） */
  username: string;
  /** 自定义同步端点；空串 = 官方 AnkiWeb 默认端点 */
  endpoint: string;
}

function 取上下文(): common.UIAbilityContext | null {
  const 上下文: common.UIAbilityContext | undefined =
    AppStorage.get<common.UIAbilityContext>(上下文键);
  return 上下文 === undefined ? null : 上下文;
}

/** 获取 preferences 实例；context 缺失或 API 异常时返回 null。 */
function 打开存储(): preferences.Preferences | null {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return null;
  }
  try {
    return preferences.getPreferencesSync(上下文, { name: 存储名 });
  } catch (错误) {
    return null;
  }
}

/** 异步落盘（fire-and-forget）：putSync/deleteSync 已更新内存缓存，flush 仅保证写盘。 */
function 静默落盘(存储: preferences.Preferences): void {
  存储.flush().then((): void => {
    // 写盘完成，无需处理
  }).catch((): void => {
    // 写盘失败静默：内存缓存已生效，极端情况下重启后回退到上次成功落盘的值
  });
}

function 读取字符串(存储: preferences.Preferences, 键: string): string {
  const 值: preferences.ValueType = 存储.getSync(键, '');
  return typeof 值 === 'string' ? 值 : '';
}

// ========================================================
// @块ID MODEL-SYNC-AUTH-003
// @名称 保存同步凭证
//
// @作用
// 保存登录成功后的同步凭证（三键一次落盘）。
//
// @输入
// auth: 同步凭证信息（endpoint 可为空串，表示官方默认端点）
//
// @输出
// void。失败时静默——内存缓存已更新。
//
// @副作用
// 同步写入 preferences 的 sync_hkey / sync_endpoint / sync_username，
// 并触发 fire-and-forget flush。
// ========================================================
export function 保存同步凭证(凭证: 同步凭证信息): void {
  const 存储: preferences.Preferences | null = 打开存储();
  if (存储 === null) {
    return;
  }
  try {
    存储.putSync(HKEY键, 凭证.hkey);
    存储.putSync(端点键, 凭证.endpoint);
    存储.putSync(用户名键, 凭证.username);
    静默落盘(存储);
  } catch (错误) {
    // 偏好不可用时仅丢失持久化，不阻塞登录流程。
  }
}

// ========================================================
// @块ID MODEL-SYNC-AUTH-004
// @名称 加载同步凭证
//
// @作用
// 读取本地同步凭证。
//
// @输入
// 无
//
// @输出
// SyncAuthInfo | null：hkey 为空串或不存在时返回 null
// （视为未登录，调用方走登录流程）。
//
// @副作用
// 只读 preferences，不写入。
// ========================================================
export function 加载同步凭证(): 同步凭证信息 | null {
  const 存储: preferences.Preferences | null = 打开存储();
  if (存储 === null) {
    return null;
  }
  try {
    const hkey: string = 读取字符串(存储, HKEY键);
    if (hkey.length === 0) {
      return null;
    }
    const 信息: 同步凭证信息 = {
      hkey: hkey,
      username: 读取字符串(存储, 用户名键),
      endpoint: 读取字符串(存储, 端点键)
    };
    return 信息;
  } catch (错误) {
    return null;
  }
}

// ========================================================
// @块ID MODEL-SYNC-AUTH-005
// @名称 保存同步端点
//
// @作用
// 仅更新 endpoint（服务端下发 new_endpoint 时调用），hkey/username 保持不变。
//
// @输入
// endpoint: string - 新同步端点
//
// @输出
// void
//
// @副作用
// 同步写入 preferences 的 sync_endpoint，并触发 fire-and-forget flush。
// ========================================================
export function 保存同步端点(端点: string): void {
  const 存储: preferences.Preferences | null = 打开存储();
  if (存储 === null) {
    return;
  }
  try {
    存储.putSync(端点键, 端点);
    静默落盘(存储);
  } catch (错误) {
    // 偏好不可用时仅丢失持久化。
  }
}

// ========================================================
// @块ID MODEL-SYNC-AUTH-006
// @名称 清除同步凭证
//
// @作用
// 注销时清空三键。
//
// @输入
// 无
//
// @输出
// void。失败时静默。
//
// @副作用
// 删除 preferences 中的 sync_hkey / sync_endpoint / sync_username，
// 并触发 fire-and-forget flush。
// ========================================================
export function 清除同步凭证(): void {
  const 存储: preferences.Preferences | null = 打开存储();
  if (存储 === null) {
    return;
  }
  try {
    存储.deleteSync(HKEY键);
    存储.deleteSync(端点键);
    存储.deleteSync(用户名键);
    存储.deleteSync(媒体待同步键);
    静默落盘(存储);
  } catch (错误) {
    // 偏好不可用时静默。
  }
}

// ========================================================
// @块ID MODEL-SYNC-AUTH-007
// @名称 媒体同步待完成标志
//
// @作用
// 记录"集合同步已成功，媒体同步尚未完成"的状态。
// 解决"集合同步成功 → 媒体同步被中断（删后台/进程被杀）→ 再次同步 syncStatus
// 返回 NO_CHANGES → 不进媒体阶段 → 媒体永远无法同步"的死锁。
//
// @输入
// 无（读取）；boolean（设置）
//
// @输出
// 设置媒体待同步(值): void
// 加载媒体待同步(): boolean
//
// @业务规则
// 集合同步成功（syncCollection done / fullUploadOrDownload done）后置 true。
// 媒体同步成功后置 false。
// 媒体同步中止/出错时不改变（保持 true，下次同步继续媒体阶段）。
// 注销时清除（随 清除同步凭证 一起清）。
//
// @副作用
// 读写 preferences 的 media_sync_pending 键。
// ========================================================

const 同步日志域: number = 0x4342;
const 同步日志标签: string = 'jidecards';

/** 设置媒体同步待完成标志。用 string '1'/'0' 存储（避免 boolean 序列化潜在问题）。 */
export function 设置媒体待同步(值: boolean): void {
  const 存储: preferences.Preferences | null = 打开存储();
  if (存储 === null) {
    hilog.error(同步日志域, 同步日志标签, 'media_sync_pending: 打开存储失败，无法写入');
    return;
  }
  try {
    存储.putSync(媒体待同步键, 值 ? '1' : '0');
    静默落盘(存储);
    hilog.info(同步日志域, 同步日志标签, 'media_sync_pending: 已写入 %{public}s', 值 ? '1' : '0');
  } catch (错误) {
    hilog.error(同步日志域, 同步日志标签, 'media_sync_pending: putSync 异常 %{public}s',
      错误 instanceof Error ? 错误.message : `${错误}`);
  }
}

/** 读取媒体同步待完成标志；偏好不可用或未设置时返回 false。 */
export function 加载媒体待同步(): boolean {
  const 存储: preferences.Preferences | null = 打开存储();
  if (存储 === null) {
    hilog.error(同步日志域, 同步日志标签, 'media_sync_pending: 打开存储失败，返回 false');
    return false;
  }
  try {
    const 值: preferences.ValueType = 存储.getSync(媒体待同步键, '0');
    const 结果: boolean = 值 === '1' || 值 === true;
    hilog.info(同步日志域, 同步日志标签,
      'media_sync_pending: 读取 raw=%{public}s result=%{public}s', `${值}`, 结果 ? 'true' : 'false');
    return 结果;
  } catch (错误) {
    hilog.error(同步日志域, 同步日志标签, 'media_sync_pending: getSync 异常 %{public}s',
      错误 instanceof Error ? 错误.message : `${错误}`);
    return false;
  }
}

// ========================================================
// @块ID MODEL-SYNC-AUTH-008
// @名称 媒体同步开关
//
// @作用
// 对齐 Anki 桌面端 Preferences → Sync → "Sync media"。
// 用户可关闭媒体同步（如 AnkiWeb 上有大量孤儿媒体文件不想下载）。
// 关闭后：syncCollection 传 syncMedia=false（rslib 不挂起媒体同步任务），
// 同步面板跳过媒体阶段直接显示完成。
//
// @输入
// 设置媒体同步开关(值): boolean
// 加载媒体同步开关(): boolean
//
// @输出
// 无（设置）；boolean（读取，默认 true 保持既有行为）
//
// @业务规则
// 默认 true（首次安装保持与历史版本一致）。
// 开关变化立即落盘，下次同步生效。
//
// @副作用
// 读写 preferences 的 sync_media_enabled 键（用 '1'/'0' string 存储）。
// ========================================================

/** 设置媒体同步开关。用 string '1'/'0' 存储（与 媒体待同步 一致）。 */
export function 设置媒体同步开关(值: boolean): void {
  const 存储: preferences.Preferences | null = 打开存储();
  if (存储 === null) {
    return;
  }
  try {
    存储.putSync(媒体同步开关键, 值 ? '1' : '0');
    静默落盘(存储);
  } catch (错误) {
    // 偏好不可用时仅丢失持久化。
  }
}

/** 读取媒体同步开关；偏好不可用或未设置时返回 true（保持既有行为）。 */
export function 加载媒体同步开关(): boolean {
  const 存储: preferences.Preferences | null = 打开存储();
  if (存储 === null) {
    return true;
  }
  try {
    const 值: preferences.ValueType = 存储.getSync(媒体同步开关键, '1');
    return 值 === '1' || 值 === true;
  } catch (错误) {
    return true;
  }
}

// ========================================================
// @块ID MODEL-SYNC-CUSTOM-001
// @名称 自定义同步服务器配置
//
// @作用
// 持久化用户设置的自定义同步服务器（对齐 AnkiDroid Custom Sync Server：
// syncBaseUrl + 启用开关 + customSyncCertificate 三件套）。
// 自建 ankisyncd 等兼容服务器的用户填写地址后，登录与同步都走该端点。
//
// @输入
// 无（读取）；自定义同步配置（保存）。
//
// @输出
// 加载自定义同步配置(): 自定义同步配置
// 保存自定义同步配置(配置): void
// 生效同步端点(): string
//
// @业务规则
// 保存自定义配置时同时清除 服务器下发端点（sync_endpoint）——
// 对齐 AnkiDroid CustomSyncServerSettingsFragment 的 preferenceChangeListener
// （改动 syncBaseUrl/开关 时 remove(CURRENT_SYNC_URI)）：
// 服务端迁移端点基于旧服务器，切换自定义服务器后必须重新解析。
// 端点优先级见 同步流程.解析生效同步端点：服务器下发端点 > 启用中的自定义地址 > 官方。
// 地址合法性由 UI 层用 同步流程.校验同步服务器地址 把关（空串 = 未设置）。
//
// @副作用
// 读写 preferences 的 jidecards_sync store
// （custom_sync_enabled / custom_sync_base_url / custom_sync_certificate）。
//
// @注意
// preferences 键（'custom_sync_enabled' / 'custom_sync_base_url' /
// 'custom_sync_certificate'）属持久化协议字段，保留英文，不可中文化。
// ========================================================

const 自定义开关键: string = 'custom_sync_enabled';
const 自定义地址键: string = 'custom_sync_base_url';
const 自定义证书键: string = 'custom_sync_certificate';

/** 自定义同步服务器配置（地址/证书为空串 = 未设置） */
export interface 自定义同步配置 {
  /** 是否启用自定义同步服务器 */
  启用: boolean;
  /** 同步服务器地址（http(s)://…）；空串 = 未填写 */
  地址: string;
  /** 自定义根证书 PEM 文本（自签名 HTTPS 服务器用）；空串 = 未设置 */
  证书: string;
}

/** 读取自定义同步服务器配置；偏好不可用时返回默认（未启用、空地址、空证书）。 */
export function 加载自定义同步配置(): 自定义同步配置 {
  const 存储: preferences.Preferences | null = 打开存储();
  const 默认配置: 自定义同步配置 = { 启用: false, 地址: '', 证书: '' };
  if (存储 === null) {
    return 默认配置;
  }
  try {
    const 启用值: preferences.ValueType = 存储.getSync(自定义开关键, '0');
    return {
      启用: 启用值 === '1' || 启用值 === true,
      地址: 读取字符串(存储, 自定义地址键),
      证书: 读取字符串(存储, 自定义证书键)
    };
  } catch (错误) {
    return 默认配置;
  }
}

/**
 * 保存自定义同步服务器配置；同时清除服务器下发端点（语义对齐 AnkiDroid：
 * 自定义服务器变化后旧的服务器迁移端点失效，下次登录/同步按新配置解析）。
 */
export function 保存自定义同步配置(配置: 自定义同步配置): void {
  const 存储: preferences.Preferences | null = 打开存储();
  if (存储 === null) {
    return;
  }
  try {
    存储.putSync(自定义开关键, 配置.启用 ? '1' : '0');
    存储.putSync(自定义地址键, 配置.地址);
    存储.putSync(自定义证书键, 配置.证书);
    存储.deleteSync(端点键);
    静默落盘(存储);
  } catch (错误) {
    // 偏好不可用时仅丢失持久化。
  }
}

/**
 * 解析当前生效的同步端点：服务器下发端点 > 启用中的自定义地址 > 空串（官方 AnkiWeb）。
 * 决策逻辑在 同步流程.解析生效同步端点（纯函数，可单测）；本函数负责取数。
 */
export function 生效同步端点(): string {
  const 凭证: 同步凭证信息 | null = 加载同步凭证();
  const 服务器下发端点: string = 凭证 === null ? '' : 凭证.endpoint;
  const 配置: 自定义同步配置 = 加载自定义同步配置();
  const 自定义: 自定义同步服务器决策信息 = { 启用: 配置.启用, 地址: 配置.地址 };
  return 解析生效同步端点(服务器下发端点, 自定义);
}
