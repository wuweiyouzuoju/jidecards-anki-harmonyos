// SPDX-License-Identifier: AGPL-3.0-or-later
import { 按下态按钮 } from './按下态按钮';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { DECK_LIST_NARROW_KEY } from '../../model/DeckListAppearance';

/** 新增和编辑共用固定顶栏，标题中心不受两侧文案长度影响。 */
@Component
export struct NoteEditorHeader {
  @Prop title: ResourceStr = '';
  @Prop actionLabel: ResourceStr = '';
  @Prop actionEnabled: boolean = true;
  @Prop closeEnabled: boolean = true;
  @Prop accent: ResourceColor = $r('app.color.action_primary');
  onBack: () => void = (): void => {};
  onSave: () => void = (): void => {};
  @StorageProp('状态栏高度') private statusBarHeight: number = 0;
  @StorageProp(DECK_LIST_NARROW_KEY) private narrow: boolean = false;

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Text(this.title).fontSize(应用尺寸.字号_标题).fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_primary')).maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis }).textAlign(TextAlign.Center)
        .width('44%').hitTestBehavior(HitTestMode.None)
      Row() {
        Row() {
          按下态按钮({ 文案: $r('app.string.study_back'), 字色: $r('app.color.text_primary'),
            是否启用: this.closeEnabled, singleLine: true, 点击回调: this.onBack })
        }.width('28%').justifyContent(FlexAlign.Start)
        Blank().layoutWeight(1)
        Row() {
          按下态按钮({ 文案: this.actionLabel, 字色: this.accent, themeText: true,
            是否启用: this.actionEnabled, singleLine: true, 点击回调: this.onSave })
        }.width('28%').justifyContent(FlexAlign.End)
      }.width('100%').height('100%').alignItems(VerticalAlign.Center)
    }.width('100%').height(应用尺寸.pageToolbarHeight(this.statusBarHeight, this.narrow))
      .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平,
        top: 应用尺寸.pageToolbarTop(this.statusBarHeight, this.narrow), bottom: 0 })
  }
}
