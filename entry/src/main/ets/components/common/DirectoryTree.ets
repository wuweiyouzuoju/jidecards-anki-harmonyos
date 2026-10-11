// SPDX-License-Identifier: AGPL-3.0-or-later
import { DirectoryRow, DirectoryView, DirectoryExpansion, directoryListHeight,
  directoryRowKey, directorySelectionAllowed, visibleDirectoryRows } from '../../model/DirectoryTree';
import { DisclosureChevron } from './DisclosureChevron';
import { PressFeedback } from '../../utils/PressFeedback';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { SelectStyle } from '../../utils/SelectStyle';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { resourceText } from '../../utils/UiFeedback';
import { 颜色键 } from '../../model/颜色主题';

class DirectoryRowsDataSource implements IDataSource {
  private rows: DirectoryRow[] = [];
  private listeners: DataChangeListener[] = [];
  totalCount(): number { return this.rows.length; }
  getData(index: number): DirectoryRow { return this.rows[index]; }
  replace(rows: DirectoryRow[]): void {
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

/** 目录唯一渲染入口；不拥有领域选择、存储或写入。外壳内边距只在此贡献一次。 */
@Component
export struct DirectoryTree {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(颜色键.动作主色) private accent: string = '#2F5FD0';
  @Prop @Watch('refresh') rows: DirectoryRow[] = [];
  @Prop @Watch('refresh') isInteractive: boolean = true;
  @Prop @Watch('refresh') searchable: boolean = true;
  @Prop searchPlaceholder: ResourceStr = $r('app.string.directory_search');
  @Prop emptyLabel: ResourceStr = $r('app.string.directory_empty');
  @Prop @Watch('refresh') query: string = '';
  @Prop @Watch('refresh') localExpansion: boolean = true;
  @Prop @Watch('refresh') revealSelection: boolean = true;
  @Prop framed: boolean = true;
  @Prop listHeight: number = 260;
  @Prop @Watch('refresh') selectionMode: string = 'single';
  onSelect: (id: string) => void = (_id: string): void => {};
  onToggle: (id: string) => void = (_id: string): void => {};
  onLongPress: (id: string) => void = (_id: string): void => {};
  onViewChanged: (view: DirectoryView | null) => void = (_view: DirectoryView | null): void => {};
  @State private searchText: string = '';
  @State private visible: DirectoryRow[] = [];
  @State private hasBranches: boolean = false;
  private data: DirectoryRowsDataSource = new DirectoryRowsDataSource();
  private expansion: DirectoryExpansion = new DirectoryExpansion();
  private alive: boolean = false;

  aboutToAppear(): void { this.alive = true; this.refresh(); }
  aboutToDisappear(): void { this.alive = false; this.onViewChanged(null); }
  private refresh(): void {
    if (!this.alive) return;
    const query: string = this.searchable ? this.searchText : this.query;
    this.expansion.update(this.rows, this.revealSelection);
    this.visible = this.localExpansion ? this.expansion.visible(this.rows, query) : visibleDirectoryRows(this.rows, query);
    this.data.replace(this.visible);
    this.hasBranches = this.visible.some((row: DirectoryRow): boolean => row.hasChildren);
    const sample: DirectoryRow[] = this.visible.slice(0, 100);
    const view: DirectoryView = { query, ids: sample.map((row: DirectoryRow): string => row.id),
      paths: sample.map((row: DirectoryRow): string => row.path),
      expandedIds: this.visible.filter((row: DirectoryRow): boolean => row.hasChildren && !row.collapsed)
        .map((row: DirectoryRow): string => row.id), selections: sample.map((row: DirectoryRow): number => row.selection),
      selectable: sample.map((row: DirectoryRow): boolean => row.selectable), total: this.visible.length,
      interactive: this.isInteractive, mode: this.selectionMode, searchable: this.searchable,
      hasBranches: this.hasBranches };
    this.onViewChanged(view);
  }
  private select(id: string): void {
    if (this.alive && directorySelectionAllowed(this.visible, id, this.isInteractive)) this.onSelect(id);
  }
  private toggle(id: string): void {
    if (!this.alive || !this.isInteractive || (this.searchable ? this.searchText : this.query).trim() !== '') return;
    const row: DirectoryRow | undefined = this.visible.find((item: DirectoryRow): boolean => item.id === id);
    if (row === undefined || !row.hasChildren) return;
    if (this.localExpansion) { this.expansion.toggle(row); this.refresh(); }
    this.onToggle(id);
  }
  private longPress(id: string): void {
    if (this.alive && directorySelectionAllowed(this.visible, id, this.isInteractive)) this.onLongPress(id);
  }
  private accessibleLabel(row: DirectoryRow, _locale: string = this.uiLanguage): string {
    if (row.stateLabel !== '') return `${row.path}, ${row.stateLabel}`;
    if (this.selectionMode === 'none' || row.selection < 0) return row.path;
    const key: string = this.selectionMode === 'filter' ?
      (row.selection === 1 ? 'custom_study_tags_include' : row.selection === 2 ? 'custom_study_tags_exclude' : 'custom_study_tags_any') :
      (row.selection === 1 ? 'directory_selected' : row.selection === 2 ? 'directory_mixed' : 'directory_unselected');
    return `${row.path}, ${resourceText(this.getUIContext(), $r(`app.string.${key}`))}`;
  }

  @Builder
  private list() {
    List() {
      LazyForEach(this.data, (row: DirectoryRow): void => {
        ListItem() {
          Row() {
            if (row.hasChildren) {
              Button() { DisclosureChevron().rotate({ angle: row.collapsed ? 0 : 90 }) }
                .width(44).height(44).backgroundColor(Color.Transparent)
                .attributeModifier(new PressFeedback()).stateEffect(false)
                .enabled(this.isInteractive && (this.searchable ? this.searchText : this.query).trim() === '')
                .accessibilityText(row.path)
                .onClick((): void => { this.toggle(row.id); })
            } else if (this.hasBranches) {
              Blank().width(44)
            }
            Button() {
              Row({ space: 应用尺寸.间距_8 }) {
                if (this.selectionMode === 'multiple' && row.selection === 2) {
                  Text('−').fontSize(应用尺寸.字号_正文).fontWeight(FontWeight.Bold)
                    .fontColor(this.accent).textAlign(TextAlign.Center).width(20).height(20)
                    .border({ width: 2, color: this.accent }).borderRadius(应用尺寸.圆角_进度条)
                    .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
                } else if (this.selectionMode === 'multiple' && row.selection >= 0) {
                  Checkbox().shape(CheckBoxShape.ROUNDED_SQUARE).select(row.selection === 1).selectedColor(this.accent)
                    .unselectedColor($r('app.color.text_secondary')).width(20).height(20).margin(0)
                    .enabled(this.isInteractive && row.selectable).focusable(false)
                    .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
                }
                Text(row.name).fontSize(SelectStyle.optionFont.size)
                  .fontWeight(this.selectionMode === 'single' && row.selection === 1 ?
                    SelectStyle.selectedOptionFont.weight : SelectStyle.optionFont.weight)
                  .fontColor(SelectStyle.selectedOptionColor)
                  .layoutWeight(1).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
                if (this.selectionMode === 'filter' && row.selectable) {
                  Text(row.selection === 1 ? $r('app.string.custom_study_tags_include') :
                    row.selection === 2 ? $r('app.string.custom_study_tags_exclude') : $r('app.string.custom_study_tags_any'))
                    .fontSize(应用尺寸.字号_正文_小).fontColor(row.selection === 0 ? $r('app.color.text_secondary') : this.accent)
                }
                if (row.detail !== '') {
                  Text(row.detail).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_tertiary'))
                }
              }.width('100%')
            }.layoutWeight(1).height(44)
              .padding({ left: 应用尺寸.间距_12, right: 应用尺寸.间距_12 })
              .backgroundColor(this.selectionMode === 'single' && row.selection === 1 ?
                SelectStyle.selectedOptionSurface : Color.Transparent)
              .borderRadius(SelectStyle.controlRadius).attributeModifier(new PressFeedback()).stateEffect(false)
              .enabled(this.isInteractive && row.selectable).accessibilityText(this.accessibleLabel(row))
              .onClick((): void => { this.select(row.id); })
              .gesture(LongPressGesture({ repeat: false, duration: 500 }).onAction((): void => { this.longPress(row.id); }))
          }.width('100%').padding({ left: Math.min(row.level, 6) * 应用尺寸.间距_12 })
        }
      }, (row: DirectoryRow): string => directoryRowKey(row))
    }.width('100%').height(directoryListHeight(this.visible.length, this.listHeight)).cachedCount(5).scrollBar(BarState.Auto)
  }

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      if (this.searchable) {
        TextInput({ text: this.searchText, placeholder: this.searchPlaceholder })
          .attributeModifier(new FormInputStyle()).enabled(this.isInteractive)
          .cancelButton({ style: CancelButtonStyle.INPUT })
          .onChange((value: string): void => { this.searchText = value; this.refresh(); })
      }
      if (this.visible.length === 0) {
        Text(this.emptyLabel).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
      } else {
        Column() { this.list() }.width('100%').padding(this.framed ? 应用尺寸.间距_5 : 0)
          .backgroundColor(this.framed ? $r('app.color.surface_card') : Color.Transparent)
          .border(this.framed ? SurfaceBorder.options() : { width: 0 }).borderRadius(应用尺寸.圆角_面板)
      }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
}
