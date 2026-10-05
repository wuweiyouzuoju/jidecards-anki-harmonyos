// SPDX-License-Identifier: AGPL-3.0-or-later
import { DeckPreviewScope } from '../../model/DeckPreviewSession';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { PressFeedback } from '../../utils/PressFeedback';
import { AppInterfaceItem, visibleInterfaceItems } from '../../model/AppInterface';
import { appInterface } from '../../backend/AppInterfaceService';
import { namedResourceText } from '../../utils/UiFeedback';

/** 与牌组长按 Popup 使用相同的菜单几何，手机与宽屏只提供锚点。 */
@Component
export struct DeckPreviewScopeMenu {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  onSelect: (scope: DeckPreviewScope) => void = (_scope: DeckPreviewScope): void => {};
  private options(): AppInterfaceItem[] {
    return visibleInterfaceItems('deck_preview_scope', { simple: false, agent: false, cloudDeck: false, themeHasTextures: false });
  }
  aboutToAppear(): void {
    const items: AppInterfaceItem[] = this.options();
    appInterface.observe({ surface: 'deck_preview_scope', sectionId: '', selectedId: '', busy: false,
      optionIds: items.map((item: AppInterfaceItem): string => item.id),
      optionLabels: items.map((item: AppInterfaceItem): string => namedResourceText(this.getUIContext(), item.titleKey)) });
  }
  aboutToDisappear(): void { appInterface.leave('deck_preview_scope'); }

  private selectOption(id: string, _locale: string = this.uiLanguage): void { this.onSelect(Number(id) as DeckPreviewScope); }

  build() {
    Column({ space: 0 }) {
      ForEach(this.options(), (option: AppInterfaceItem) => {
        Row() {
          Text(namedResourceText(this.getUIContext(), option.titleKey))
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .layoutWeight(1)
        }
        .width('100%')
        .constraintSize({ minHeight: 应用尺寸.menuItemHeight })
        .padding({ left: 应用尺寸.menuHorizontalPadding, right: 应用尺寸.menuHorizontalPadding, top: 10, bottom: 10 })
        .attributeModifier(new PressFeedback())
        .onClick((): void => { this.selectOption(option.id); })
      }, (option: AppInterfaceItem): string => option.id)
    }
    .width(应用尺寸.contextMenuWidth)
  }
}
