// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID UTIL-THEME-CTRL
// @名称 主题控制器
//
// @作用
// 把 主题模式 + 系统深浅色 解析后应用到系统：
// - 设置应用资源色彩模式（setColorMode）
// - 同步状态栏 / 导航栏颜色与图标明暗
//
// @输入
// 上下文：common.UIAbilityContext
// 模式：主题模式（'light' / 'dark' / 'auto'）
// 系统深色：当前系统是否深色（auto 模式下据此决定）
//
// @输出
// Promise<void>；无返回值。
//
// @业务规则
// - auto 模式下颜色模式设为 NOT_SET，由系统决定；light/dark 显式设置。
// - 窗口尚未就绪或已销毁时不让主题同步中断页面（吞掉异常）。
// - 资源模式切换失败时仍尝试同步系统栏，保证视觉一致。
//
// @副作用
// 修改应用 ApplicationContext 的 ColorMode；修改 mainWindow 的系统栏属性。
//
// @注意
// 修改这里可能影响系统级深浅色切换与状态栏外观。
// ========================================================

import { common, ConfigurationConstant } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { resourceManager } from '@kit.LocalizationKit';
import { 解析是否深色, 主题模式 } from '../model/主题设置';
import { 颜色键 } from '../model/颜色主题';

const 浅色系统栏色: string = '#F5F7FA';
const 深色系统栏色: string = '#10151D';

/** @throws {Error} 读取失败或未指定颜色时上抛，调用方保留已知系统状态。 */
export function readSystemDarkMode(): boolean {
  // 应用资源和配置通知都会受 setColorMode 影响；系统资源管理器才是设备主题来源。
  const configuration: resourceManager.Configuration = resourceManager.getSysResourceManager().getConfigurationSync();
  if (configuration.colorMode === resourceManager.ColorMode.DARK) { return true; }
  if (configuration.colorMode === resourceManager.ColorMode.LIGHT) { return false; }
  throw new Error('system_theme_unavailable');
}

function 请求的色彩模式(模式: 主题模式): ConfigurationConstant.ColorMode {
  if (模式 === 'dark') {
    return ConfigurationConstant.ColorMode.COLOR_MODE_DARK;
  }
  if (模式 === 'light') {
    return ConfigurationConstant.ColorMode.COLOR_MODE_LIGHT;
  }
  return ConfigurationConstant.ColorMode.COLOR_MODE_NOT_SET;
}

export async function 应用系统栏样式(
  上下文: common.UIAbilityContext,
  是否深色: boolean
): Promise<void> {
  try {
    const 主窗口: window.Window = await window.getLastWindow(上下文);
    // 沉浸式全屏布局下，状态栏/导航栏背景设为透明，让应用内容（含弹层磨砂）透过显示。
    // 状态栏文字明暗根据深浅色模式设置，保证可读性。
    await 主窗口.setWindowSystemBarProperties({
      statusBarColor: '#00000000',
      navigationBarColor: '#00000000',
      isStatusBarLightIcon: 是否深色,
      isNavigationBarLightIcon: 是否深色
    });
  } catch (错误) {
    // 窗口尚未就绪或已销毁时，不让主题同步中断页面。
  }
}

/** @throws {Error} strict=true 时资源模式失败上抛；系统栏仍为尽力同步。 */
export async function 应用主题(
  上下文: common.UIAbilityContext,
  模式: 主题模式,
  系统深色: boolean,
  strict: boolean = false
): Promise<void> {
  try {
    上下文.getApplicationContext().setColorMode(请求的色彩模式(模式));
  } catch (错误) {
    if (strict) { throw new Error('theme_apply_failed'); }
    // 资源模式切换失败时仍尝试同步系统栏。
  }
  await 应用系统栏样式(上下文, 解析是否深色(模式, 系统深色));
}
