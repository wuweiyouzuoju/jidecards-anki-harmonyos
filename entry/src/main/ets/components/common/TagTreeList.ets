// SPDX-License-Identifier: AGPL-3.0-or-later
import { TagRow } from '../../model/NoteTags';
import { DisclosureChevron } from './DisclosureChevron';
import { PressFeedback } from '../../utils/PressFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { resourceText } from '../../utils/UiFeedback';
import { 颜色键 } from '../../model/颜色主题';

export class TagRowsDataSource implements IDataSource {
  private rows: TagRow[] = [];
  private listeners: DataChangeListener[] = [];
  totalCount(): number { return this.rows.length; }
  getData(index: number): TagRow { return this.rows[index]; }
  replace(rows: TagRow[]): void {
    this.rows = rows.slice();
    for (const listener of this.listeners) listener.onDataReloaded();
  }
  registerDataChangeListener(listener: DataChangeListener): void {
    if (this.listeners.indexOf(listener) < 0) this.listeners.push(listener);
  }
  unregisterDataChangeListener(listener: DataChangeListener): void {
    this.listeners = this.listeners.filter((item: DataChangeListener): boolean => item !== listener);
  }
}

/** 管理与选择共用树形列表；短列表按内容收缩，长列表保留有限可视高度。 */
@Component
export struct TagTreeList {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(颜色键.动作主色) private accent: string = '#2F5FD0';
  @Prop @Watch('refresh') rows: TagRow[] = [];
  @Prop isInteractive: boolean = true;
  @Prop listHeight: number = 260;
  onSelect: (name: string) => void = (_name: string): void => {};
  onToggle: (name: string) => void = (_name: string): void => {};
  onLongPress: (name: string) => void = (_name: string): void => {};
  private data: TagRowsDataSource = new TagRowsDataSource();
  aboutToAppear(): void { this.refresh(); }
  private refresh(): void { this.data.replace(this.rows); }
  private visibleHeight(): number { return Math.min(this.listHeight, this.rows.length * 44); }
  private hasBranches(): boolean { return this.rows.some((row: TagRow): boolean => row.hasChildren); }
  private accessibleLabel(row: TagRow, _locale: string = this.uiLanguage): string {
    if (row.selection < 0) return row.fullName;
    const state: Resource = row.selection === 1 ? $r('app.string.tags_state_all') :
      row.selection === 2 ? $r('app.string.tags_state_some') : $r('app.string.tags_state_none');
    return `${row.fullName}, ${resourceText(this.getUIContext(), state)}`;
  }

  build() {
    List() {
      LazyForEach(this.data, (row: TagRow): void => {
        ListItem() {
          Row() {
            if (row.hasChildren) {
              Button() { DisclosureChevron().rotate({ angle: row.collapsed ? 0 : 90 }) }
                .width(44).height(44).backgroundColor(Color.Transparent)
                .attributeModifier(new PressFeedback()).stateEffect(false).enabled(this.isInteractive)
                .accessibilityText(row.fullName)
                .onClick((): void => { if (this.isInteractive) this.onToggle(row.fullName); })
            } else if (row.selection < 0 || this.hasBranches()) {
              Blank().width(44)
            }
            Button() {
              Row({ space: 应用尺寸.间距_8 }) {
                if (row.selection === 2) {
                  Text('−').fontSize(应用尺寸.字号_正文).fontWeight(FontWeight.Bold)
                    .fontColor(this.accent).textAlign(TextAlign.Center).width(20).height(20)
                    .border({ width: 2, color: this.accent }).borderRadius(应用尺寸.圆角_进度条)
                    .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
                } else if (row.selection >= 0) {
                  // 整行持有点击，复选框只展示宿主状态，避免一次操作被两个回调翻转。
                  Checkbox().shape(CheckBoxShape.ROUNDED_SQUARE).select(row.selection === 1).selectedColor(this.accent)
                    .unselectedColor($r('app.color.text_secondary')).width(20).height(20).margin(0)
                    .enabled(this.isInteractive).focusable(false)
                    .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
                }
                Text(row.name).fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary'))
                  .layoutWeight(1).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
              }.width('100%')
            }
            .layoutWeight(1).height(44)
            .padding({ left: row.selection >= 0 ? 应用尺寸.间距_12 : 0, right: 应用尺寸.间距_12 })
            .backgroundColor(Color.Transparent)
            .borderRadius(应用尺寸.圆角_面板)
            .attributeModifier(new PressFeedback()).stateEffect(false).enabled(this.isInteractive)
            .accessibilityText(this.accessibleLabel(row))
            .onClick((): void => { if (this.isInteractive) this.onSelect(row.fullName); })
            .gesture(LongPressGesture({ repeat: false, duration: 500 }).onAction((): void => {
              if (this.isInteractive) this.onLongPress(row.fullName);
            }))
          }.width('100%').padding({ left: Math.min(row.level, 6) * 应用尺寸.间距_12 })
        }
      }, (row: TagRow): string => `${row.fullName}-${row.collapsed}-${row.selection}`)
    }.width('100%').height(this.visibleHeight()).cachedCount(5).scrollBar(BarState.Auto)
  }
}
