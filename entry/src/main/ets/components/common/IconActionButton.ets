// SPDX-License-Identifier: AGPL-3.0-or-later
import { ActionIcon } from './ActionIcon';
import { PressFeedback } from '../../utils/PressFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { localizedResourceText } from '../../utils/UiFeedback';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { 颜色键 } from '../../model/颜色主题';

/** 仅图标动作默认44vp点击区；可按布局调整几何，宿主提供完整本地化无障碍名称。 */
@Component
export struct IconActionButton {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(颜色键.动作主色) private actionColor: string = '#2F5FD0';
  @Prop source: ResourceStr = '';
  @Prop label: ResourceStr = '';
  @Prop isInteractive: boolean = true;
  @Prop glyphColor: string = '';
  @Prop iconFill: ResourceColor = Color.Transparent;
  @Prop surface: ResourceColor = Color.Transparent;
  @Prop cornerAligned: boolean = false;
  @Prop controlSize: number = 应用尺寸.按钮高度;
  @Prop controlWidth: number = 0;
  @Prop controlGlyphSize: number = 18;
  @Prop squareSurface: boolean = false;
  /** 直接展示的导航用简笔描边；菜单的明暗灰色填充不进入顶栏。 */
  @Prop toolbarStyle: boolean = false;
  onAction: () => void = (): void => {};

  private activate(): void {
    if (this.isInteractive) this.onAction();
  }

  private usesSquareSurface(): boolean { return this.toolbarStyle || this.squareSurface; }
  private resolvedSurface(): ResourceColor { return this.toolbarStyle ? $r('app.color.surface_card') : this.surface; }
  private resolvedGlyphColor(): string { return this.toolbarStyle ? this.actionColor : this.glyphColor; }
  private resolvedIconFill(): ResourceColor { return this.toolbarStyle ? Color.Transparent : this.iconFill; }

  build() {
    Button() {
      Stack({ alignContent: this.cornerAligned ? Alignment.TopEnd : Alignment.Center }) {
        ActionIcon({ source: this.source, tint: this.resolvedIconFill(), strokeColor: this.resolvedGlyphColor(), glyphSize: this.controlGlyphSize })
      }.width('100%').height('100%').padding(this.cornerAligned ? 应用尺寸.间距_4 : 0)
    }
    .type(this.usesSquareSurface() ? ButtonType.Normal : ButtonType.Circle)
    .width(this.controlWidth > 0 ? this.controlWidth : this.controlSize).height(this.controlSize).padding(0).flexShrink(0)
    .border(SurfaceBorder.options(this.usesSquareSurface() ? 应用尺寸.卡片边框 : 0))
    .borderRadius(this.usesSquareSurface() ? 应用尺寸.圆角_卡片 : this.controlSize / 2)
    .backgroundColor(this.resolvedSurface()).opacity(this.isInteractive ? 1 : 0.4)
    .accessibilityText(typeof this.label === 'string' ? this.label :
      localizedResourceText(this.getUIContext(), this.uiLanguage, this.label))
    .enabled(this.isInteractive)
    .attributeModifier(new PressFeedback()).stateEffect(false)
    .onClick((): void => { this.activate(); })
  }
}
