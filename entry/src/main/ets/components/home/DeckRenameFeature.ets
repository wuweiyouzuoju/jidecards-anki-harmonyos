// SPDX-License-Identifier: AGPL-3.0-or-later
import { DeckHierarchyCommands } from '../../backend/DeckHierarchyCommands';
import { 牌组服务 } from '../../backend/牌组服务';
import { appInterface } from '../../backend/AppInterfaceService';
import { deckHierarchyEntries } from '../../model/DeckReparent';
import type { DeckPathChange } from '../../model/DeckReparent';
import { planDeckRename } from '../../model/DeckRename';
import type { DeckRenamePlan } from '../../model/DeckRename';
import type { DeckTreeNode } from '../../proto/messages/DeckMessages';
import type { AppInterfaceControl } from '../../model/AppInterface';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { 按下态按钮 } from '../common/按下态按钮';
import { 统一加载态 } from '../common/统一加载态';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { namedResourceText, showToastSafely } from '../../utils/UiFeedback';
import { interfaceItemText } from '../../utils/AppInterfaceText';

/** 草稿与预览归面板；确认后的写入归公共命令，离页不取消已接受的 Core 操作。 */
@Component
export struct DeckRenameFeature {
  @StorageProp('系统语言') @Watch('publishInterface') private uiLanguage: string = 'zh-Hans';
  @Prop deckId: number = 0;
  @Prop localDisplayName: string = '';
  @Prop @Watch('handleBackRequest') backRequest: number = 0;
  onBusy: (busy: boolean) => void = (): void => {};
  onClose: () => void = (): void => {};
  onSaved: () => Promise<void> = async (): Promise<void> => {};
  @State private loading: boolean = true;
  @State private saving: boolean = false;
  @State private name: string = '';
  @State private plan: DeckRenamePlan | null = null;
  @State private errorCode: string = '';
  private tree: DeckTreeNode | null = null;
  private disposed: boolean = false;
  private generation: number = 0;
  private readonly commands: DeckHierarchyCommands = new DeckHierarchyCommands();

  aboutToAppear(): void { this.load(true); }
  aboutToDisappear(): void { this.disposed = true; this.generation++; appInterface.leave('deck_rename'); }
  private handleBackRequest(): void { if (!this.saving) this.onClose(); }

  private publishInterface(): void {
    if (this.disposed) return;
    const controls: AppInterfaceControl[] = [
      { id: 'name', titleKey: 'deck_rename_name', title: '', enabled: !this.loading && !this.saving && this.tree !== null, selected: false },
      { id: 'confirm', titleKey: 'deck_rename_confirm', title: '', enabled: !this.loading && !this.saving && this.plan !== null, selected: false },
      { id: 'cancel', titleKey: 'cancel', title: '', enabled: !this.saving, selected: false }
    ];
    if (this.errorCode !== '') controls.push({ id: 'reload', titleKey: 'common_retry', title: '', enabled: !this.loading && !this.saving, selected: false });
    appInterface.observe({ surface: 'deck_rename', sectionId: '', selectedId: String(this.deckId),
      optionIds: [], optionLabels: [], busy: this.loading || this.saving, controlsComplete: true, items: controls,
      values: [{ id: 'deck_id', value: String(this.deckId) }, { id: 'name', value: this.name },
        { id: 'local_display_name', value: this.localDisplayName }, { id: 'affected_decks', value: String(this.plan?.changes.length ?? 0) }] });
  }

  private async load(resetName: boolean): Promise<void> {
    if (this.disposed || this.saving) return;
    const generation: number = ++this.generation;
    this.loading = true; this.plan = null; this.errorCode = ''; this.publishInterface();
    try {
      const tree: DeckTreeNode = await new 牌组服务().获取牌组树();
      if (this.disposed || generation !== this.generation) return;
      const source = deckHierarchyEntries(tree).find((entry): boolean => entry.id === this.deckId);
      if (source === undefined) throw new Error('deck_rename_missing');
      this.tree = tree;
      if (resetName) this.name = source.name;
      this.updatePlan();
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        this.tree = null; this.errorCode = error instanceof Error ? error.message : 'deck_rename_failed';
      }
    } finally {
      if (!this.disposed && generation === this.generation) { this.loading = false; this.publishInterface(); }
    }
  }

  private updatePlan(): void {
    this.plan = null; this.errorCode = '';
    if (this.tree === null) return;
    try { this.plan = planDeckRename(this.tree, this.deckId, this.name); }
    catch (error) {
      const code: string = error instanceof Error ? error.message : 'deck_rename_failed';
      if (code !== 'deck_rename_unchanged') this.errorCode = code;
    }
  }

  private changeName(value: string): void {
    if (this.loading || this.saving || this.disposed) return;
    this.name = value; this.updatePlan(); this.publishInterface();
  }

  private errorText(_locale: string = this.uiLanguage): string {
    const known: string[] = ['deck_rename_invalid', 'deck_rename_missing', 'deck_rename_unchanged',
      'deck_rename_conflict', 'deck_rename_stale', 'deck_move_sync_busy'];
    return namedResourceText(this.getUIContext(), known.includes(this.errorCode) ? this.errorCode : 'deck_rename_failed');
  }

  private async save(): Promise<void> {
    if (this.loading || this.saving || this.disposed || this.plan === null) return;
    const accepted: DeckRenamePlan = this.plan;
    this.saving = true; this.errorCode = ''; this.onBusy(true); this.publishInterface();
    try {
      await this.commands.executeRename(accepted);
      AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
      if (this.disposed) return;
      this.plan = null;
      try { await this.onSaved(); }
      catch (error) { if (!this.disposed) showToastSafely(this.getUIContext(), { message: $r('app.string.deck_rename_refresh_failed') }); }
      if (!this.disposed) this.onClose();
    } catch (error) {
      if (!this.disposed) {
        this.plan = null; this.tree = null; this.errorCode = error instanceof Error ? error.message : 'deck_rename_failed';
      }
    } finally {
      if (!this.disposed) { this.saving = false; this.onBusy(false); this.publishInterface(); }
    }
  }

  @Builder
  private header() {
    DialogHeader({ title: $r('app.string.deck_rename_title'), actionLabel: $r('app.string.deck_rename_confirm'),
      actionEnabled: !this.loading && !this.saving && this.plan !== null, closeEnabled: !this.saving,
      onAction: (): void => { this.save(); }, onClose: (): void => { this.handleBackRequest(); } })
  }

  @Builder
  private content() {
    Text($r('app.string.deck_rename_hint')).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
    Text(interfaceItemText(this.getUIContext(), 'deck_rename', 'name', this.uiLanguage))
      .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
    TextInput({ text: this.name }).attributeModifier(new FormInputStyle()).maxLength(200)
      .enabled(!this.loading && !this.saving && this.tree !== null)
      .onChange((value: string): void => { this.changeName(value); })
    if (this.localDisplayName !== '') {
      Text($r('app.string.deck_rename_alias_hint', this.localDisplayName)).fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary')).width('100%')
    }
    if (this.loading) { 统一加载态().height(应用尺寸.加载指示器尺寸 + 应用尺寸.按钮高度) }
    if (this.plan !== null) {
      ForEach(this.plan.changes, (change: DeckPathChange) => {
        Text(`${change.before} → ${change.after}`).fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary')).width('100%')
      }, (change: DeckPathChange): string => String(change.id))
    }
    if (this.errorCode !== '') {
      Text(this.errorText()).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text')).width('100%')
      按下态按钮({ 文案: $r('app.string.common_retry'), 是否启用: !this.loading && !this.saving,
        点击回调: (): void => { this.load(false); } })
    }
  }

  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogMaxWidth, canDismiss: !this.saving,
      header: () => { this.header(); }, content: () => { this.content(); },
      onDismiss: (): void => { this.handleBackRequest(); } })
  }
}
