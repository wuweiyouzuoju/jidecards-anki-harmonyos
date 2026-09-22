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
import { normalizeSyncServer } from './SyncSettings';

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
const CUSTOM_SERVER_KEY: string = 'custom_sync_server';
const AUTO_SYNC_KEY: string = 'auto_sync_enabled';

/** 用户配置独立于服务器重定向，注销后仍可用同一地址重新登录。 */
/** @throws {Error} 同步端点读取失败，调用方必须停止连接，不能回退到其他服务器。 */
export function loadCustomSyncServer(): string {
  const store: preferences.Preferences | null = 打开存储();
  if (store === null) throw new Error('Sync preferences unavailable');
  return 读取字符串(store, CUSTOM_SERVER_KEY);
}

/**
 * 保存基础地址并撤销旧服务器会话；写盘失败恢复内存缓存并上抛给设置页。
 * Invariants: 新服务器不得收到旧服务器 hkey；不保存密码。
 */
/** @throws {Error} 同步偏好读写失败，调用方不得更新已保存状态。 */
export async function saveCustomSyncServer(input: string): Promise<string> {
  const endpoint: string = normalizeSyncServer(input);
  const store: preferences.Preferences | null = 打开存储();
  if (store === null) throw new Error('Sync preferences unavailable');
  const previous: string = 读取字符串(store, CUSTOM_SERVER_KEY);
  if (endpoint === previous) return endpoint;
  const keys: string[] = [CUSTOM_SERVER_KEY, HKEY键, 端点键, 用户名键, 媒体待同步键];
  const values: string[] = keys.map((key: string): string => 读取字符串(store, key));
  try {
    store.putSync(CUSTOM_SERVER_KEY, endpoint);
    store.deleteSync(HKEY键);
    store.deleteSync(端点键);
    store.deleteSync(用户名键);
    store.deleteSync(媒体待同步键);
    await store.flush();
  } catch (error) {
    for (let index: number = 0; index < keys.length; index++) store.putSync(keys[index], values[index]);
    throw error instanceof Error ? error : new Error('Could not save sync server');
  }
  return endpoint;
}

/** 自动同步默认开启，保留用户明确保存的关闭选择。 */
export function loadAutoSyncEnabled(): boolean {
  const store: preferences.Preferences | null = 打开存储();
  try {
    return store === null || store.getSync(AUTO_SYNC_KEY, true) === true;
  } catch (error) {
    hilog.warn(0x4342, 'jidecards', 'Automatic sync preference unavailable; keep sync disabled');
    return false;
  }
}

/** 等待开关落盘，失败时 UI 保留原值。 */
/** @throws {Error} 同步偏好读写失败，调用方不得更新已保存状态。 */
export async function saveAutoSyncEnabled(enabled: boolean): Promise<void> {
  const store: preferences.Preferences | null = 打开存储();
  if (store === null) throw new Error('Sync preferences unavailable');
  const previous: boolean = store.getSync(AUTO_SYNC_KEY, true) === true;
  try {
    store.putSync(AUTO_SYNC_KEY, enabled);
    await store.flush();
  } catch (error) {
    store.putSync(AUTO_SYNC_KEY, previous);
    throw error instanceof Error ? error : new Error('Could not save automatic sync setting');
  }
}

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

/** @throws {Error} 同步偏好读写失败，调用方不得更新已保存状态。 */
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
