// SPDX-License-Identifier: AGPL-3.0-or-later
import { SelectStyle } from '../../utils/SelectStyle';

import { 主题模式 } from '../../model/主题设置';
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 设置分组卡片 } from './设置分组卡片';
import { UNLOCKED_CONTENTS_KEY, availableThemes, themeDefinition } from '../../model/ThemeCatalog';
import { ThemeMotionControl } from './ThemeMotionControl';
import { CardTextSizeControl } from './CardTextSizeControl';
import {
  颜色主题,
  颜色主题渐变档
} from '../../model/颜色主题';

// ========================================================
// @块ID UI-APPEARANCE-001
// @名称 外观分组
//
// @作用
// 提供主题、颜色、动态背景和卡片字号设置。语言位于 GeneralSettings。
// 2026-07-28：对齐添加笔记页 settingSelectRow 形态——每行单 Select 下拉，替代原 chip 展开模式。
//
// @输入
// 是否深色：当前是否深色模式（影响色板取值）。
// 当前主题模式：system / light / dark 之一。
// 当前颜色主题：aurora / forest / midnight / lagoon / sunset / lemon / minimal_gray 之一。
// 主题模式切换回调 / 颜色主题切换回调：父组件注入。
//
// @输出
// 渲染外观分组卡片；用户切换 Select 时触发对应回调。
//
// @副作用
// 颜色主题切换由父组件回调负责持久化（本组件不直接写）。
// ========================================================
@Component
export struct 外观分组 {
  @StorageProp(UNLOCKED_CONTENTS_KEY) private unlockedContents: string[] = [];
  @Prop 是否深色: boolean = false;
  @Prop 简洁模式: boolean = true;
  @Prop 当前主题模式: 主题模式 = 'system';
  @Prop 当前颜色主题: 颜色主题 = 'aurora';
  // B12-Y5 2026-07-29 修复 Bug 1（深色模式下分组头部文字亮度不一致）：
  // 子组件只靠 @Prop 是否深色 传播响应主题切换，但 @Prop 传播可能滞后于主壳 @StorageLink 重 build，
  // 导致子组件在一帧内仍用旧色板。加 @StorageProp('themeMode') 让主题切换直接触发子组件重 build，
  // 设置面板色板_取 内部 解析同步是否深色 会读到 AppStorage 新值返回正确色板。
  @StorageProp('themeMode') private 主题模式监听: string = 'system';
  主题模式切换回调: (模式: 主题模式) => void = (模式: 主题模式): void => {};
  颜色主题切换回调: (主题: 颜色主题) => void = (主题: 颜色主题): void => {};

  private 取本地化文本(资源: Resource): string {
    return this.getUIContext().getHostContext()!.resourceManager.getStringSync(资源.id);
  }

  private 主题模式标签(模式: 主题模式): string {
    if (模式 === 'light') {
      return this.取本地化文本($r('app.string.theme_light'));
    }
    if (模式 === 'dark') {
      return this.取本地化文本($r('app.string.theme_dark'));
    }
    return this.取本地化文本($r('app.string.theme_system'));
  }

  private 颜色主题展示名文本(主题: 颜色主题): string {
    return this.getUIContext().getHostContext()!.resourceManager.getStringByNameSync('theme_color_' + 主题);
  }

  // ---- 主题模式 Select 选项 / 索引 ----
  private 主题模式选项(): SelectOption[] {
    return [
      { value: this.取本地化文本($r('app.string.theme_system')) },
      { value: this.取本地化文本($r('app.string.theme_light')) },
      { value: this.取本地化文本($r('app.string.theme_dark')) }
    ];
  }

  private 主题模式索引(): number {
    if (this.当前主题模式 === 'light') return 1;
    if (this.当前主题模式 === 'dark') return 2;
    return 0;
  }

  /** 已验证的权益决定可选主题，所有索引共用同一列表。 */
  private availableThemes(): 颜色主题[] {
    return availableThemes(this.unlockedContents);
  }

  // ---- 颜色主题 Select 选项 / 索引 ----
  private 颜色主题选项(): SelectOption[] {
    const 主题列表: 颜色主题[] = this.availableThemes();
    return 主题列表.map((主题: 颜色主题): SelectOption => ({ value: this.颜色主题展示名文本(主题) }));
  }

  private 颜色主题索引(): number {
    const 主题列表: 颜色主题[] = this.availableThemes();
    const 索引 = 主题列表.indexOf(this.当前颜色主题);
    return 索引 >= 0 ? 索引 : 0;
  }

  /** 把 颜色主题渐变档 返回的 3 档 hex 转为 linearGradient 需要的 [color, stop] 数组。 */
  private 色样档位(主题: 颜色主题): Array<[ResourceColor, number]> {
    const 色档: string[] = 颜色主题渐变档(主题);
    return [
      [色档[0] as ResourceColor, 0.0],
      [色档[1] as ResourceColor, 0.5],
      [色档[2] as ResourceColor, 1.0]
    ];
  }

  build() {
    设置分组卡片({
      标题: $r('app.string.settings_appearance_display'),
      是否深色: this.是否深色
    }) {
      Column({ space: 4 }) {
          // 主题行 Select（system/light/dark）
          Row() {
            Text($r('app.string.appearance_theme'))
              .fontSize(15)
              .fontColor(设置面板色板_取(this.是否深色).主文字)
              .layoutWeight(1)
            Select(this.主题模式选项())
              .selected(this.主题模式索引())
              .value(this.主题模式标签(this.当前主题模式))
              .attributeModifier(new SelectStyle())
              .font(SelectStyle.controlFont)
              .borderRadius(SelectStyle.controlRadius)
              .onSelect((索引: number): void => {
                const 模式列表: 主题模式[] = ['system', 'light', 'dark'];
                this.主题模式切换回调(模式列表[索引]);
              })
          }
          .width('100%')
          .height(48)

          // 颜色主题行 Select（带渐变色条预览）
          Row() {
            Text($r('app.string.appearance_color_theme'))
              .fontSize(15)
              .fontColor(设置面板色板_取(this.是否深色).主文字)
              .layoutWeight(1)
            // 当前主题渐变色条预览（18×12 圆角矩形，3 档色阶）
            Row()
              .width(18)
              .height(12)
              .borderRadius(6)
              .linearGradient({
                angle: 90,
                colors: this.色样档位(this.当前颜色主题)
              })
            Select(this.颜色主题选项())
              .selected(this.颜色主题索引())
              .value(this.颜色主题展示名文本(this.当前颜色主题))
              .margin({ left: 8 })
              .attributeModifier(new SelectStyle())
              .font(SelectStyle.controlFont)
              .borderRadius(SelectStyle.controlRadius)
              .onSelect((索引: number): void => {
                const 主题列表: 颜色主题[] = this.availableThemes();
                this.颜色主题切换回调(主题列表[索引]);
              })
          }
          .width('100%')
          .height(48)

          if (themeDefinition(this.当前颜色主题).backgroundTextures.length > 0) {
            ThemeMotionControl()
          }
          CardTextSizeControl()
      }
      .width('100%')
    }
  }
}
