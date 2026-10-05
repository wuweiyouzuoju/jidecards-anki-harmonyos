// SPDX-License-Identifier: AGPL-3.0-or-later
import { THEME_TEXT_COLORS_KEY } from '../../model/ThemeCatalog';
import { GLASS_COLORS_KEY, GLASS_HIGHLIGHT_COLORS } from '../../model/ThemeCatalog';
import { ThemeLabelGlyph, themeLabelGlyphs } from './ThemeText';
import { GlassSurface } from '../../utils/GlassSurface';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { localizedResourceText } from '../../utils/UiFeedback';

// ========================================================
// @块ID UI-COMMON-PRESSBTN-001
// @名称 按下态按钮
//
// @作用
// 包装 Button，自带 pressed 视觉反馈，
// 替换各处用数字编码（如 工具栏按下状态 1/2）手动管理按下态的写法。
//
// @输入
// 文案：必填 ResourceStr
// 图标：可选 Resource
// 按下时统一使用半透明玻璃表面。
// 字号：可选，默认 应用尺寸.字号_按钮
// 字色：可选，默认 text_primary
// 是否启用：可选，默认 true
// selectable/selected：可选，选择工具的持续选中态，默认关闭
// selectionColor/markerColor：可选，选中描边/字色与独立颜色标记
// 点击回调：必填回调
//
// @输出
// 渲染带按下态视觉反馈的按钮
//
// @副作用
// 无。
// ========================================================

import { 应用尺寸 } from '../../utils/应用尺寸';

@Component
export struct 按下态按钮 {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(GLASS_COLORS_KEY) private glassColors: string[] = GLASS_HIGHLIGHT_COLORS;
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop themeText: boolean = false;
  @Prop 文案: ResourceStr;
  @Prop 图标: Resource | undefined = undefined;
  @Prop 字号: number = 应用尺寸.字号_按钮;
  @Prop 字色: ResourceColor = $r('app.color.text_primary');
  @Prop 是否启用: boolean = true;
  @Prop selectable: boolean = false;
  @Prop selected: boolean = false;
  @Prop selectionColor: ResourceColor = $r('app.color.action_primary');
  @Prop markerColor: ResourceColor | undefined = undefined;
  // 工具栏在等宽侧栏内约束标签，保留完整无障碍名称。
  @Prop singleLine: boolean = false;
  @Prop fillWidth: boolean = false;
  点击回调: () => void = (): void => {};

  private activate(): void {
    if (this.是否启用) this.点击回调();
  }

  private labelColor(): ResourceColor { return this.selectable && this.selected ? this.selectionColor : this.字色; }
  private buttonBorder(): BorderOptions {
    return SurfaceBorder.options(this.selectable ? 2 : 应用尺寸.卡片边框,
      this.selectable && this.selected ? this.selectionColor : SurfaceBorder.color());
  }

  build() {
    Button() {
      Row({ space: 应用尺寸.间距_8 }) {
        if (this.markerColor !== undefined) {
          Circle().width(10).height(10).fill(this.markerColor)
        }
        if (this.图标 !== undefined) {
          Image(this.图标).width(16).height(16)
        }
        if (this.themeText && this.themeAccentColors.length > 0) {
          // 在组件 build 内读取色板，避免按值 Builder 留下旧的深浅色字形。
          Text() {
            ForEach(themeLabelGlyphs(this.文案, this.themeAccentColors, this.getUIContext(), this.uiLanguage), (glyph: ThemeLabelGlyph) => {
              Span(glyph.letter).fontColor(glyph.color)
            }, (glyph: ThemeLabelGlyph, index: number): string => `${index}-${glyph.letter}-${glyph.color}`)
          }
            .fontSize(this.字号)
            .maxLines(this.singleLine ? 1 : undefined)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        } else {
          Text(this.文案)
            .fontSize(this.字号)
            .fontColor(this.labelColor())
            .maxLines(this.singleLine ? 1 : undefined)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
      }
      .justifyContent(FlexAlign.Center)
      .constraintSize({ maxWidth: this.singleLine ? '100%' : undefined })
    }
    .height(应用尺寸.按钮高度)
    .width(this.fillWidth ? '100%' : undefined)
    .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
    .constraintSize({ minWidth: 0, maxWidth: this.singleLine ? '100%' : undefined })
    .accessibilityText(typeof this.文案 === 'string' ? this.文案 : localizedResourceText(this.getUIContext(), this.uiLanguage, this.文案))
    .fontColor(this.labelColor())
    .attributeModifier(new GlassSurface(this.glassColors, $r('app.color.surface_card'), this.buttonBorder()))
    .stateEffect(false)
    .borderRadius(应用尺寸.圆角_胶囊)
    .enabled(this.是否启用)
    .onClick(() => { this.activate(); })
  }
}
