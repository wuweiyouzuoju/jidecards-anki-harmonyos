// SPDX-License-Identifier: AGPL-3.0-or-later
import { THEME_VISUALS_KEY, THEME_TEXT_COLORS_KEY, PAGE_SURFACE_KEY, themeDefinition } from '../model/ThemeCatalog';
import { GLASS_COLORS_KEY, GLASS_HIGHLIGHT_COLORS, GLASS_DARK_COLORS } from '../model/ThemeCatalog';
import { PRIMARY_GLASS_KEY, themePrimaryGlass } from '../model/ThemeCatalog';

// ========================================================
// @块ID UTIL-COLOR-THEME-MGR
// @名称 颜色主题管理器
//
// @作用
// 把当前 颜色主题 + 是否深色 解析为色板中的各 hex 字符串，
// 写入 AppStorage 中 颜色键 对应的键，供各组件 @StorageProp 绑定后自动重新渲染。
//
// @输入
// 主题：颜色主题枚举
// 是否深色：当前是否深色模式
//
// @输出
// 无返回值；将解析后的色板写入 AppStorage 的 颜色键 各键。
//
// @业务规则
// 调用时机：
// - 应用启动（Index.aboutToAppear）：加载持久化的 colorTheme 并 应用颜色主题
// - 用户在设置页切换颜色主题：切换颜色主题 → 保存颜色主题 + 应用颜色主题
// - 系统深浅色变化（EntryAbility.onConfigurationUpdate）：应用颜色主题(主题, 新是否深色)
// 初次调用前 AppStorage 中无这些键；setOrCreate 会创建，组件 @StorageProp 默认值兜底。
//
// @副作用
// 通过 AppStorage.setOrCreate 修改全局存储键，间接触发所有 @StorageProp 组件重渲染。
//
// @注意
// 选中背景 = primaryContainer，保留旧键名兼容既有组件。
// ========================================================

import { common } from '@kit.AbilityKit';
import { 颜色主题, 颜色键, 解析主题色板 } from '../model/颜色主题';
import { 应用系统栏样式 } from './主题控制器';

export function 应用颜色主题(主题: 颜色主题, 是否深色: boolean): void {
  const 色板 = 解析主题色板(主题, 是否深色);
  const visual = themeDefinition(主题);
  AppStorage.setOrCreate(THEME_VISUALS_KEY, visual);
  AppStorage.setOrCreate(PRIMARY_GLASS_KEY, themePrimaryGlass(visual, 是否深色));
  AppStorage.setOrCreate<string[]>(THEME_TEXT_COLORS_KEY, 是否深色 ? visual.darkActionColors : visual.lightActionColors);
  AppStorage.setOrCreate<string[]>(GLASS_COLORS_KEY, 是否深色 ? GLASS_DARK_COLORS : GLASS_HIGHLIGHT_COLORS);
  AppStorage.setOrCreate<string>(PAGE_SURFACE_KEY, visual.backgroundTextures.length > 0 ? '#00000000' : 色板.页面底色微染);
  // 主色系（8 个）
  AppStorage.setOrCreate<string>(颜色键.动作主色, 色板.动作主色);
  AppStorage.setOrCreate<string>(颜色键.动作主色悬停, 色板.动作主色悬停);
  AppStorage.setOrCreate<string>(颜色键.动作主色按下, 色板.动作主色按下);
  AppStorage.setOrCreate<string>(颜色键.主色按钮背景, 色板.主色按钮背景);
  AppStorage.setOrCreate<string>(颜色键.主色按钮按下, 色板.主色按钮按下);
  AppStorage.setOrCreate<string>(颜色键.主色容器, 色板.主色容器);
  AppStorage.setOrCreate<string>(颜色键.主色容器悬停, 色板.主色容器悬停);
  AppStorage.setOrCreate<string>(颜色键.主色边框, 色板.主色边框);
  AppStorage.setOrCreate<string>(颜色键.主色图标, 色板.主色图标);
  AppStorage.setOrCreate<string>(颜色键.主色文字, 色板.主色文字);
  // 选中背景（= primaryContainer，保留旧键名兼容既有组件）
  AppStorage.setOrCreate<string>(颜色键.选中背景, 色板.选中背景);
  // 计数色
  AppStorage.setOrCreate<string>(颜色键.新卡计数色, 色板.新卡计数色);
  AppStorage.setOrCreate<string>(颜色键.学习中计数色, 色板.学习中计数色);
  AppStorage.setOrCreate<string>(颜色键.复习中计数色, 色板.复习中计数色);
  // 热力图 4 档
  AppStorage.setOrCreate<string>(颜色键.热力1, 色板.热力1);
  AppStorage.setOrCreate<string>(颜色键.热力2, 色板.热力2);
  AppStorage.setOrCreate<string>(颜色键.热力3, 色板.热力3);
  AppStorage.setOrCreate<string>(颜色键.热力4, 色板.热力4);
  // 页面背景极淡主题色
  AppStorage.setOrCreate<string>(颜色键.页面底色微染, 色板.页面底色微染);
  // 同步系统栏与界面同色：状态栏/导航栏使用刚写入的页面底色微染。
  // 早期初始化（abilityContext 尚未写入 AppStorage）时跳过，由 EntryAbility.onWindowStageCreate 兜底。
  const 上下文: common.UIAbilityContext | undefined =
    AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (上下文 !== undefined) {
    应用系统栏样式(上下文, 是否深色);
  }
}
