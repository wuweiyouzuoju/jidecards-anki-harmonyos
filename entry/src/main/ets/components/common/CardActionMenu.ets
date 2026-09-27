// SPDX-License-Identifier: AGPL-3.0-or-later
import { DECK_LIST_NARROW_KEY } from '../../model/DeckListAppearance';
import { AnchoredMenu } from './AnchoredMenu';
import { AnchoredMenuItem } from './MenuItem';
import { cardViewportWidth } from '../../model/CardViewportLayout';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 学习和预览的菜单与各自工具栏共用限宽；外部关闭层覆盖整个窗口。 */
@Component
export struct CardActionMenu {
  @Prop items: MenuElement[] = [];
  @State private contentWidth: number = 840;
  @StorageProp(DECK_LIST_NARROW_KEY) private narrowDeckLayout: boolean = false;
  @StorageProp('状态栏高度') private statusBarHeight: number = 0;
  onClose: () => void = (): void => {};
  onSelect: (item: MenuElement) => void = (item: MenuElement): void => { item.action?.(); };

  build() {
    Stack() {
      AnchoredMenu({ menuWidth: 应用尺寸.compactMenuWidth, alignEnd: true,
        contentMaxWidth: this.contentWidth,
        topOffset: 应用尺寸.pageContentTop(this.statusBarHeight, this.narrowDeckLayout),
        onClose: (): void => { this.onClose(); } }) {
        ForEach(this.items, (item: MenuElement, index: number) => {
          AnchoredMenuItem({ label: item.value, available: item.enabled !== false, divider: index > 0,
            onSelect: (): void => { if (item.enabled !== false) this.onSelect(item); } })
        }, (item: MenuElement, index: number): string => `${index}-${item.value}-${item.enabled}`)
      }
    }.width('100%').height('100%')
    .onAreaChange((_old: Area, area: Area): void => {
      this.contentWidth = cardViewportWidth(Number(area.width), Number(area.height));
    })
  }
}
