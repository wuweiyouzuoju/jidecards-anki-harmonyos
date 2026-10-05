// SPDX-License-Identifier: AGPL-3.0-or-later
import { 标签服务 } from '../../backend/标签服务';
import { TagTreeNode } from '../../proto/messages/TagsMessages';
import { TagSelection, TagSelectionChange, TagRow, applyTagSelection, newTagName } from '../../model/NoteTags';
import { TagTreeList } from './TagTreeList';
import { AnchoredMenuItem } from './MenuItem';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { localizedResourceText, namedResourceText } from '../../utils/UiFeedback';
import { appInterface } from '../../backend/AppInterfaceService';
import { APP_INTERFACE_SURFACES, AppInterfaceControl } from '../../model/AppInterface';

/** 选择只改变宿主草稿；加载失败保留原标签，卸载丢弃迟到读取。 */
@Component
export struct TagPicker {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop @Watch('resetSelection') noteTags: string[][] = [];
  @Prop @Watch('publishInterface') isInteractive: boolean = true;
  @Prop listHeight: number = 260;
  onChanged: (changes: TagSelectionChange[], tags: string[]) => void =
    (_changes: TagSelectionChange[], _tags: string[]): void => {};
  onReady: (ready: boolean) => void = (_ready: boolean): void => {};
  @State private query: string = '';
  @State private rows: TagRow[] = [];
  @State @Watch('publishInterface') private loading: boolean = true;
  @State @Watch('publishInterface') private failed: boolean = false;
  private service: 标签服务 = new 标签服务();
  private tree: TagTreeNode | null = null;
  private selection: TagSelection | null = null;
  private alive: boolean = false;
  private version: number = 0;
  private emitted: string = '';
  private baseline: string[][] = [];
  aboutToAppear(): void { this.alive = true; this.load(); }
  aboutToDisappear(): void { this.alive = false; this.version++; appInterface.leave('tag_picker'); }

  private async load(): Promise<void> {
    const version: number = ++this.version;
    this.loading = true; this.failed = false; this.onReady(false);
    this.publishInterface();
    try {
      const tree: TagTreeNode = await this.service.标签树();
      if (!this.alive || version !== this.version) return;
      this.tree = tree; this.emitted = ''; this.resetSelection(); this.onReady(true);
    } catch (error) {
      if (this.alive && version === this.version) { this.failed = true; this.onReady(false); }
    } finally {
      if (this.alive && version === this.version) this.loading = false;
    }
  }

  private resetSelection(): void {
    if (this.tree === null || JSON.stringify(this.noteTags) === this.emitted) return;
    this.baseline = this.noteTags.map((tags: string[]): string[] => tags.slice());
    this.emitted = JSON.stringify(this.noteTags);
    this.selection = new TagSelection(this.tree, this.noteTags);
    this.refresh();
  }

  private refresh(): void { this.rows = this.selection?.visible(this.query) ?? []; this.publishInterface(); }
  private publishInterface(_locale: string = this.uiLanguage): void {
    if (!this.alive) return;
    const surface = APP_INTERFACE_SURFACES.find((item): boolean => item.id === 'tag_picker');
    const controls: AppInterfaceControl[] = (surface?.items ?? []).filter((item): boolean =>
      item.id === 'retry' ? this.failed : item.id === 'create' ? this.canAdd() : true)
      .map((item): AppInterfaceControl => ({ id: item.id, titleKey: item.titleKey,
        title: namedResourceText(this.getUIContext(), item.titleKey), selected: false,
        enabled: this.isInteractive && (item.id === 'retry' ? true : !this.loading && !this.failed) }));
    const sample: TagRow[] = this.rows.slice(0, 40);
    appInterface.observe({ surface: 'tag_picker', sectionId: '', selectedId: '', busy: this.loading || !this.isInteractive,
      optionIds: sample.map((row: TagRow): string => row.fullName),
      optionLabels: sample.map((row: TagRow): string => row.fullName), optionsTotal: this.rows.length,
      items: controls, controlsComplete: true,
      values: [{ id: 'mixed', value: String(this.noteTags.length > 1) }, { id: 'has_error', value: String(this.failed) }] });
  }
  private changed(): void {
    if (this.selection === null) return;
    const changes: TagSelectionChange[] = this.selection.changes();
    const tags: string[] = applyTagSelection(this.baseline[0] ?? [], changes);
    if (this.noteTags.length === 1) this.emitted = JSON.stringify([tags]);
    this.refresh(); this.onChanged(changes, tags);
  }
  private toggle(name: string): void {
    if (!this.isInteractive || this.loading || this.failed) return;
    this.selection?.toggle(name); this.changed();
  }
  private canAdd(): boolean {
    const name: string = newTagName(this.query);
    return !this.loading && !this.failed && this.selection !== null && name !== '' && !this.selection.has(name);
  }
  private add(): void {
    if (!this.isInteractive || !this.canAdd() || this.selection === null) return;
    if (this.selection.add(this.query) !== '') { this.query = ''; this.changed(); }
  }

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      TextInput({ text: this.query, placeholder: localizedResourceText(this.getUIContext(), this.uiLanguage, $r('app.string.tags_search_hint')) })
        .attributeModifier(new FormInputStyle()).enabled(this.isInteractive && !this.loading)
        .onChange((value: string): void => { this.query = value; this.refresh(); })
      if (this.loading) {
        Text($r('app.string.tags_loading')).fontColor($r('app.color.text_secondary'))
      } else if (this.failed) {
        Text($r('app.string.tags_load_error')).fontColor($r('app.color.error_text'))
        AnchoredMenuItem({ label: $r('app.string.home_retry'), onSelect: (): void => { this.load(); } })
      } else {
        if (this.noteTags.length > 1) {
          Text($r('app.string.tags_mixed_hint')).fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary')).width('100%')
        }
        if (this.rows.length === 0) {
          Text($r('app.string.tags_no_matches')).fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
        } else {
          TagTreeList({ rows: this.rows, listHeight: this.listHeight, isInteractive: this.isInteractive,
            onSelect: (name: string): void => { this.toggle(name); },
            onToggle: (name: string): void => { this.selection?.toggleCollapsed(name); this.refresh(); } })
        }
        if (this.canAdd()) {
          AnchoredMenuItem({ label: $r('app.string.tags_add_named', newTagName(this.query)), available: this.isInteractive,
            onSelect: (): void => { this.add(); } })
        }
      }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
}
