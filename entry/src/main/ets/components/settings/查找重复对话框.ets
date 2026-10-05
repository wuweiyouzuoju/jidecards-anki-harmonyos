// SPDX-License-Identifier: AGPL-3.0-or-later
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { noteTypeText, noteFieldText } from '../../utils/NoteTypeText';
import { localizedResourceText, resourceText, namedResourceText } from '../../utils/UiFeedback';
import { FormSelectRow } from '../common/FormSelectRow';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { PressFeedback } from '../../utils/PressFeedback';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { 按下态按钮 } from '../common/按下态按钮';
import { AnkiNoteDuplicates } from '../../backend/AnkiNoteDuplicates';
import { 笔记类型服务 } from '../../backend/笔记类型服务';
import { NoteDuplicateSession, DuplicateScanState, DuplicateGroup, initialDuplicateScanState, duplicateGroupSearch } from '../../model/NoteDuplicateSession';
import { NotetypeNameId, NotetypeView } from '../../proto/messages/NotetypeMessages';
import { 应用尺寸 } from '../../utils/应用尺寸';

@Component
export struct 查找重复对话框 {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop @Watch('handleBackRequest') backRequest: number = 0;
  @Prop isDark: boolean = false;
  onClose: () => void = (): void => {};
  onJumpToBrowser: (searchText: string) => void = (_searchText: string): void => {};
  @State private 加载中: boolean = false;
  @State private 笔记类型列表: NotetypeNameId[] = [];
  @State private 选中类型索引: number = -1;
  @State private view: NotetypeView | null = null;
  @State private fieldOrd: number = 0;
  @State private searchScope: string = '';
  @State private scan: DuplicateScanState = initialDuplicateScanState();
  @State private 错误信息: string = '';
  @State private resultLimit: number = 50;
  private alive: boolean = true;
  private generation: number = 0;
  private readonly types: 笔记类型服务 = new 笔记类型服务();
  private readonly session: NoteDuplicateSession = new NoteDuplicateSession(new AnkiNoteDuplicates(),
    (state: DuplicateScanState): void => { this.scan = state; });

  aboutToAppear(): void { this.loadTypes(); }
  aboutToDisappear(): void { this.alive = false; this.generation++; this.session.dispose(); }
  private handleBackRequest(): void { this.close(); }
  private close(): void { this.session.cancel(); this.generation++; this.onClose(); }
  private async loadTypes(): Promise<void> {
    const generation: number = ++this.generation;
    this.加载中 = true; this.错误信息 = '';
    try {
      const names = await this.types.获取笔记类型名列表();
      if (!this.alive || generation !== this.generation) return;
      this.笔记类型列表 = names;
      this.选中类型索引 = names.length > 0 ? 0 : -1;
      if (names.length > 0) await this.selectType(0);
    } catch (error) {
      if (this.alive && generation === this.generation) this.错误信息 = `${error}`;
    } finally {
      if (this.alive && generation === this.generation) this.加载中 = false;
    }
  }
  private async selectType(index: number): Promise<void> {
    if (index < 0 || index >= this.笔记类型列表.length) return;
    const generation: number = ++this.generation;
    this.session.reset(); this.选中类型索引 = index; this.view = null;
    this.fieldOrd = 0; this.加载中 = true; this.错误信息 = '';
    try {
      const view = await this.types.获取编辑笔记类型(this.笔记类型列表[index].id);
      if (!this.alive || generation !== this.generation) return;
      this.view = view;
    } catch (error) {
      if (this.alive && generation === this.generation) this.错误信息 = `${error}`;
    } finally {
      if (this.alive && generation === this.generation) this.加载中 = false;
    }
  }
  private typeOptions(): SelectOption[] {
    return this.笔记类型列表.map((type: NotetypeNameId): SelectOption =>
      ({ value: noteTypeText(this.getUIContext(), type.name) }));
  }
  private fieldOptions(): SelectOption[] {
    const view = this.view;
    if (view === null) return [];
    return view.fieldNames.map((name: string): SelectOption =>
      ({ value: noteFieldText(this.getUIContext(), name, view.originalStockKind ?? 0) }));
  }
  private async execute(): Promise<void> {
    if (this.加载中 || this.scan.busy || this.view === null || this.view.fieldNames.length === 0) return;
    this.resultLimit = 50;
    await this.session.scan({ notetypeId: this.view.id, fieldOrd: this.fieldOrd, search: this.searchScope });
  }
  private jump(group: DuplicateGroup): void {
    // Captured IDs include the selected search scope; text search would match unrelated fields.
    this.onJumpToBrowser(duplicateGroupSearch(group));
  }
  private scanError(_locale: string = this.uiLanguage): string {
    return this.scan.error.startsWith('find_dupes_') ? namedResourceText(this.getUIContext(), this.scan.error) :
      resourceText(this.getUIContext(), $r('app.string.find_dupes_failed'), this.scan.error);
  }

  @Builder
  private headerContent() {
    DialogHeader({ title: $r('app.string.find_dupes_title'),
      actionLabel: this.scan.busy ? $r('app.string.cancel') : $r('app.string.find_dupes_search'),
      actionEnabled: this.scan.busy || (!this.加载中 && this.view !== null && this.view.fieldNames.length > 0),
      closeLabel: $r('app.string.close'), onClose: (): void => { this.close(); },
      onAction: (): void => { if (this.scan.busy) this.session.cancel(); else this.execute(); } })
  }
  @Builder
  private content() {
    if (this.笔记类型列表.length > 0) {
      FormSelectRow({ label: $r('app.string.find_dupes_select_notetype'), options: this.typeOptions(), selectedIndex: this.选中类型索引,
        value: this.选中类型索引 < 0 ? '' : noteTypeText(this.getUIContext(), this.笔记类型列表[this.选中类型索引].name),
        onSelect: (index: number): void => { this.selectType(index); } })
    }
    if (this.view !== null) {
      FormSelectRow({ label: $r('app.string.find_dupes_select_field'), options: this.fieldOptions(), selectedIndex: this.fieldOrd,
        value: noteFieldText(this.getUIContext(), this.view.fieldNames[this.fieldOrd] ?? '', this.view.originalStockKind ?? 0),
        onSelect: (index: number): void => { this.fieldOrd = index; this.session.reset(); } })
    }
    TextInput({ text: this.searchScope, placeholder: $r('app.string.find_dupes_scope') })
      .attributeModifier(new FormInputStyle()).width('100%')
      .onChange((value: string): void => { this.searchScope = value; this.session.reset(); })
    Text($r('app.string.find_dupes_matching_help')).fontSize(应用尺寸.字号_正文_小)
      .fontColor($r('app.color.text_secondary')).width('100%')
    if (this.加载中 || this.scan.busy) {
      Row({ space: 应用尺寸.间距_8 }) {
        LoadingProgress().width(20).height(20).color($r('app.color.action_primary'))
        Text(this.scan.total > 0 ? localizedResourceText(this.getUIContext(), this.uiLanguage, $r('app.string.find_dupes_progress'),
          this.scan.scanned, this.scan.total) : localizedResourceText(this.getUIContext(), this.uiLanguage, $r('app.string.find_dupes_searching')))
          .fontSize(应用尺寸.字号_正文_中).fontColor($r('app.color.text_secondary'))
      }.width('100%')
    }
    if (this.错误信息 !== '' || this.scan.error !== '') {
      Text(this.错误信息 !== '' ? this.错误信息 : this.scanError())
        .fontSize(应用尺寸.字号_正文_中).fontColor($r('app.color.error_text')).width('100%')
      if (!this.scan.busy && this.view === null) {
        按下态按钮({ 文案: $r('app.string.find_dupes_retry'), 点击回调: (): void => { this.loadTypes(); } })
      }
    }
    if (this.scan.cancelled) {
      Text($r('app.string.find_dupes_cancelled')).fontSize(应用尺寸.字号_正文_中)
        .fontColor($r('app.color.text_secondary'))
    }
    if (this.scan.complete) {
      Text(localizedResourceText(this.getUIContext(), this.uiLanguage, $r('app.string.find_dupes_count'), this.scan.groups.length))
        .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary')).width('100%')
      if (this.scan.groups.length === 0) {
        Text($r('app.string.find_dupes_no_duplicates')).fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary'))
      }
      ForEach(this.scan.groups.slice(0, this.resultLimit), (group: DuplicateGroup) => {
        Column({ space: 应用尺寸.间距_4 }) {
          Text(group.value.length > 80 ? group.value.substring(0, 80) + '…' : group.value)
            .fontSize(应用尺寸.字号_正文_中).fontColor($r('app.color.text_primary')).maxLines(2)
          Text(localizedResourceText(this.getUIContext(), this.uiLanguage, $r('app.string.find_dupes_notes_in_group'), group.noteIds.length))
            .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
        }.width('100%').padding(应用尺寸.间距_8).borderRadius(应用尺寸.圆角_面板).border(SurfaceBorder.options())
        .backgroundColor($r('app.color.surface_sidebar')).attributeModifier(new PressFeedback())
        .onClick((): void => { this.jump(group); })
      }, (group: DuplicateGroup): string => `${group.noteIds[0]}`)
      if (this.scan.groups.length > this.resultLimit) {
        按下态按钮({ 文案: $r('app.string.find_dupes_load_more'), 点击回调: (): void => { this.resultLimit += 50; } })
      }
    }
  }
  build() {
    DialogFrame({ onDismiss: (): void => { this.close(); },
      header: () => { this.headerContent(); }, content: () => { this.content(); } })
  }
}
