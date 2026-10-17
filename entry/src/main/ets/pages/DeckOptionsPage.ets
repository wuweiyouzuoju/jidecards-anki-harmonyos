// SPDX-License-Identifier: AGPL-3.0-or-later
import { DeckOptionsFeature } from '../components/home/DeckOptionsFeature';
import { PAGE_SURFACE_KEY } from '../model/ThemeCatalog';
import { 解析是否深色, 主题模式 } from '../model/主题设置';
import { CustomTransition } from '../utils/自定义转场';
import { navigationEnterOffset } from '../utils/AppMotion';
import { appInterface } from '../backend/AppInterfaceService';

/** 目的地只拥有导航；草稿、退出保护和 Core 会话由功能组件持有。 */
@Component
export struct DeckOptionsPage {
  deckId: number = 0;
  deckName: string = '';
  pathStack: NavPathStack = new NavPathStack();
  onBusy: (busy: boolean) => void = (): void => {};
  @StorageLink('themeMode') private theme: 主题模式 = 'system';
  @StorageLink('systemDarkMode') private systemDark: boolean = false;
  @StorageProp(PAGE_SURFACE_KEY) private surface: string = '#F5F7FA';
  @State private backRequest: number = 0;
  @State private opacityValue: number = 1;
  @State private navigationOffset: number = 0;

  aboutToAppear(): void {
    CustomTransition.getInstance().注册NavParam('DeckOptionsPage',
      (push: boolean, exit: boolean): void => {
        this.opacityValue = exit ? 1 : 0;
        this.navigationOffset = exit ? 0 : navigationEnterOffset(push);
      },
      (_push: boolean, exit: boolean): void => {
        this.opacityValue = exit ? 0 : 1;
        this.navigationOffset = 0;
      });
  }

  aboutToDisappear(): void {
    CustomTransition.getInstance().注销NavParam('DeckOptionsPage');
    appInterface.hidePage('deck_options');
  }

  build() {
    NavDestination() {
      Column() {
        // pop 必须带 result 才触发首页 onPop，释放入口占用并刷新。
        DeckOptionsFeature({ deckId: this.deckId, deckName: this.deckName,
          isDark: 解析是否深色(this.theme, this.systemDark), backRequest: this.backRequest,
          onBusy: this.onBusy, onClose: (): void => { this.pathStack.pop({}); } })
      }.width('100%').height('100%').backgroundColor(this.surface)
    }.hideTitleBar(true).backgroundColor(Color.Transparent).opacity(this.opacityValue)
      .translate({ x: this.navigationOffset })
      .onShown((): void => { appInterface.showPage('deck_options'); })
      .onHidden((): void => { appInterface.hidePage('deck_options'); })
      .onBackPressed((): boolean => { this.backRequest++; return true; })
  }
}
