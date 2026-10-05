// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { DisclosureChevron } from '../common/DisclosureChevron';

/** 牌组选项中的字段与分类共用入口外观；打开编辑器或分类由调用方决定。 */
@Component
export struct DeckOptionRow {
  @Prop title: ResourceStr = '';
  @Prop summary: ResourceStr = '';
  @Prop error: string = '';
  @Prop busy: boolean = false;
  onOpen: () => void = (): void => {};

  private open(): void {
    if (!this.busy) this.onOpen();
  }

  build() {
    Column({ space: 4 }) {
      Row({ space: 12 }) {
        Text(this.title).fontSize(15).fontColor($r('app.color.text_primary')).layoutWeight(1)
        if (this.summary !== '') {
          Text(this.summary).fontSize(14).fontColor($r('app.color.text_secondary'))
            .constraintSize({ maxWidth: '38%' }).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        DisclosureChevron({ tint: $r('app.color.text_secondary') })
      }
      .width('100%').constraintSize({ minHeight: 48 }).padding({ left: 10, right: 10, top: 6, bottom: 6 })
      .attributeModifier(new PressFeedback())
      .enabled(!this.busy).onClick((): void => { this.open(); })
      if (this.error !== '') Text(this.error).fontSize(14).fontColor($r('app.color.error_text')).width('100%')
      Divider().color(SurfaceBorder.color()).strokeWidth(0.5)
    }.width('100%')
  }
}
