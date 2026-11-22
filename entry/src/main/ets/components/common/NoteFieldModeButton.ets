// SPDX-License-Identifier: AGPL-3.0-or-later
import { themeSolidTextColor } from '../../model/色阶生成';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { PressFeedback } from '../../utils/PressFeedback';

/** 字段编辑模式切换按钮；文案由调用方按当前模式提供（见 noteFieldModeTitleKey）。 */
@Component
export struct NoteFieldModeButton {
  @Prop label: ResourceStr = '';
  @Prop accent: string = '#2F5FD0';
  @Prop isInteractive: boolean = true;
  @Prop controlId: string = '';
  onToggle: () => void = (): void => {};

  build() {
    Button(this.label)
      .id(this.controlId)
      .fontSize(应用尺寸.字号_正文_小).fontColor(themeSolidTextColor(this.accent))
      .height(32).padding({ left: 应用尺寸.间距_8, right: 应用尺寸.间距_8 })
      .backgroundColor(this.accent).borderRadius(9).flexShrink(0)
      .enabled(this.isInteractive).attributeModifier(new PressFeedback()).stateEffect(false)
      .onClick((): void => { if (this.isInteractive) this.onToggle(); })
  }
}
