// SPDX-License-Identifier: AGPL-3.0-or-later

import { reminderAgentManager } from '@kit.BackgroundTasksKit';
import { notificationManager } from '@kit.NotificationKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { 加载学习提醒设置, 保存提醒ID列表, 是否已引导通知设置, 标记已引导通知设置, 提醒项 } from './学习提醒存储';
import { 牌组服务 } from '../backend/牌组服务';
import { 后端会话 } from '../backend/后端会话';
import { common } from '@kit.AbilityKit';
import type { DeckTreeNode } from '../proto/messages/DeckMessages';

// ========================================================
// @名称 错误描述
// @作用 BusinessError 直接模板字符串化会变成 "object"/"[object Object]"，提取 code+message 便于定位
// ========================================================
function 错误描述(错误: Object): string {
  const e: BusinessError = 错误 as BusinessError;
  if (typeof e.code === 'number') {
    // 诊断日志：输出真实错误码到 hilog，便于定位 publishReminder 失败的根因
    console.error(`[reminder] code=${e.code} msg=${e.message}`);
    // 1700002：代理提醒数量超限——AGC 权益审批通过后华为云侧需 1-2 个自然日同步，
    // 同步完成前 publishReminder 固定报此错（配额为 0），不是用户可修复的问题
    if (e.code === 1700002) {
      return '华为云权益尚未生效（开放能力审批通过后需 1-2 个自然日同步），请稍后再试';
    }
    return `code ${e.code}：${e.message}`;
  }
  return `${错误}`;
}

const 包名: string = 'com.jide.kapian';
const 能力名: string = 'EntryAbility';
const 默认标题: string = 'jidecards 学习提醒';
const 默认内容模板: string = '今日待学习 {{待学}} 张，待复习 {{待复习}} 张';

// ========================================================
// @名称 计算待学数量
// @作用 拉取牌组树，汇总 newCount + learnCount（待学）和 reviewCount（待复习）
// ========================================================
async function 计算待学数量(): Promise<[number, number]> {
  try {
    const 上下文: common.UIAbilityContext | undefined =
      AppStorage.get<common.UIAbilityContext>('abilityContext');
    if (上下文 === undefined) {
      return [0, 0];
    }
    await 后端会话.获取实例().确保已打开(上下文.filesDir);
    const 服务: 牌组服务 = new 牌组服务();
    const 树: DeckTreeNode = await 服务.获取牌组树();
    let 待学: number = 0;
    let 待复习: number = 0;
    for (let i: number = 0; i < 树.children.length; i++) {
      const 节点 = 树.children[i];
      待学 += 节点.newCount + 节点.learnCount;
      待复习 += 节点.reviewCount;
    }
    return [待学, 待复习];
  } catch (错误) {
    return [0, 0];
  }
}

// ========================================================
// @名称 替换占位符
// @作用 把 {{待学}} {{待复习}}（中文）或 {{new}} {{review}}（英文）替换成实际数字；
//       无占位符的文案原样返回。双占位符兼容旧用户已存中文文案与新英文 UI。
// ========================================================
function 替换占位符(模板: string, 待学数: number, 待复习数: number): string {
  return 模板
    .replace(/{{待学}}|{{new}}/g, `${待学数}`)
    .replace(/{{待复习}}|{{review}}/g, `${待复习数}`);
}

// ========================================================
// @名称 发布单个提醒
// @作用 发布一个每日固定时间的闹钟型提醒，标题/内容用用户自定义或默认
// ========================================================
/** @throws {Error} 系统提醒发布或取消失败，调用方必须显示失败或记录后台刷新错误。 */
async function 发布单个提醒(
  项: 提醒项,
  待学数: number,
  待复习数: number
): Promise<number> {
  const 标题: string = 项.标题.length > 0 ? 项.标题 : 默认标题;
  const 内容模板: string = 项.内容.length > 0 ? 项.内容 : 默认内容模板;
  const 内容: string = 替换占位符(内容模板, 待学数, 待复习数);
  const 提醒请求: reminderAgentManager.ReminderRequestAlarm = {
    reminderType: reminderAgentManager.ReminderType.REMINDER_TYPE_ALARM,
    hour: 项.小时,
    minute: 项.分钟,
    title: 标题,
    content: 内容,
    // 服务提醒渠道：横幅/锁屏/铃声默认具备资格（用户开横幅开关后生效）
    slotType: notificationManager.SlotType.SERVICE_INFORMATION,
    // 不配 actionButton：SDK 按钮只有 CLOSE/SNOOZE 两种类型，没有"打开应用"型；
    // 之前配的「打开」按钮实际是 CLOSE（点了只关通知不进 app），误导用户。
    // 打开应用的正确路径 = 点通知本体（下方 wantAgent 拉起 EntryAbility）。
    wantAgent: {
      pkgName: 包名,
      abilityName: 能力名
    },
    maxScreenWantAgent: {
      pkgName: 包名,
      abilityName: 能力名
    }
  };
  return await reminderAgentManager.publishReminder(提醒请求);
}

// ========================================================
// @名称 取消所有已发布提醒
// ========================================================
/** @throws {Error} 系统提醒发布或取消失败，调用方必须显示失败或记录后台刷新错误。 */
export async function 取消所有学习提醒(): Promise<void> {
  await reminderAgentManager.cancelAllReminders();
}

// ========================================================
// @名称 首次引导通知设置
// @作用 首次成功保存提醒后拉起系统通知设置页，引导用户开启「横幅通知」
//       （系统默认横幅关闭且应用无法代开，只能引导手动开启）。
//       用 preferences 标记只引导一次；失败静默不影响保存主流程。
// @使用时机 新建提醒弹层确认后 / 编辑页保存成功后（提醒开启时）
// ========================================================
export async function 首次引导通知设置(): Promise<void> {
  try {
    if (await 是否已引导通知设置()) {
      return;
    }
    const 上下文: common.UIAbilityContext | undefined =
      AppStorage.get<common.UIAbilityContext>('abilityContext');
    if (上下文 === undefined) {
      return;
    }
    await 标记已引导通知设置();
    await notificationManager.openNotificationSettings(上下文);
  } catch (错误) {
    console.error(`[reminder] 引导通知设置失败：${错误描述(错误)}`);
  }
}

// ========================================================
// @名称 确保通知授权
// @作用 代理提醒发布前应用通知开关必须已开启（否则 publishReminder 静默失败，到点不弹）。
//       未授权时弹系统授权框；用户拒绝过两次后系统不再弹窗，直接返回 reject。
// ========================================================
async function 确保通知授权(): Promise<void> {
  const 上下文: common.UIAbilityContext | undefined =
    AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (上下文 === undefined) {
    return;
  }
  try {
    // 先查当前授权状态：已授权时直接放行，避免多余的系统弹窗
    const 已启用: boolean = await notificationManager.isNotificationEnabled();
    if (已启用) {
      return;
    }
    // 未授权则弹系统授权框（后台调用无法弹框，请求会被拒绝/忽略）
    await notificationManager.requestEnableNotification(上下文);
    const 请求后已启用: boolean = await notificationManager.isNotificationEnabled();
    if (!请求后已启用) {
      throw new Error('通知权限未开启：请到 系统设置 → 通知 → 记得闪卡 开启通知');
    }
  } catch (错误) {
    if (错误 instanceof Error && 错误.message.startsWith('通知权限未开启')) {
      throw 错误;
    }
    throw new Error(`请求通知权限失败：${错误描述(错误)}`);
  }
}

// ========================================================
// @名称 注册提醒通知渠道
// @作用 把代理提醒的通知指定为「服务提醒」渠道（SERVICE_INFORMATION）：
//       该渠道横幅/锁屏/铃声默认开启；不注册时走默认渠道，横幅关闭，
//       到点通知只能下拉通知栏看到。渠道已存在时重复注册无害；
//       注册失败仅降级展示样式，不阻塞提醒发布。
// ========================================================
async function 注册提醒通知渠道(): Promise<void> {
  try {
    const 渠道: notificationManager.NotificationSlot = {
      notificationType: notificationManager.SlotType.SERVICE_INFORMATION
    };
    await reminderAgentManager.addNotificationSlot(渠道);
  } catch (错误) {
    console.error(`[reminder] addNotificationSlot 失败：${错误描述(错误)}`);
  }
}

// ========================================================
// @名称 刷新学习提醒
// @作用 读取持久化设置，取消旧提醒 + 发布新提醒（带最新待学数量）
// @使用时机 App 启动 / 复习后 / 设置变更
// ========================================================
/** @throws {Error} 系统提醒发布或取消失败，调用方必须显示失败或记录后台刷新错误。 */
export async function 刷新学习提醒(): Promise<void> {
  const 设置 = await 加载学习提醒设置();
  // 先取消所有旧提醒
  await 取消所有学习提醒();
  // 计算当前待学数量（仅在有开启的提醒项时才查）
  let 任一开启: boolean = false;
  for (let i: number = 0; i < 设置.提醒项列表.length; i++) {
    if (设置.提醒项列表[i].开启) {
      任一开启 = true;
      break;
    }
  }
  if (!任一开启) {
    return;
  }
  // 发布前确保通知已授权；未授权时抛错（编辑页会显示），不再静默失败到点不弹
  await 确保通知授权();
  // 注册服务提醒渠道，让到点通知默认走横幅/锁屏/铃声（而非仅下拉可见）
  await 注册提醒通知渠道();
  const 数量: [number, number] = await 计算待学数量();
  // 为每个开启的提醒项发布一个提醒
  const 新ID列表: number[] = [];
  let 首个失败原因: string = '';
  for (let i: number = 0; i < 设置.提醒项列表.length; i++) {
    if (!设置.提醒项列表[i].开启) {
      continue;
    }
    try {
      const id: number = await 发布单个提醒(设置.提醒项列表[i], 数量[0], 数量[1]);
      新ID列表.push(id);
    } catch (错误) {
      // 单个发布失败不阻塞其他，但记录首个原因；全部失败时上抛让 UI 显示
      if (首个失败原因 === '') {
        首个失败原因 = 错误描述(错误);
      }
    }
  }
  await 保存提醒ID列表(新ID列表);
  if (新ID列表.length === 0 && 首个失败原因 !== '') {
    throw new Error(`提醒发布失败：${首个失败原因}`);
  }
}
