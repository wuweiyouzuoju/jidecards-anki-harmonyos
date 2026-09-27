// SPDX-License-Identifier: AGPL-3.0-or-later
import { themeDefinition } from '../model/ThemeCatalog';
import { PrimaryGlassSurface } from '../utils/PrimaryGlassSurface';
import { PRIMARY_GLASS_KEY, PrimaryGlassStyle, themePrimaryGlass } from '../model/ThemeCatalog';

import { 应用尺寸 } from '../utils/应用尺寸';
import { 颜色键 } from '../model/颜色主题';
import { ThemeTextSpans } from './common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';

// ========================================================
// @块ID UI-START-STUDY-BUTTON-001
// @名称 开始学习按钮 主题玻璃与组件字段
//
// @作用
// 开始学习与固定显示答案共用的主按钮；调用方只传文案与动作。
// 主操作使用带当前主题轻染色的玻璃表面，默认也保留玻璃质感。
// 普通主题由种子色派生材料，幻彩使用多色材料；深浅模式由主题管理器发布。
// 按下加厚色层，抬起恢复；共用 PrimaryGlassSurface，不逐帧模糊。
// 文案沿用主题强调色，幻彩逐字配色。
//
// @输入
// 开始学习回调：用户点击按钮时上抛。
//
// @输出
// 渲染开始学习按钮；点击通过 开始学习回调 上抛。
//
// @业务规则
// 跟随用户选择的颜色主题（极光蓝/仙野绿/暗夜紫/碧涛青/活力橙/柠檬金）。
// 玻璃底上使用主题文字，不再叠加白字实体按钮。
// 深浅外观分别派生材料与文字色。
// 玻璃透明度统一由主题材料函数控制，按钮自身不额外提亮。
// 开始学习与固定/浮动显示答案共同使用此材料。
//
// @副作用
// 无。仅渲染与上抛回调。
// ========================================================
@Component
export struct 开始学习按钮 {
  @Prop 文案: Resource = $r('app.string.start_study');
  @Prop isAvailable: boolean = true;
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @StorageProp(颜色键.动作主色) private primaryLabel: string = '#2F5FD0';
  @StorageProp(PRIMARY_GLASS_KEY) private primaryGlass: PrimaryGlassStyle = themePrimaryGlass(themeDefinition('aurora'), false);
  开始学习回调: () => void = (): void => {
  };
  // 跟随用户选择的颜色主题（极光蓝/仙野绿/暗夜紫/碧涛青/活力橙/柠檬金）
  // 玻璃底上使用主题文字，不再叠加白字实体按钮。
  // 色板变化由 AppStorage 绑定更新。
  @State private 已按下: boolean = false;

  // ========================================================
  // @块ID UI-START-STUDY-BUTTON-003
  // @名称 开始学习按钮主渲染
  //
  // @作用
  // 渲染主题玻璃按钮，居中显示调用方文案，默认“开始学习”。
  //
  // @输入
  // @StorageProp primaryGlass / themeAccentColors + @State 已按下。
  //
  // @输出
  // Touch Down 加厚玻璃、Up/Cancel 恢复；点击上抛 开始学习回调。
  //
  // @业务规则
  // 按下时读取玻璃材料的 pressedColors，
  // 抬起/取消恢复材料的 colors。
  // 不改变文字不透明度或按钮布局。
  //
  // @副作用
  // 无。仅上抛回调。
  // ========================================================
  build() {
    Button() {
      Row() {
        Text() {
          if (this.isAvailable) {
            ThemeTextSpans(this.文案, this.themeAccentColors, this.getUIContext())
          } else {
            Span(this.文案).fontColor($r('app.color.text_secondary'))
          }
        }
          .fontSize(应用尺寸.字号_标题)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.primaryLabel)
      }
      .width('100%')
      .justifyContent(FlexAlign.Center)
      .padding({ left: 应用尺寸.间距_8, right: 应用尺寸.间距_8 })
    }
    .width('100%')
    .height(应用尺寸.行动按钮高度)
    .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
    .attributeModifier(new PrimaryGlassSurface(this.isAvailable && this.已按下, this.primaryGlass,
      $r('app.color.border_input'), 1.5))
    .enabled(this.isAvailable)
    .grayscale(this.isAvailable ? 0 : 1)
    .stateEffect(false)
    .borderRadius(应用尺寸.圆角_行动按钮)
    .animation({ duration: 80, curve: Curve.EaseOut })
    .onTouch((event: TouchEvent): void => {
      if (!this.isAvailable) { this.已按下 = false; return; }
      // 按下加厚玻璃，抬起或取消恢复正常材料。
      if (event.type === TouchType.Down) {
        this.已按下 = true;
      } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.已按下 = false;
      }
    })
    .onClick(() => {
      if (this.isAvailable) this.开始学习回调();
    })
  }
}
