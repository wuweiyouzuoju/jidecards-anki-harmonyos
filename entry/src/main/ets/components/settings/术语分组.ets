// SPDX-License-Identifier: AGPL-3.0-or-later
import { resourceText } from '../../utils/UiFeedback';

import { 设置面板色板_取, 设置面板色板 } from '../../utils/设置面板配色';
import { 设置分组卡片 } from './设置分组卡片';

// ========================================================
// @块ID UI-GLOSSARY-001
// @名称 术语表分组
//
// @作用
// 列出复习页常见操作术语（埋藏/暂停/删除/撤销/评分按钮等），
// 每项点击 ⓘ 弹 FieldHelpPanel 显示详细说明。
// 与 Anki 桌面端 More 菜单的语义保持一致；入口仅在设置页提供，
// 复习页本身的按钮文字不内嵌长说明，避免打断学习节奏。
//
// 条目顺序按相关性分组：
//   基础操作（埋藏/暂停/同级卡/删除/撤销/评分）
//   → 评分相关（遗忘/难卡/毕业间隔）
//   → 算法相关（FSRS 目标保持率/随机抖动）
//
// @输入
// 是否深色：当前是否深色模式（影响色板取值）。
// 打开说明回调：父组件注入；打开说明回调 上抛 标题 + 正文 Resource。
//
// @输出
// 渲染术语表分组卡片；用户点击 ⓘ 时上抛 打开说明回调。
//
// @副作用
// 无。
// ========================================================
@Component
export struct 术语分组 {
  @Prop 是否深色: boolean = false;
  // ⓘ 按钮上抛：由父组件 SettingsPanel 统一渲染 FieldHelpPanel 浮层，避免嵌在分组卡片内
  打开说明回调: (标题: Resource, 正文: Resource) => void = (_标题: Resource, _正文: Resource): void => {};
  // B12-Y5 2026-07-29 修复 Bug 1：术语分组没有任何 @StorageLink 颜色键，
  // 主题切换时只靠 @Prop 是否深色 传播，若传播滞后则用旧色板（文字偏暗）。
  // @StorageProp('themeMode') 让主题模式切换直接触发重 build，色板由 解析同步是否深色 同步读取。
  @StorageProp('themeMode') private 主题模式监听: string = 'system';

  /** 术语条目：标签资源 用于行内显示，帮助标题资源 / 帮助正文资源 用于弹层。 */
  private readonly 条目列表: 术语条目[] = [
    {
      标签资源: $r('app.string.glossary_bury_label'),
      帮助标题资源: $r('app.string.glossary_bury_label'),
      帮助正文资源: $r('app.string.glossary_bury_help')
    },
    {
      标签资源: $r('app.string.glossary_suspend_label'),
      帮助标题资源: $r('app.string.glossary_suspend_label'),
      帮助正文资源: $r('app.string.glossary_suspend_help')
    },
    {
      标签资源: $r('app.string.glossary_siblings_label'),
      帮助标题资源: $r('app.string.glossary_siblings_label'),
      帮助正文资源: $r('app.string.glossary_siblings_help')
    },
    {
      标签资源: $r('app.string.glossary_delete_label'),
      帮助标题资源: $r('app.string.glossary_delete_label'),
      帮助正文资源: $r('app.string.glossary_delete_help')
    },
    {
      标签资源: $r('app.string.glossary_undo_label'),
      帮助标题资源: $r('app.string.glossary_undo_label'),
      帮助正文资源: $r('app.string.glossary_undo_help')
    },
    {
      标签资源: $r('app.string.glossary_ratings_label'),
      帮助标题资源: $r('app.string.glossary_ratings_label'),
      帮助正文资源: $r('app.string.glossary_ratings_help')
    },
    {
      标签资源: $r('app.string.glossary_lapse_label'),
      帮助标题资源: $r('app.string.glossary_lapse_label'),
      帮助正文资源: $r('app.string.glossary_lapse_help')
    },
    {
      标签资源: $r('app.string.glossary_leech_label'),
      帮助标题资源: $r('app.string.glossary_leech_label'),
      帮助正文资源: $r('app.string.glossary_leech_help')
    },
    {
      标签资源: $r('app.string.glossary_graduating_interval_label'),
      帮助标题资源: $r('app.string.glossary_graduating_interval_label'),
      帮助正文资源: $r('app.string.glossary_graduating_interval_help')
    },
    {
      标签资源: $r('app.string.glossary_fsrs_retention_label'),
      帮助标题资源: $r('app.string.glossary_fsrs_retention_label'),
      帮助正文资源: $r('app.string.glossary_fsrs_retention_help')
    },
    {
      标签资源: $r('app.string.glossary_fuzz_label'),
      帮助标题资源: $r('app.string.glossary_fuzz_label'),
      帮助正文资源: $r('app.string.glossary_fuzz_help')
    },
    {
      标签资源: $r('app.string.glossary_shortcuts_label'),
      帮助标题资源: $r('app.string.glossary_shortcuts_label'),
      帮助正文资源: $r('app.string.glossary_shortcuts_help')
    },
    // 浏览页新功能（T6/T8/T9/T11）集中查阅入口，正文复用浏览页 ⓘ 帮助文案
    {
      标签资源: $r('app.string.browser_action_sidebar'),
      帮助标题资源: $r('app.string.browser_help_sidebar_title'),
      帮助正文资源: $r('app.string.browser_help_sidebar_body')
    },
    {
      标签资源: $r('app.string.browser_action_find_replace'),
      帮助标题资源: $r('app.string.browser_help_find_replace_title'),
      帮助正文资源: $r('app.string.browser_help_find_replace_body')
    },
    {
      标签资源: $r('app.string.browser_help_batch_title'),
      帮助标题资源: $r('app.string.browser_help_batch_title'),
      帮助正文资源: $r('app.string.browser_help_batch_body')
    },
    {
      标签资源: $r('app.string.glossary_browser_info_label'),
      帮助标题资源: $r('app.string.glossary_browser_info_label'),
      帮助正文资源: $r('app.string.glossary_browser_info_help')
    }
  ];

  private 取本地化文本(资源: Resource): string {
    return resourceText(this.getUIContext(), 资源);
  }

  // ========================================================
  // @块ID UI-GLOSSARY-002
  // @名称 单条术语行
  //
  // @作用
  // 渲染单条术语行：名称 + ⓘ 按钮，点击 ⓘ 上抛 打开说明回调 显示该术语的详细说明。
  //
  // @输入
  // 色板：当前色板。
  // 条目：术语条目数据（含 标签资源 / 帮助标题资源 / 帮助正文资源）。
  //
  // @输出
  // 渲染单行；点击 ⓘ 时上抛 打开说明回调。
  //
  // @副作用
  // 无。
  // ========================================================
  @Builder
  private 术语行(色板: 设置面板色板, 条目: 术语条目) {
    Row() {
      Text(条目.标签资源)
        .fontSize(15)
        .fontColor(色板.主文字)
        .layoutWeight(1)
      Button($r('app.string.field_help_button'))
        .type(ButtonType.Normal)
        .backgroundColor(Color.Transparent)
        .fontSize(14)
        .fontColor(色板.三级文字)
        .width(28)
        .height(28)
        .padding(0)
        .onClick(() => {
          this.打开说明回调(条目.帮助标题资源, 条目.帮助正文资源);
        })
    }
    .width('100%')
    .height(44)
  }

  build() {
    设置分组卡片({
      标题: $r('app.string.settings_glossary'),
      是否深色: this.是否深色
    }) {
      Column() {
        ForEach(this.条目列表, (条目: 术语条目) => {
          this.术语行(设置面板色板_取(this.是否深色), 条目)
        }, (条目: 术语条目): string => this.取本地化文本(条目.标签资源))
      }
      .width('100%')
    }
  }
}

/** 术语条目数据结构：标签资源 用于行内显示，帮助标题资源 / 帮助正文资源 用于弹层。 */
interface 术语条目 {
  标签资源: Resource;
  帮助标题资源: Resource;
  帮助正文资源: Resource;
}
