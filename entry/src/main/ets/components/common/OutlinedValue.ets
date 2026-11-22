// SPDX-License-Identifier: AGPL-3.0-or-later
import { appearanceElementRadius } from '../../utils/AppearanceElements';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 只包裹值本身；标题、复制按钮和内容排版由调用方负责。 */
@Component
export struct OutlinedValue {
  @StorageProp('appearance_elements_active') private appearanceElements: string = '';
  @BuilderParam content: () => void = this.emptyContent;
  @Builder private emptyContent() {}

  build() {
    Column() { this.content() }
      .constraintSize({ maxWidth: '100%' })
      .padding({ left: 12, right: 12, top: 8, bottom: 8 })
      .border(SurfaceBorder.options())
      .borderRadius(appearanceElementRadius(this.appearanceElements, 应用尺寸.圆角_面板))
  }
}
