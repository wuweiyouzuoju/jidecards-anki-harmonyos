// SPDX-License-Identifier: AGPL-3.0-or-later
import { WINDOW_SAFE_TOP_KEY } from '../../model/WindowSafeLayout';
import { 按下态按钮 } from './按下态按钮';
import { IconActionButton } from './IconActionButton';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { PAGE_COMPACT_LAYOUT_KEY } from '../../model/AppLayoutState';
import { HelpLabel } from './HelpLabel';

/** 新增和编辑共用固定顶栏，标题中心不受两侧文案长度影响。 */
@Component
export struct NoteEditorHeader {
  @Prop title: ResourceStr = '';
  @Prop actionLabel: ResourceStr = '';
  @Prop actionEnabled: boolean = true;
  @Prop showAction: boolean = true;
  @Prop closeEnabled: boolean = true;
  @Prop accent: ResourceColor = $r('app.color.text_primary');
  onBack: () => void = (): void => {};
  onSave: () => void = (): void => {};
  @StorageProp('状态栏高度') private statusBarHeight: number = 0;
  @StorageProp(WINDOW_SAFE_TOP_KEY) private toolbarSafeTop: number = 0;
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private narrow: boolean = false;

  build() {
    Row() {
      Row() {
        IconActionButton({ toolbarStyle: true, source: $r('app.media.ic_common_arrow_left'), label: $r('app.string.study_back'),
          isInteractive: this.closeEnabled, onAction: this.onBack })
      }.width('28%').justifyContent(FlexAlign.Start)
      HelpLabel({ title: this.title, textSize: 应用尺寸.字号_标题, textWeight: FontWeight.Medium,
        centered: true, showHelp: false }).layoutWeight(1)
      Row() {
        if (this.showAction) {
          按下态按钮({ 文案: this.actionLabel, 字色: this.accent,
            是否启用: this.actionEnabled, singleLine: true, 点击回调: this.onSave })
        }
      }.width('28%').justifyContent(FlexAlign.End)
    }.width('100%').height(应用尺寸.pageToolbarHeight(this.statusBarHeight, this.narrow, this.toolbarSafeTop))
      .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平,
        top: 应用尺寸.pageToolbarTop(this.statusBarHeight, this.narrow, this.toolbarSafeTop), bottom: 0 })
  }
}
