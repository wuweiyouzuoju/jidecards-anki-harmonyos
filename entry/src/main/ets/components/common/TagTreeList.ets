// SPDX-License-Identifier: AGPL-3.0-or-later
import { TagRow } from '../../model/NoteTags';
import { DisclosureChevron } from './DisclosureChevron';
import { PressFeedback } from '../../utils/PressFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { resourceText } from '../../utils/UiFeedback';

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

/** 管理与选择共用树形列表；固定可视高度确保大量标签只渲染可见行。 */
@Component
export struct TagTreeList {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop @Watch('refresh') rows: TagRow[] = [];
  @Prop isInteractive: boolean = true;
  @Prop listHeight: number = 260;
  onSelect: (name: string) => void = (_name: string): void => {};
  onToggle: (name: string) => void = (_name: string): void => {};
  onLongPress: (name: string) => void = (_name: string): void => {};
  private data: TagRowsDataSource = new TagRowsDataSource();
  aboutToAppear(): void { this.refresh(); }
  private refresh(): void { this.data.replace(this.rows); }
  private glyph(selection: number): string { return selection === 1 ? '✓' : selection === 2 ? '−' : '○'; }
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
            } else {
              Blank().width(44)
            }
            Button() {
              Row({ space: 应用尺寸.间距_8 }) {
                if (row.selection >= 0) {
                  Text(this.glyph(row.selection)).fontSize(应用尺寸.字号_正文)
                    .fontColor($r('app.color.text_primary')).width(24)
                }
                Text(row.name).fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary'))
                  .layoutWeight(1).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
              }.width('100%')
            }
            .layoutWeight(1).height(44).padding({ left: 0, right: 应用尺寸.间距_8 })
            .backgroundColor(Color.Transparent).borderRadius(应用尺寸.圆角_面板)
            .attributeModifier(new PressFeedback()).stateEffect(false).enabled(this.isInteractive)
            .accessibilityText(this.accessibleLabel(row))
            .onClick((): void => { if (this.isInteractive) this.onSelect(row.fullName); })
            .gesture(LongPressGesture({ repeat: false, duration: 500 }).onAction((): void => {
              if (this.isInteractive) this.onLongPress(row.fullName);
            }))
          }.width('100%').padding({ left: Math.min(row.level, 6) * 应用尺寸.间距_12 })
        }
      }, (row: TagRow): string => `${row.fullName}-${row.collapsed}-${row.selection}`)
    }.width('100%').height(this.listHeight).cachedCount(5).scrollBar(BarState.Auto)
  }
}
