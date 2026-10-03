// SPDX-License-Identifier: AGPL-3.0-or-later
import { NoteDraftPreview } from '../components/common/NoteDraftPreview';
import { NoteDraftPreviewInput } from '../model/NoteDraftPreview';
import { PAGE_SURFACE_KEY } from '../model/ThemeCatalog';
import { 解析是否深色, 主题模式 } from '../model/主题设置';
import { CustomTransition } from '../utils/自定义转场';

/** 页面只承载冻结的草稿，渲染与临时媒体收尾仍由已有预览会话负责。 */
@Component
export struct NoteDraftPreviewPage {
  @Prop input: NoteDraftPreviewInput;
  pathStack: NavPathStack = new NavPathStack();
  @StorageLink('themeMode') private theme: 主题模式 = 'system';
  @StorageLink('systemDarkMode') private systemDark: boolean = false;
  @StorageProp(PAGE_SURFACE_KEY) private surface: string = '#F5F7FA';
  @State private visible: boolean = true;
  @State private opacityValue: number = 1;

  aboutToAppear(): void {
    CustomTransition.getInstance().注册NavParam('NoteDraftPreviewPage',
      (_push: boolean, exit: boolean): void => { this.opacityValue = exit ? 1 : 0; },
      (_push: boolean, exit: boolean): void => { this.opacityValue = exit ? 0 : 1; });
  }
  aboutToDisappear(): void {
    CustomTransition.getInstance().注销NavParam('NoteDraftPreviewPage');
  }
  private close(): void { this.pathStack.pop(); }

  build() {
    NavDestination() {
      Column() {
        NoteDraftPreview({ input: this.input, isDark: 解析是否深色(this.theme, this.systemDark),
          fullScreen: true, isVisible: this.visible, onClose: (): void => { this.close(); } })
      }.width('100%').height('100%').backgroundColor(this.surface)
    }.hideTitleBar(true).backgroundColor(Color.Transparent).opacity(this.opacityValue)
      .onShown((): void => { this.visible = true; })
      .onHidden((): void => { this.visible = false; })
      .onBackPressed((): boolean => { this.close(); return true; })
  }
}
