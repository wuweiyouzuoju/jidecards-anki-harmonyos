import { SeriesVisual } from '../../utils/SeriesVisual';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { localizedResourceText } from '../../utils/UiFeedback';
import { 颜色键 } from '../../model/颜色主题';
import { ActionStatus } from './ActionStatus';
import { hasActionStatus } from '../../model/InteractionFeedback';

/** 主操作按钮统一几何与反馈；宿主决定可用状态、忙碌文案及业务动作。 */
@Component
export struct PrimaryActionButton {
  @StorageProp('themeMode') private materialTheme: string = 'system';
  @StorageProp('systemDarkMode') private materialSystemDark: boolean = false;
  @StorageProp('surface_material') private surfaceMaterial: string = 'flat';
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(颜色键.主色按钮背景) private primaryBackground: string = '#2F5FD0';
  @Prop label: ResourceStr = '';
  @Prop isInteractive: boolean = true;
  @Prop tint: ResourceColor | undefined = undefined;
  @Prop foreground: ResourceColor = '#FFFFFF';
  @Prop glassSurface: boolean = false;
  @Prop glassAccent: string = '#2F5FD0';
  @Prop feedback: string = '';
  onAction: () => void = (): void => {};

  private activate(): void {
    if (this.isInteractive) this.onAction();
  }

  private resolvedTint(): ResourceColor { return this.tint ?? this.primaryBackground; }

  build() {
    Button() {
      Row({ space: 8 }) {
        if (hasActionStatus(this.feedback)) { ActionStatus({ phase: this.feedback, tint: this.foreground }) }
        Text(this.label).fontSize(应用尺寸.字号_按钮).fontColor(this.foreground)
          .layoutWeight(1).textAlign(TextAlign.Center).constraintSize({ minWidth: 0 })
      }.width('100%').justifyContent(FlexAlign.Center)
    }
      .width('100%')
      .constraintSize({ minHeight: 应用尺寸.行动按钮高度 })
      .padding({ left: 16, right: 16, top: 8, bottom: 8 })
      .fontSize(应用尺寸.字号_按钮)
      .fontColor(this.foreground)
      .attributeModifier(SeriesVisual.control('glass', SeriesVisual.isDark(this.materialTheme, this.materialSystemDark),
        this.glassAccent, 应用尺寸.圆角_行动按钮, this.glassSurface, this.resolvedTint()))
      .backgroundColor(this.resolvedTint())
      .borderRadius(应用尺寸.圆角_行动按钮)
      .shadow(SeriesVisual.shadow(this.glassSurface ? 'glass' : this.surfaceMaterial, SeriesVisual.isDark(this.materialTheme, this.materialSystemDark)))
      .enabled(this.isInteractive)
      .opacity(this.isInteractive ? 1 : 0.6)
      .attributeModifier(new PressFeedback(this.isInteractive ? 1 : 0.6))
      .stateEffect(false)
      .accessibilityText(typeof this.label === 'string' ? this.label : localizedResourceText(this.getUIContext(), this.uiLanguage, this.label))
      .onClick((): void => { this.activate(); })
  }
}
