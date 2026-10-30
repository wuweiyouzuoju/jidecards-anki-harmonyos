// SPDX-License-Identifier: AGPL-3.0-or-later
import { IconActionButton } from '../common/IconActionButton';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
@Component
export struct BrowserSelectionAccessory {
  @StorageProp(颜色键.选中背景) private selectedFill: string = '#E8EEFC';
  @StorageProp(颜色键.主色文字) private accentText: string = '#2F5FD0';
  @Prop selecting: boolean = false;
  @Prop count: number = 0;
  @Prop filterEnabled: boolean = true;
  @Prop filterIcon: ResourceStr = $r('app.media.ic_settings_search');
  @Prop filterLabel: ResourceStr = $r('app.string.browser_sidebar_title');
  @Prop selectionLabel: string = '';
  onFilter: () => void = (): void => {};
  private badgeText(): string { return this.count > 99 ? '99+' : String(this.count); }
  build() {
    if (this.selecting) {
      Row() { Text(this.badgeText()).fontSize(应用尺寸.字号_正文).fontWeight(FontWeight.Bold).fontColor(this.accentText).maxLines(1) }
        .width(92).height(应用尺寸.按钮高度).justifyContent(FlexAlign.Center).backgroundColor(this.selectedFill)
        .border({width:应用尺寸.卡片边框,color:this.accentText}).borderRadius(22)
        .hitTestBehavior(HitTestMode.None).accessibilityText(this.selectionLabel)
    } else {
      IconActionButton({ toolbarStyle:true,source:this.filterIcon,label:this.filterLabel,isInteractive:this.filterEnabled,onAction:this.onFilter })
    }
  }
}
