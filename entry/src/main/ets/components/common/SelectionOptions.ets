// SPDX-License-Identifier: AGPL-3.0-or-later
import { ActionIcon } from './ActionIcon';
import { ActionMenuListItem } from './ActionMenuList';
import { PressFeedback } from '../../utils/PressFeedback';
import { SelectStyle } from '../../utils/SelectStyle';
import { 颜色键 } from '../../model/颜色主题';

/** 枚举选择共用行：图文成组居中，当前项只改变文字，不绘制勾号、圆点或选中底色。 */
@Component
export struct SelectionOptions {
  @StorageProp(颜色键.动作主色) private actionColor: string = '#2F5FD0';
  @Prop items: ActionMenuListItem[] = [];
  @Prop horizontal: boolean = false;
  @Prop isInteractive: boolean = true;
  onSelect: (id: string) => void = (_id: string): void => {};
  private select(id: string): void {
    const item: ActionMenuListItem | undefined = this.items.find((entry: ActionMenuListItem): boolean => entry.id === id);
    if (this.isInteractive && item !== undefined && item.available !== false) this.onSelect(id);
  }
  @Builder
  private options() {
    ForEach(this.items, (item: ActionMenuListItem) => {
      Button() {
        Row({ space: 10 }) {
          if (item.icon !== undefined) {
            ActionIcon({ source: item.icon, glyphSize: 20, tint: item.iconTint ?? $r('app.color.text_secondary'),
              semanticStrokeColor: item.iconTint }).flexShrink(0)
          }
          Text(item.label).fontSize(SelectStyle.controlFont.size)
            .fontWeight(item.selected ? FontWeight.Medium : FontWeight.Normal)
            .fontColor(item.selected ? this.actionColor : $r('app.color.text_primary'))
            .textAlign(TextAlign.Center).flexShrink(1)
        }.width('100%').justifyContent(FlexAlign.Center).alignItems(VerticalAlign.Center)
      }.type(ButtonType.Normal).width(this.horizontal ? '50%' : '100%').constraintSize({ minHeight: 44 })
        .padding({ left: 12, right: 12, top: 10, bottom: 10 })
        .backgroundColor(Color.Transparent).borderRadius(8)
        .attributeModifier(new PressFeedback()).stateEffect(false)
        .enabled(this.isInteractive && item.available !== false)
        .accessibilitySelected(item.selected === true)
        .onClick((): void => { this.select(item.id); })
    }, (item: ActionMenuListItem): string => item.id + '-' + String(item.selected))
  }

  build() {
    if (this.horizontal) {
      Row() { this.options() }.width('100%').padding(4)
    } else {
      Column() { this.options() }.width('100%').padding(4)
    }
  }
}
