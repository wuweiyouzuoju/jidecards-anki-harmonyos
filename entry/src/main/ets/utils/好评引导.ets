// SPDX-License-Identifier: AGPL-3.0-or-later
import { showToastSafely } from './UiFeedback';

// ========================================================
// @名称 应用内好评入口（commentManager + DeepLink 降级）
//
// @作用
// 优先调 commentManager.showCommentDialog（@kit.AppGalleryKit）弹出系统好评弹窗；
// 失败回退 DeepLink store://appgallery.huawei.com/app/detail?id=<包名> 拉起华为应用市场
// 本应用详情页。
//
// 抽到 utils 的原因：
// 1. 设置面板「关于 → 给我好评」入口需要拉起应用市场详情页；
// 2. 学习完成回到主页的好评引导弹窗也需要拉起应用市场详情页；
// 3. 两处调用逻辑完全一致，抽独立函数避免代码重复。
//
// @输入
// 上下文: common.UIAbilityContext — 调用方传入的能力上下文
// 包名: string — 本应用 bundleName，用于拼接 DeepLink
//
// @输出
// 无返回值；调 startAbility 拉起应用市场详情页，失败时弹 toast。
//
// @业务规则
// - DeepLink 拉起失败 → toast 提示用户。
//
// @副作用
// 调系统 startAbility 拉起华为应用市场；失败时通过 window.getLastWindow 弹 toast。
//
// @注意
// hilog / BusinessError / Want / window 属系统 API 与类型，保留英文标识。
// ========================================================

import { common, Want } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { window } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { commentManager } from '@kit.AppGalleryKit';

const 日志域: number = 0x0001;
const 日志标签: string = '好评引导';

// ========================================================
// @名称 打开应用内好评
//
// @作用
// 优先调 commentManager.showCommentDialog 弹系统好评弹窗；失败回退 DeepLink 跳应用市场详情页。
//
// @输入
// 上下文: common.UIAbilityContext
// 包名: string — 本应用 bundleName
//
// @输出
// 无返回值；调 commentManager.showCommentDialog，失败时调 跳转应用市场详情页。
//
// @副作用
// 调 commentManager.showCommentDialog（系统弹窗）；失败时调 跳转应用市场详情页（startAbility）。
// ========================================================
export function 打开应用内好评(上下文: common.UIAbilityContext, 包名: string): void {
  try {
    commentManager.showCommentDialog(上下文).then(() => {
      hilog.info(日志域, 日志标签, 'showCommentDialog 成功');
    }).catch((错误: BusinessError) => {
      hilog.error(日志域, 日志标签, `showCommentDialog 失败 code=${错误.code} msg=${错误.message}`);
      跳转应用市场详情页(上下文, 包名);
    });
  } catch (错误) {
    hilog.error(日志域, 日志标签, `showCommentDialog 同步异常: ${错误}`);
    跳转应用市场详情页(上下文, 包名);
  }
}

// ========================================================
// @名称 跳转应用市场详情页
//
// @作用
// 应用内评分弹窗失败时的回退路径：用 DeepLink store://appgallery.huawei.com/app/detail?id=<包名>
// 拉起华为应用市场本应用详情页，用户可在详情页内查看评分并写评论。
// DeepLink 拉起失败时 toast 提示用户。
//
// @输入
// 上下文: common.UIAbilityContext
// 包名: string — 本应用 bundleName
//
// @输出
// 调系统 startAbility 拉起应用市场详情页；失败时弹 toast。
//
// @副作用
// 调系统 startAbility（拉起华为应用市场）；失败时通过 window.getLastWindow 获取 UIContext 弹 toast。
//
// @注意
// 不再用 promptAction.showDialog 弹中间确认窗：实测该 API 在本设备 Promise 静默挂起
// （既不 resolve 也不 reject），导致 UI 无反馈；直接跳 DeepLink 更可靠。
// ========================================================
export function 跳转应用市场详情页(上下文: common.UIAbilityContext, 包名: string): void {
  hilog.info(日志域, 日志标签, `回退 DeepLink 跳应用市场详情页，包名=${包名}`);
  const want: Want = {
    uri: `store://appgallery.huawei.com/app/detail?id=${包名}`
  };
  上下文.startAbility(want).then(() => {
    hilog.info(日志域, 日志标签, '回退 DeepLink 拉起应用市场成功');
  }).catch((错误: BusinessError) => {
    hilog.error(日志域, 日志标签, `回退 DeepLink 失败 code=${错误.code} msg=${错误.message}`);
    显示Toast(上下文, $r('app.string.about_rate_failed_fallback'));
  });
}

// ========================================================
// @名称 显示Toast
//
// @作用
// 通过 window.getLastWindow 获取 UIContext 显示 toast；失败静默。
// utils 函数无组件实例，不能用 this.getUIContext()，需走 window API。
//
// @输入
// 上下文: common.UIAbilityContext
// 文案: Resource — toast 文案资源
//
// @输出
// 无
//
// @副作用
// 调 window.getLastWindow + UIContext.getPromptAction().showToast。
// ========================================================
async function 显示Toast(上下文: common.UIAbilityContext, 文案: Resource): Promise<void> {
  try {
    const 主窗口: window.Window = await window.getLastWindow(上下文);
    showToastSafely(主窗口.getUIContext(), {
      message: 文案,
      duration: 3000
    });
  } catch (错误) {
    // 窗口尚未就绪或已销毁时，toast 失败静默；DeepLink 已尝试拉起，不阻断主流程。
  }
}
