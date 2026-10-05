// SPDX-License-Identifier: AGPL-3.0-or-later
import { DeckHierarchyCommands } from '../../backend/DeckHierarchyCommands';
import { 牌组服务 } from '../../backend/牌组服务';
import { appInterface } from '../../backend/AppInterfaceService';
import { deckHierarchyEntries, planDeckReparent } from '../../model/DeckReparent';
import type { AppInterfaceControl } from '../../model/AppInterface';
import type { DeckHierarchyEntry, DeckReparentPlan, DeckPathChange } from '../../model/DeckReparent';
import type { DeckTreeNode } from '../../proto/messages/DeckMessages';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { FormSelectRow } from '../common/FormSelectRow';
import { 按下态按钮 } from '../common/按下态按钮';
import { 统一加载态 } from '../common/统一加载态';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { resourceText, namedResourceText, showToastSafely } from '../../utils/UiFeedback';
import { interfaceItemText } from '../../utils/AppInterfaceText';

/** 拥有选择与预览；写入接受后由公共命令完成，离页只停止界面回写。 */
@Component
export struct DeckReparentFeature {
  @StorageProp('系统语言') @Watch('publishInterface') private uiLanguage: string = 'zh-Hans';
  @Prop deckId: number = 0;
  @Prop @Watch('handleBackRequest') backRequest: number = 0;
  onBusy: (busy: boolean) => void = (): void => {};
  onClose: () => void = (): void => {};
  onSaved: () => Promise<void> = async (): Promise<void> => {};
  @State private loading: boolean = true;
  @State private saving: boolean = false;
  @State private parentId: number = 0;
  @State private entries: DeckHierarchyEntry[] = [];
  @State private plan: DeckReparentPlan | null = null;
  @State private errorCode: string = '';
  private tree: DeckTreeNode | null = null;
  private disposed: boolean = false;
  private readonly commands: DeckHierarchyCommands = new DeckHierarchyCommands();

  aboutToAppear(): void { this.load(); }
  aboutToDisappear(): void { this.disposed = true; appInterface.leave('deck_move'); }
  private handleBackRequest(): void { if (!this.saving) this.onClose(); }

  private candidates(): DeckHierarchyEntry[] {
    return this.entries.filter((entry: DeckHierarchyEntry): boolean => !entry.filtered && entry.id !== this.deckId &&
      entry.ancestors.indexOf(this.deckId) < 0);
  }

  private candidateIds(): number[] { return [0].concat(this.candidates().map((entry: DeckHierarchyEntry): number => entry.id)); }

  private options(_locale: string = this.uiLanguage): SelectOption[] {
    const result: SelectOption[] = [{ value: resourceText(this.getUIContext(), $r('app.string.top_level_deck')) }];
    for (const entry of this.candidates()) result.push({ value: entry.path });
    return result;
  }

  private publishInterface(): void {
    if (this.disposed) return;
    const ids: number[] = this.candidateIds();
    const controls: AppInterfaceControl[] = [
      { id: 'parent', titleKey: 'deck_move_parent', title: interfaceItemText(this.getUIContext(), 'deck_move', 'parent', this.uiLanguage),
        enabled: !this.loading && !this.saving && this.tree !== null, selected: false },
      { id: 'confirm', titleKey: 'deck_move_confirm', title: interfaceItemText(this.getUIContext(), 'deck_move', 'confirm', this.uiLanguage),
        enabled: !this.loading && !this.saving && this.plan !== null, selected: false },
      { id: 'cancel', titleKey: 'cancel', title: interfaceItemText(this.getUIContext(), 'deck_move', 'cancel', this.uiLanguage),
        enabled: !this.saving, selected: false }
    ];
    if (this.errorCode !== '') controls.push({ id: 'reload', titleKey: 'deck_move_reload',
      title: interfaceItemText(this.getUIContext(), 'deck_move', 'reload', this.uiLanguage),
      enabled: !this.loading && !this.saving, selected: false });
    appInterface.observe({ surface: 'deck_move', sectionId: '', selectedId: String(this.parentId),
      optionIds: ids.map((id: number): string => String(id)),
      optionLabels: this.options().map((option: SelectOption): string => String(option.value)),
      optionsTotal: ids.length, busy: this.loading || this.saving, controlsComplete: true,
      items: controls,
      values: [{ id: 'deck_id', value: String(this.deckId) },
        { id: 'affected_decks', value: String(this.plan?.changes.length ?? 0) }] });
  }

  private async load(): Promise<void> {
    if (this.disposed || this.saving) return;
    this.loading = true;
    this.plan = null;
    this.errorCode = '';
    this.publishInterface();
    try {
      const tree: DeckTreeNode = await new 牌组服务().获取牌组树();
      if (this.disposed) return;
      const entries: DeckHierarchyEntry[] = deckHierarchyEntries(tree);
      const source: DeckHierarchyEntry | undefined = entries.find((entry: DeckHierarchyEntry): boolean => entry.id === this.deckId);
      if (source === undefined) throw new Error('deck_move_missing');
      this.tree = tree;
      this.entries = entries;
      this.parentId = source.parentId;
    } catch (error) {
      if (!this.disposed) { this.tree = null; this.errorCode = error instanceof Error ? error.message : 'deck_move_failed'; }
    } finally {
      if (!this.disposed) { this.loading = false; this.publishInterface(); }
    }
  }

  private select(index: number): void {
    if (this.loading || this.saving || this.tree === null || this.disposed) return;
    const ids: number[] = this.candidateIds();
    if (!Number.isInteger(index) || index < 0 || index >= ids.length) return;
    this.parentId = ids[index];
    this.plan = null;
    this.errorCode = '';
    try { this.plan = planDeckReparent(this.tree, [this.deckId], this.parentId); }
    catch (error) { this.errorCode = error instanceof Error ? error.message : 'deck_move_failed'; }
    this.publishInterface();
  }

  private errorText(_locale: string = this.uiLanguage): string {
    const known: string[] = ['deck_move_invalid_ids', 'deck_move_missing', 'deck_move_filtered_parent',
      'deck_move_cycle', 'deck_move_unchanged', 'deck_move_conflict', 'deck_move_stale', 'deck_move_sync_busy'];
    return namedResourceText(this.getUIContext(), known.indexOf(this.errorCode) >= 0 ? this.errorCode : 'deck_move_failed');
  }

  private async save(): Promise<void> {
    if (this.loading || this.saving || this.disposed || this.plan === null) return;
    const accepted: DeckReparentPlan = this.plan;
    this.saving = true;
    this.onBusy(true);
    this.errorCode = '';
    this.publishInterface();
    try {
      await this.commands.execute(accepted);
      AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
      if (this.disposed) return;
      // 写入已完成；刷新失败不能恢复成可以重复提交的表单。
      this.plan = null;
      try { await this.onSaved(); }
      catch (error) { if (!this.disposed) showToastSafely(this.getUIContext(), { message: $r('app.string.deck_move_refresh_failed') }); }
      if (!this.disposed) this.onClose();
    } catch (error) {
      if (!this.disposed) { this.plan = null; this.errorCode = error instanceof Error ? error.message : 'deck_move_failed'; }
    } finally {
      if (!this.disposed) { this.saving = false; this.onBusy(false); this.publishInterface(); }
    }
  }

  @Builder
  private header() {
    DialogHeader({ title: $r('app.string.deck_move_title'), actionLabel: $r('app.string.deck_move_confirm'),
      actionEnabled: !this.loading && !this.saving && this.plan !== null, closeEnabled: !this.saving,
      onAction: (): void => { this.save(); }, onClose: (): void => { this.handleBackRequest(); } })
  }

  @Builder
  private content() {
    Text($r('app.string.deck_move_hint')).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
    FormSelectRow({ label: $r('app.string.deck_move_parent'), options: this.options(),
      selectedIndex: this.candidateIds().indexOf(this.parentId),
      value: this.options()[Math.max(0, this.candidateIds().indexOf(this.parentId))].value as string,
      isInteractive: !this.loading && !this.saving && this.tree !== null, onSelect: (index: number): void => { this.select(index); } })
    if (this.loading) {
      统一加载态().height(应用尺寸.加载指示器尺寸 + 应用尺寸.按钮高度)
    }
    if (this.plan !== null) {
      ForEach(this.plan.changes, (change: DeckPathChange) => {
        Text(`${change.before} → ${change.after}`).fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_primary')).width('100%')
      }, (change: DeckPathChange): string => String(change.id))
    }
    if (this.errorCode !== '') {
      Text(this.errorText()).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text')).width('100%')
      按下态按钮({ 文案: $r('app.string.deck_move_reload'), 是否启用: !this.loading && !this.saving,
        点击回调: (): void => { this.load(); } })
    }
  }

  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogMaxWidth, canDismiss: !this.saving,
      header: () => { this.header(); }, content: () => { this.content(); },
      onDismiss: (): void => { this.handleBackRequest(); } })
  }
}
