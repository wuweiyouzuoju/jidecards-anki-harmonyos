// SPDX-License-Identifier: AGPL-3.0-or-later
import { 颜色键 } from '../../model/颜色主题';

import { CARD_TEXT_SIZE_KEY, DEFAULT_CARD_TEXT_SIZE, MIN_CARD_TEXT_SIZE, MAX_CARD_TEXT_SIZE } from '../../model/CardTextSize';
import { saveCardTextSize } from '../../utils/CardTextSizeStore';

/** 在外观设置内统一调整卡片文字大小。 */
@Component
export struct CardTextSizeControl {
  @StorageProp(CARD_TEXT_SIZE_KEY) private savedSize: number = DEFAULT_CARD_TEXT_SIZE;
  @State private selectedSize: number = DEFAULT_CARD_TEXT_SIZE;
  @StorageProp(颜色键.主色按钮背景) private actionColor: string = '#2F5FD0';
  @State private saving: boolean = false;
  @State private saveFailed: boolean = false;

  aboutToAppear(): void {
    this.selectedSize = this.savedSize;
  }

  /** 保存单次手势的最终值，避免并发落盘覆盖较新的选择。 */
  private async persistSize(value: number): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    this.saveFailed = false;
    try {
      await saveCardTextSize(value);
      this.selectedSize = this.savedSize;
    } catch (error) {
      this.selectedSize = this.savedSize;
      this.saveFailed = true;
    } finally {
      this.saving = false;
    }
  }

  build() {
    Column({ space: 8 }) {
      Row() {
        Text($r('app.string.card_text_size'))
          .fontSize(15)
          .fontColor($r('app.color.text_primary'))
          .layoutWeight(1)
        Text(`${this.selectedSize}%`)
          .fontSize(15)
          .fontColor($r('app.color.text_secondary'))
      }
      .width('100%')
      Slider({ value: this.selectedSize, min: MIN_CARD_TEXT_SIZE, max: MAX_CARD_TEXT_SIZE, step: 10 })
        .selectedColor(this.actionColor)
        .width('100%')
        .enabled(!this.saving)
        .selectedColor(this.actionColor)
        .onChange((value: number, mode: SliderChangeMode): void => {
          this.selectedSize = value;
          if (mode === SliderChangeMode.End || mode === SliderChangeMode.Click) {
            this.persistSize(value);
          }
        })
      if (this.saveFailed) {
        Text($r('app.string.card_text_size_save_failed'))
          .fontSize(12)
          .fontColor($r('app.color.error_text'))
          .width('100%')
      }
    }
    .padding({ top: 12, bottom: 8 })
    .width('100%')
  }
}
