// SPDX-License-Identifier: AGPL-3.0-or-later
import { AgentMemoryManager } from '../../model/agent/AgentMemoryManagement';
import type { AgentMemoryRepository } from '../../model/agent/AgentMemoryManagement';
import type { AgentMemory } from '../../model/agent/AgentMemory';
import type { AgentSetupChoice } from './AgentSetupCard';
import { IconActionButton } from '../common/IconActionButton';
import { NativeDialogHost, NativeDialogFactory, NativeDialogDismiss, NativeDialogPresentation } from '../common/NativeDialogHost';
import { AgentMemoryEditorDialog } from './AgentMemoryEditorDialog';
import { MemoryScopeChoice, memoryScopeRows } from '../../model/agent/AgentMemoryScopes';
import { DirectoryView } from '../../model/DirectoryTree';
import { DirectorySelect } from '../common/DirectorySelect';
import { 按下态按钮 } from '../common/按下态按钮';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { FormRowLayout } from '../../utils/FormRowLayout';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { localizedResourceText } from '../../utils/UiFeedback';
import { appInterface } from '../../backend/AppInterfaceService';
import { AppInterfaceControl } from '../../model/AppInterface';
import { PAGE_COMPACT_LAYOUT_KEY } from '../../model/AppLayoutState';

@Component
export struct AgentMemoryPanel {
  @StorageProp('系统语言') @Watch('publishInterface') private uiLanguage: string = 'zh-Hans';
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private narrowDeckLayout: boolean = false;
  repository: AgentMemoryRepository | null = null;
  @Prop @Watch('publishInterface') deckOptions: AgentSetupChoice[] = [];
  @Prop navigationBarHeight: number = 0;
  @Prop @Watch('requestClose') closeRequest: number = 0;
  @Prop @Watch('requestCreate') createRequest: number = 0;
  onClose: () => void = (): void => {};
  onCreateAvailability: (available: boolean) => void = (_available: boolean): void => {};
  private manager: AgentMemoryManager | null = null;
  private alive: boolean = false;
  private baseline: AgentMemory | null = null;
  @State private memories: AgentMemory[] = [];
  @State @Watch('publishInterface') private query: string = '';
  @State @Watch('publishInterface') private filterScope: string = '';
  @State @Watch('publishInterface') private editing: boolean = false;
  @State @Watch('publishInterface') private busy: boolean = false;
  @State @Watch('publishInterface') private loading: boolean = true;
  @State private errorText: string = '';
  @State @Watch('publishInterface') private draftText: string = '';
  @State @Watch('publishInterface') private draftScope: string = 'global';
  @State private saveEnabled: boolean = false;
  @State private editorScopes: MemoryScopeChoice[] = [];
  private readonly editorDialog: NativeDialogHost = new NativeDialogHost();
  private readonly createEditorDialog: NativeDialogFactory = (dismiss: NativeDialogDismiss): CustomDialogController => {
    const presentation: NativeDialogPresentation = this.editorDialog.presentation();
    return new CustomDialogController({
      builder: AgentMemoryEditorDialog({
        title: this.baseline === null ? $r('app.string.ai_agent_memory_create') : $r('app.string.ai_agent_memory_update'),
        options: this.editorScopes, draftText: this.draftText, draftScope: this.draftScope,
        busy: this.busy, errorText: this.errorText, saveEnabled: this.saveEnabled,
        onSave: this.editorDialog.guard((): void => { this.commit(this.baseline, false); }),
        onClose: this.editorDialog.guard((): void => { this.requestClose(); }) }),
      onWillDismiss: dismiss, autoCancel: presentation.autoCancel, customStyle: presentation.customStyle,
      alignment: presentation.alignment, width: presentation.width, height: presentation.height,
      maskColor: presentation.maskColor, openAnimation: presentation.openAnimation, closeAnimation: presentation.closeAnimation
    });
  };

  aboutToAppear(): void {
    this.alive = true;
    this.editorDialog.activate();
    if (this.repository !== null) this.manager = new AgentMemoryManager(this.repository);
    this.publishInterface();
    this.reload();
  }
  aboutToDisappear(): void {
    this.alive = false; this.editorDialog.dispose(); this.manager?.dispose();
    appInterface.leave('agent_memory_editor'); appInterface.leave('agent_memory');
  }
  private text(resource: Resource): string { return localizedResourceText(this.getUIContext(), this.uiLanguage, resource); }
  private scopes(): MemoryScopeChoice[] {
    return [{ value: this.text($r('app.string.ai_agent_memory_global')), scope: 'global' },
      ...this.deckOptions.map((deck: AgentSetupChoice): MemoryScopeChoice => ({ value: deck.name, scope: `deck:${deck.id}` }))];
  }
  private scopeLabel(scope: string): string {
    return this.scopes().find((choice: MemoryScopeChoice): boolean => choice.scope === scope)?.value ??
      this.text($r('app.string.agent_memory_missing_deck'));
  }
  private filterChoices(): MemoryScopeChoice[] {
    return [{ value: this.text($r('app.string.agent_memory_all')), scope: '' }, ...this.scopes()];
  }
  private filtered(): AgentMemory[] {
    const query: string = this.query.trim().toLocaleLowerCase();
    return this.memories.filter((memory: AgentMemory): boolean =>
      (this.filterScope === '' || memory.scope === this.filterScope) && memory.text.toLocaleLowerCase().includes(query));
  }
  private canSave(): boolean {
    return !this.busy && this.draftText.trim().length > 0 && this.draftText.length <= 2000 &&
      this.scopes().some((scope: MemoryScopeChoice): boolean => scope.scope === this.draftScope);
  }
  private publishInterface(): void {
    if (!this.alive) return;
    this.editorScopes = this.scopes();
    this.saveEnabled = this.canSave();
    this.onCreateAvailability(!this.busy && !this.loading && !this.editing);
    const visibleMemories: AgentMemory[] = this.filtered().slice(0, 100);
    const controls: AppInterfaceControl[] = [];
    if (this.editing) {
      appInterface.leave('agent_memory');
      controls.push({ id: 'text', title: '', titleKey: 'agent_memory_example', enabled: !this.busy, selected: false });
      controls.push({ id: 'scope', title: '', titleKey: 'agent_memory_scope', enabled: !this.busy, selected: false });
      controls.push({ id: 'save', title: '', titleKey: 'deck_customize_save', enabled: this.canSave(), selected: false });
      controls.push({ id: 'cancel', title: '', titleKey: 'create_deck_cancel', iconKey: 'ic_common_close', enabled: !this.busy, selected: false });
    } else {
      controls.push({ id: 'search', title: '', titleKey: 'agent_memory_search', enabled: !this.busy, selected: false });
      controls.push({ id: 'filter', title: '', titleKey: 'agent_memory_scope', enabled: !this.busy, selected: false });
      controls.push({ id: 'create', title: '', titleKey: 'ai_agent_memory_create', iconKey: 'ic_home_new',
        enabled: !this.busy && !this.loading, selected: false });
      for (const memory of visibleMemories) {
        controls.push({ id: 'edit-' + memory.id, title: '', titleKey: 'ai_agent_memory_update',
          iconKey: 'ic_study_edit', enabled: !this.busy && !this.loading, selected: false });
        controls.push({ id: 'delete-' + memory.id, title: '', titleKey: 'ai_agent_memory_delete',
          iconKey: 'ic_study_delete', enabled: !this.busy && !this.loading, selected: false });
      }
    }
    appInterface.observe({ surface: this.editing ? 'agent_memory_editor' : 'agent_memory',
      titleKey: this.editing ? (this.baseline === null ? 'ai_agent_memory_create' : 'ai_agent_memory_update') : 'agent_memory_title',
      sectionId: this.editing ? 'editor' : 'list', selectedId: this.baseline?.id ?? '',
      optionIds: this.editing ? [] : visibleMemories.map((memory: AgentMemory): string => memory.id),
      optionLabels: this.editing ? [] : visibleMemories.map((memory: AgentMemory): string => this.scopeLabel(memory.scope)),
      optionsTotal: this.editing ? 0 : this.filtered().length, busy: this.busy || this.loading,
      items: controls, controlsComplete: false,
      values: [{ id: 'scope', value: this.editing ? this.draftScope : this.filterScope }] });
  }
  private async reload(): Promise<void> {
    this.loading = true; this.errorText = '';
    try {
      if (this.manager === null) throw new Error('memory_unavailable');
      const memories: AgentMemory[] | null = await this.manager.load();
      if (this.alive && memories !== null) this.memories = memories;
    } catch (error) {
      if (this.alive) this.errorText = this.text($r('app.string.agent_memory_load_failed'));
    } finally { if (this.alive) { this.loading = false; this.publishInterface(); } }
  }
  private edit(memory: AgentMemory | null): void {
    if (!this.alive || this.busy || this.loading || this.editing) return;
    this.baseline = memory === null ? null : JSON.parse(JSON.stringify(memory)) as AgentMemory;
    this.draftText = memory?.text ?? ''; this.draftScope = memory?.scope ?? 'global';
    this.editing = true; this.errorText = '';
    this.publishInterface();
    try {
      this.editorDialog.open(this.createEditorDialog, (): boolean => { this.requestClose(); return false; });
    } catch (error) {
      this.finishEditing(); this.errorText = this.text($r('app.string.agent_memory_load_failed'));
    }
  }
  private requestCreate(): void { this.edit(null); }
  private finishEditing(): void {
    this.editing = false; this.baseline = null; this.errorText = '';
    this.editorDialog.close(); appInterface.leave('agent_memory_editor'); this.publishInterface();
  }
  private async requestClose(): Promise<void> {
    if (!this.alive || this.busy) return;
    const changed: boolean = this.editing && (this.draftText !== (this.baseline?.text ?? '') ||
      this.draftScope !== (this.baseline?.scope ?? 'global'));
    if (changed) {
      if (!await this.confirm($r('app.string.agent_memory_title'), this.text($r('app.string.agent_memory_discard')),
        $r('app.string.agent_memory_discard_confirm'))) return;
    }
    if (this.editing) this.finishEditing();
    else this.onClose();
  }
  private async confirm(title: Resource, message: string, label: Resource): Promise<boolean> {
    this.busy = true;
    try {
      const result = await this.getUIContext().getPromptAction().showDialog({
        title: this.text(title), message: message,
        buttons: [{ text: this.text($r('app.string.create_deck_cancel')), color: '#666666' },
          { text: this.text(label), color: '#D34D4D' }] });
      return this.alive && result.index === 1;
    } catch (error) { return false; }
    finally { if (this.alive) this.busy = false; }
  }
  private async commit(memory: AgentMemory | null, deleting: boolean): Promise<void> {
    if (this.busy || this.manager === null || (!deleting && !this.canSave())) return;
    this.busy = true; this.errorText = '';
    try {
      await this.manager.commit(memory, deleting ? memory?.text ?? '' : this.draftText,
        deleting ? memory?.scope ?? '' : this.draftScope, `memory-${Date.now()}-${Math.random()}`, deleting);
      if (!this.alive) return;
      if (this.editing) this.finishEditing();
      await this.reload();
    } catch (error) {
      if (this.alive) this.errorText = this.text(error instanceof Error && error.message === 'memory_conflict' ?
        $r('app.string.agent_memory_conflict') : $r('app.string.agent_memory_save_failed'));
    } finally { if (this.alive) this.busy = false; }
  }
  private async remove(memory: AgentMemory): Promise<void> {
    if (this.busy || this.editing) return;
    if (await this.confirm($r('app.string.ai_agent_memory_delete'), memory.text, $r('app.string.ai_agent_memory_delete'))) {
      await this.commit(memory, true);
    }
  }
  build() {
    Scroll() {
      Column({ space: FormRowLayout.rowGap }) {
        Text($r('app.string.agent_memory_description')).fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary')).width('100%')
        if (this.errorText !== '' && !this.editing) {
          Text(this.errorText).fontColor($r('app.color.error_text')).width('100%')
          按下态按钮({ 文案: $r('app.string.common_retry'), 是否启用: !this.busy,
            点击回调: (): void => { this.reload(); } })
        }
        TextInput({ text: this.query, placeholder: this.text($r('app.string.agent_memory_search')) })
          .attributeModifier(new FormInputStyle()).enabled(!this.busy).onChange((value: string): void => { this.query = value; })
        DirectorySelect({ label: $r('app.string.agent_memory_scope'), surfaceColor: $r('app.color.surface_card'),
          rows: memoryScopeRows(this.filterChoices(), this.filterScope),
          value: this.filterScope === '' ? this.text($r('app.string.agent_memory_all')) : this.scopeLabel(this.filterScope),
          isInteractive: !this.busy,
          onSelect: (scope: string): void => {
            if (!this.busy && this.filterChoices().some((choice: MemoryScopeChoice): boolean => choice.scope === scope)) {
              this.filterScope = scope;
            }
          }, onViewChanged: (view: DirectoryView | null): void => { appInterface.observeDirectory('memory_filter_scope', view); } })
        if (this.loading) {
          LoadingProgress().width(应用尺寸.加载指示器尺寸).height(应用尺寸.加载指示器尺寸)
            .color($r('app.color.text_secondary')).alignSelf(ItemAlign.Center)
        }
        else if (this.errorText === '' && this.filtered().length === 0) {
          Text($r('app.string.agent_memory_empty')).fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_secondary')).width('100%').textAlign(TextAlign.Center)
            .padding({ top: 应用尺寸.间距_16, bottom: 应用尺寸.间距_16 })
        }
        ForEach(this.filtered(), (memory: AgentMemory) => {
          Column({ space: 应用尺寸.间距_8 }) {
            Row() {
              IconActionButton({ toolbarStyle: true, source: $r('app.media.ic_study_edit'),
                label: $r('app.string.ai_agent_memory_update'), isInteractive: !this.busy && !this.loading,
                onAction: (): void => { this.edit(memory); } })
              Blank()
              IconActionButton({ toolbarStyle: true, source: $r('app.media.ic_study_delete'),
                label: $r('app.string.ai_agent_memory_delete'), isInteractive: !this.busy && !this.loading,
                onAction: (): void => { this.remove(memory); } })
            }.width('100%')
            Text(memory.text).fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary')).width('100%')
            Text(this.scopeLabel(memory.scope) + ' · ' + new Date(memory.updatedAt).toLocaleString())
              .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
          }.width('100%').padding(应用尺寸.间距_10).backgroundColor($r('app.color.surface_card'))
            .border(SurfaceBorder.options()).borderRadius(应用尺寸.圆角_面板)
        }, (memory: AgentMemory): string => memory.id)
      }.width('100%').alignItems(HorizontalAlign.Start)
        .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平,
          top: 应用尺寸.页面内容顶部间距(this.narrowDeckLayout),
          bottom: 应用尺寸.页面底部间距(this.narrowDeckLayout) + Math.max(0, this.navigationBarHeight) })
    }.width('100%').layoutWeight(1).align(Alignment.TopStart).scrollBar(BarState.Auto).edgeEffect(EdgeEffect.Spring)
  }
}
