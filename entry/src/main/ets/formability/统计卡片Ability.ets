// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID UI-FORM-ABILITY-001
// @名称 统计卡片 FormExtensionAbility
//
// @作用
// 桌面服务卡片生命周期管理。运行在独立进程（与主 App 进程隔离），
// 通过 preferences 读取主进程写入的统计数据，推送到卡片 UI。
//
// 生命周期：
// - onAddForm：用户添加卡片到桌面 → 返回初始数据
// - onUpdateForm：系统定时刷新（每 30 分钟）→ 读 preferences 推送最新数据
// - onRemoveForm：用户移除卡片 → 清理（当前无持久化 formId，空实现）
//
// @业务规则
// - 进程隔离：不能访问 AppStorage / 主进程内存，只能读 preferences 文件
// - 数据方向：主进程写 → 卡片进程读（单向）
// - 卡片 UI 渲染在桌面进程，本 Ability 只负责提供数据（FormBindingData）
// - 数据传递：整对象 JSON.stringify 后塞到单键 'statsCardData'，
//   卡片 UI 用 @LocalStorageProp('statsCardData') 接字符串后 JSON.parse
//   （HarmonyOS 卡片 LocalStorage 注入按字段平铺，不嵌套对象，
//   所以必须用单键字符串方式传递整对象）
//
// @副作用
// 读 preferences 的 'jidecards_widget_data' store
// 调 formProvider.updateForm 推送数据到卡片
// ========================================================

import { FormExtensionAbility, formBindingData, formProvider } from '@kit.FormKit';
import { Want, common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { 加载卡片数据, 保存formId带上下文, 桌面卡片数据, localizedWidgetLabels } from '../model/桌面卡片数据存储';

const 日志域: string = 'StatsFormAbility';
const 卡片绑定键: string = 'statsCardData';

// 卡片绑定数据载体：单键 'statsCardData' 承载整对象 JSON 字符串
// （ArkTS 不允许对象字面量无类型，需抽 interface）
interface 卡片绑定载体 {
  'statsCardData': string;
}

// 空态对象：仅含 hasData=false 标志，卡片 UI 显示"暂无数据"
interface 卡片空态标志 {
  hasData: boolean;
  localizedStrings: Record<string, string>;
}

/** @throws {Error} 首帧资源读取失败由平台生命周期报告，不返回缺少文字的成功快照。 */
function 构造空态JSON(context: common.Context): string {
  const 空态: 卡片空态标志 = { hasData: false, localizedStrings: localizedWidgetLabels(context) };
  return JSON.stringify(空态);
}

export default class 统计卡片Ability extends FormExtensionAbility {
  // ========================================================
  // @名称 onAddForm
  // @作用 用户添加卡片到桌面时同步返回初始数据，渲染首帧
  //       同时把 formId 写入 filesDir，供主进程主动推送
  // ========================================================
  /** @throws {Error} 首帧资源读取或绑定失败交给平台报告。 */
  onAddForm(want: Want): formBindingData.FormBindingData {
    hilog.info(0x0000, 日志域, 'onAddForm: 添加统计卡片');
    // 提取 formId 并保存（供主进程主动推送）
    const formId: string = want.parameters?.['oh.form.extra.formId'] as string ?? '';
    if (formId !== '') {
      保存formId带上下文(this.context, formId).catch((): void => {});
      // 异步触发一次数据推送（读到主进程已写入的数据立即填充首帧）
      this.推送卡片数据(formId).catch((): void => {});
    }
    // 同步返回空数据占位，异步更新实际数据
    const 空数据: 卡片绑定载体 = { 'statsCardData': 构造空态JSON(this.context) };
    return formBindingData.createFormBindingData(空数据);
  }

  // ========================================================
  // @名称 onUpdateForm
  // @作用 系统定时刷新（每 30 分钟）调此方法；读 filesDir 推送最新数据
  // ========================================================
  async onUpdateForm(formId: string): Promise<void> {
    hilog.info(0x0000, 日志域, `onUpdateForm: 刷新卡片 ${formId}`);
    await this.推送卡片数据(formId);
  }

  // ========================================================
  // @名称 onCastToNormalForm
  // @作用 临时卡片转正式卡片时刷新
  // ========================================================
  async onCastToNormalForm(formId: string): Promise<void> {
    hilog.info(0x0000, 日志域, `onCastToNormalForm: 临时转正式 ${formId}`);
    await this.推送卡片数据(formId);
  }

  // ========================================================
  // @名称 onFormEvent
  // @作用 卡片内事件（当前无卡片内交互按钮，空实现）
  // ========================================================
  onFormEvent(_formId: string, _message: string): void {
    // 无卡片内交互（点击卡片整体走 postCardAction router，不触发此回调）
  }

  // ========================================================
  // @名称 onRemoveForm
  // @作用 用户移除卡片，清理资源（当前无 formId 持久化，空实现）
  // ========================================================
  onRemoveForm(_formId: string): void {
    hilog.info(0x0000, 日志域, `onRemoveForm: 移除卡片 ${_formId}`);
  }

  // ========================================================
  // @名称 推送卡片数据
  // @作用 读 preferences → 构造 FormBindingData → formProvider.updateForm
  // ========================================================
  private async 推送卡片数据(formId: string): Promise<void> {
    try {
      const 数据: 桌面卡片数据 | null = await 加载卡片数据(this.context);
      if (数据 === null) {
        // 无数据：推送空态
        const 空态: 卡片绑定载体 = { 'statsCardData': 构造空态JSON(this.context) };
        await formProvider.updateForm(formId, formBindingData.createFormBindingData(空态));
        return;
      }
      // 有数据：整对象 JSON.stringify 塞到单键 'statsCardData'
      // 卡片 UI 用 @LocalStorageProp('statsCardData') 接字符串后 JSON.parse
      数据.localizedStrings = localizedWidgetLabels(this.context);
      const 绑定数据: 卡片绑定载体 = { 'statsCardData': JSON.stringify(数据) };
      await formProvider.updateForm(formId, formBindingData.createFormBindingData(绑定数据));
    } catch (错误) {
      hilog.error(0x0000, 日志域, `推送卡片数据失败: ${错误}`);
    }
  }
}
