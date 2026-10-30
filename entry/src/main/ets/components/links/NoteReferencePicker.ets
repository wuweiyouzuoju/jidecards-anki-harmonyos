// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { DialogFrame } from '../common/DialogFrame';
import { DialogSearchHeader } from '../common/DialogSearchHeader';
import { IconActionButton } from '../common/IconActionButton';
import { SettingsActionRow } from '../common/SettingsActionRow';
import { 卡片预览页 } from '../browser/卡片预览页';
import { NoteLinkTarget } from '../../model/NoteLinks';
import { noteLinksService } from '../../backend/NoteLinksService';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { resourceText } from '../../utils/UiFeedback';
import { appInterface } from '../../backend/AppInterfaceService';
import { 解析是否深色, 主题模式 } from '../../model/主题设置';

/** 只选择目标和当前引用文字；取消或预览不写入收藏库。 */
@CustomDialog
export struct NoteReferencePicker {
  controller?: CustomDialogController;
  sourceGuid: string = '';
  selectedText: string = '';
  onClose: () => void = (): void => {};
  onApply: (guid: string, label: string) => void = (_guid: string, _label: string): void => {};
  onBackHandlerChange: (handler: (() => boolean) | null) => void = (_handler: (() => boolean) | null): void => {};
  @State private query: string = '';
  @State private rows: NoteLinkTarget[] = [];
  @State private selected: NoteLinkTarget | null = null;
  @State private label: string = '';
  @State private busy: boolean = false;
  @State private error: string = '';
  @State private previewing: boolean = false;
  @StorageProp('themeMode') private theme: 主题模式 = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;
  private mounted: boolean = false;
  private generation: number = 0;
  private previewBack: (() => boolean) | null = null;
  aboutToAppear(): void {
    this.mounted = true; this.label = this.selectedText;
    this.onBackHandlerChange((): boolean => { this.back(); return true; }); this.observe();
  }
  aboutToDisappear(): void {
    this.mounted = false; this.generation++; this.onBackHandlerChange(null); appInterface.leave('note_reference_picker');
  }
  private observe(): void {
    if (!this.mounted) return;
    appInterface.observe({ surface: 'note_reference_picker', sectionId: this.previewing ? 'preview' : 'select',
      selectedId: '', optionIds: [], optionLabels: [], busy: this.busy, controlsComplete: true,
      items: [{ id: 'search', titleKey: 'note_reference_search', title: '', enabled: true, selected: false },
        { id: 'confirm', titleKey: 'browser_detail_confirm', title: '', enabled: !this.busy && this.selected !== null, selected: false },
        { id: 'close', titleKey: 'cancel', title: '', enabled: true, selected: false }],
      values: [{ id: 'result_count', value: String(this.rows.length) }, { id: 'has_selection', value: String(this.selected !== null) }] });
  }
  private queryChanged(value: string): void {
    this.query = value; this.generation++; this.busy = false; this.rows = []; this.selected = null; this.error = ''; this.observe();
  }
  private async search(): Promise<void> {
    if (!this.mounted || this.query.trim() === '') return;
    const generation: number = ++this.generation;
    this.busy = true; this.error = ''; this.observe();
    try {
      const rows: NoteLinkTarget[] = await noteLinksService.search(this.query, this.sourceGuid);
      if (this.mounted && generation === this.generation) this.rows = rows;
    } catch (_error) {
      if (this.mounted && generation === this.generation) this.error = resourceText(this.getUIContext(), $r('app.string.note_links_error'));
    } finally { if (this.mounted && generation === this.generation) { this.busy = false; this.observe(); } }
  }
  private choose(target: NoteLinkTarget): void {
    if (!this.mounted || this.busy || target.guid === this.sourceGuid) return;
    this.selected = target;
    this.label = this.selectedText || target.title || target.guid; this.observe();
  }
  private apply(): void {
    if (!this.mounted || this.busy || this.selected === null || this.label.trim() === '') return;
    this.onApply(this.selected.guid, this.label);
  }
  private back(): void {
    if (!this.mounted) return;
    if (this.previewing) { if (!this.previewBack?.()) { this.previewing = false; this.observe(); } return; }
    this.onClose();
  }
  private mediaDirectory(): string {
    return (this.getUIContext().getHostContext() as common.UIAbilityContext).filesDir + '/collection.media';
  }
  @Builder
  private header() {
    DialogSearchHeader({ title: $r('app.string.note_reference_title'), showAction: true, actionLabel: $r('app.string.browser_detail_confirm'),
      actionEnabled: !this.busy && this.selected !== null && this.label.trim() !== '', onClose: (): void => { this.back(); },
      onAction: (): void => { this.apply(); }, query: this.query, placeholder: $r('app.string.note_links_search_hint'), focusSearch: true,
      onChange: (value: string): void => { this.queryChanged(value); }, onSearch: (): void => { this.search(); } })
  }
  @Builder
  private content() {
    Column({ space: 应用尺寸.间距_8 }) {
      if (this.busy) { LoadingProgress().width(32).height(32) }
      if (this.error !== '') { Text(this.error).fontColor($r('app.color.error_text')).width('100%') }
      ForEach(this.rows, (target: NoteLinkTarget) => {
        SettingsActionRow({ title: target.title || target.guid, showDisclosure: false, isInteractive: !this.busy,
          onAction: (): void => { this.choose(target); } })
          .padding({ left: 应用尺寸.间距_12, right: 应用尺寸.间距_12 })
          .backgroundColor(this.selected?.guid === target.guid ? $r('app.color.surface_selected') : Color.Transparent)
          .borderRadius(应用尺寸.圆角_卡片)
      }, (target: NoteLinkTarget): string => target.guid + target.title)
    }.width('100%')
  }
  @Builder
  private footer() {
    if (this.selected !== null) {
      Column({ space: 应用尺寸.间距_8 }) {
        Text($r('app.string.note_reference_text')).fontColor($r('app.color.text_secondary')).width('100%')
        Row({ space: 应用尺寸.间距_8 }) {
        TextInput({ text: this.label }).attributeModifier(new FormInputStyle())
          .layoutWeight(1)
          .onChange((value: string): void => { this.label = value; })
        IconActionButton({ source: $r('app.media.ic_common_preview'), label: $r('app.string.note_draft_preview'),
          toolbarStyle: true, isInteractive: this.selected.cardIds.length > 0,
          onAction: (): void => { this.previewing = true; this.observe(); } })
        }.width('100%')
      }.width('100%')
    }
  }
  build() {
    Stack() {
      DialogFrame({ nativeHost: true, header: () => { this.header(); }, content: () => { this.content(); },
        showFooter: this.selected !== null, footer: () => { this.footer(); },
        onDismiss: (): void => { this.back(); } })
      if (this.previewing && this.selected !== null) {
        卡片预览页({ 卡片ID列表: this.selected.cardIds, 媒体目录: this.mediaDirectory(), isDark: 解析是否深色(this.theme, this.systemDark), linksReadOnly: true,
          onClose: (): void => { this.previewing = false; this.observe(); },
          onBackHandlerChange: (handler: (() => boolean) | null): void => { this.previewBack = handler; } })
      }
    }.width('100%').height('100%')
  }
}
