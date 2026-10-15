// SPDX-License-Identifier: AGPL-3.0-or-later
import { DeckOptionsSession, DeckOptionsSnapshot, DeckOptionsFsrsState } from '../../model/home/DeckOptionsSession';
import { AnkiDeckOptions } from '../../backend/AnkiDeckOptions';
import { 牌组配置表单 } from '../../model/牌组配置表单';
import { 牌组选项编辑 } from '../../model/牌组选项编辑';
import { deckConfigUseCount } from '../../model/DeckConfigSave';
import { deckOptionDefaultValues, DeckOptionDefaultValue } from '../../model/DeckOptionsDefaults';
import { prepareDeckOptionsDraft, DeckOptionsDraft, deckOptionsDraftFingerprint } from '../../model/DeckOptionsDraft';
import { namedResourceText } from '../../utils/UiFeedback';
import { 牌组选项面板 } from '../牌组选项面板';
import { 统一加载态 } from '../common/统一加载态';
import { 统一错误态 } from '../common/统一错误态';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { appInterface } from '../../backend/AppInterfaceService';
import { visibleInterfaceItems } from '../../model/AppInterface';
import type { AppInterfaceControl } from '../../model/AppInterface';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { PAGE_COMPACT_LAYOUT_KEY } from '../../model/AppLayoutState';
import { WINDOW_SAFE_TOP_KEY, WINDOW_SAFE_LEFT_KEY, WINDOW_SAFE_RIGHT_KEY } from '../../model/WindowSafeLayout';

/** 表单和提交状态随功能挂载，首页只持有打开目标与占用事实。 */
@Component
export struct DeckOptionsFeature {
  @StorageProp('系统语言') @Watch('publishInterface') private uiLanguage: string = 'zh-Hans';
  @Prop @Watch('handleBackRequest') backRequest: number = 0;

  private handleBackRequest(): void {
    if (this.showDiscard) { this.showDiscard = false; return; }
    if (this.form === null || this.options === null) this.requestClose();
    else this.panelBackRequest++;
  }

  deckId: number = 0;
  deckName: string = '';
  @Prop isDark: boolean = false;
  onClose: () => void = (): void => {};
  onBusy: (busy: boolean) => void = (_busy: boolean): void => {};
  @State private state: DeckOptionsSnapshot = { phase: 'loading', view: null, config: null, error: '', fsrs: new DeckOptionsFsrsState() };
  @State private form: 牌组配置表单 | null = null;
  @State private options: 牌组选项编辑 | null = null;
  @State private defaultValues: DeckOptionDefaultValue[] = [];
  @State @Watch('publishInterface') private validationError: string = '';
  @State private panelBackRequest: number = 0;
  @State @Watch('publishInterface') private showDiscard: boolean = false;
  @StorageProp('状态栏高度') private statusBarHeight: number = 0;
  @StorageProp(WINDOW_SAFE_TOP_KEY) private safeTop: number = 0;
  @StorageProp(WINDOW_SAFE_LEFT_KEY) private safeLeft: number = 0;
  @StorageProp(WINDOW_SAFE_RIGHT_KEY) private safeRight: number = 0;
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private narrow: boolean = false;
  private initialFingerprint: string = '';
  private session: DeckOptionsSession | null = null;
  private active: boolean = false;

  aboutToAppear(): void {
    this.active = true;
    this.session = new DeckOptionsSession(this.deckId, new AnkiDeckOptions(), (state: DeckOptionsSnapshot): void => {
      this.defaultValues = deckOptionDefaultValues(state.view?.defaults?.config ?? null);
      this.state = state;
      this.onBusy(state.phase === 'saving' || state.fsrs.busy);
      if (state.phase === 'ready' && this.form === null && state.view !== null && state.config?.config !== null && state.config !== null) {
        this.form = 牌组配置表单.从配置创建(state.config.config!);
        const view = state.view;
        this.options = 牌组选项编辑.从视图创建(view.currentDeck === null ? null : view.currentDeck.limits,
          view.newCardsIgnoreReviewLimit, view.fsrs, view.applyAllParentLimits, view.fsrsHealthCheck);
        this.options.sharedDeckCount = deckConfigUseCount(view, state.config.id);
        this.initialFingerprint = this.editFingerprint();
      }
      this.publishInterface();
      if (state.phase === 'saved') this.onClose();
    });
    this.session.load();
  }

  aboutToDisappear(): void {
    this.active = false;
    this.session?.dispose();
    appInterface.leave('deck_options');
    appInterface.leave('deck_options_discard');
  }

  private editFingerprint(): string {
    if (this.form === null || this.options === null || this.state.config === null) return '';
    return deckOptionsDraftFingerprint(prepareDeckOptionsDraft(this.state.config, this.form, this.options),
      this.state.presets ?? [], this.state.presetKey ?? '', this.state.fsrs.batchDraft);
  }

  private requestClose(): void {
    if (!this.active || this.state.phase === 'saving') return;
    const fingerprint: string = this.editFingerprint();
    if (this.form !== null && this.options !== null && (fingerprint === '' || fingerprint !== this.initialFingerprint)) {
      this.showDiscard = true;
    } else this.onClose();
  }

  private discard(): void {
    if (!this.active || !this.showDiscard || this.state.phase === 'saving') return;
    this.showDiscard = false;
    this.onClose();
  }

  private publishInterface(_locale: string = this.uiLanguage): void {
    if (!this.active) return;
    const hasForm: boolean = this.form !== null && this.options !== null;
    const items: AppInterfaceControl[] = visibleInterfaceItems('deck_options',
      { simple: false, agent: false, cloudDeck: false, themeHasTextures: false })
      .filter((item): boolean => hasForm ? item.id === 'form' : item.id === 'close' ||
        (item.id === 'retry' && this.state.phase === 'error'))
      .map((item): AppInterfaceControl => ({ id: item.id, titleKey: item.titleKey,
        title: namedResourceText(this.getUIContext(), item.titleKey), enabled: !this.showDiscard, selected: false }));
    appInterface.observe({ surface: 'deck_options', sectionId: this.state.phase, selectedId: String(this.deckId),
      optionIds: [], optionLabels: [], busy: this.state.phase === 'saving' || this.state.fsrs.busy,
      items: items, controlsComplete: true,
      values: [{ id: 'deckId', value: String(this.deckId) }, { id: 'phase', value: this.state.phase },
        { id: 'presetId', value: this.state.config === null ? '' : String(this.state.config.id) },
        { id: 'has_error', value: String(this.state.error !== '' || this.validationError !== '') },
        { id: 'exit_confirmation_open', value: String(this.showDiscard) },
        { id: 'fsrs_busy', value: String(this.state.fsrs.busy) }] });
    if (this.showDiscard) {
      const controls: AppInterfaceControl[] = visibleInterfaceItems('deck_options_discard',
        { simple: false, agent: false, cloudDeck: false, themeHasTextures: false })
        .map((item): AppInterfaceControl => ({ id: item.id, titleKey: item.titleKey,
          title: namedResourceText(this.getUIContext(), item.titleKey), enabled: this.state.phase !== 'saving', selected: false }));
      appInterface.observe({ surface: 'deck_options_discard', sectionId: '', selectedId: '',
        optionIds: [], optionLabels: [], items: controls, values: [], busy: false, controlsComplete: true });
    } else appInterface.leave('deck_options_discard');
  }

  private calculationDraft(_locale: string = this.uiLanguage): DeckOptionsDraft | null {
    if (!this.active || this.showDiscard || this.form === null || this.options === null || this.state.config === null ||
      this.state.phase !== 'ready' || this.state.fsrs.busy) return null;
    const draft: DeckOptionsDraft = prepareDeckOptionsDraft(this.state.config, this.form, this.options);
    this.validationError = draft.errorKey === '' ? '' : namedResourceText(this.getUIContext(), draft.errorKey);
    return draft.config === null || draft.options === null ? null : draft;
  }

  private async optimize(all: boolean, retry: boolean): Promise<void> {
    const draft: DeckOptionsDraft | null = this.calculationDraft();
    if (draft === null) return;
    try {
      const params: number[] | null = await this.session!.optimize(draft.config!, draft.options!, all, retry);
      if (!this.active || params === null || this.form === null) return;
      // Keep the observed form and any other edits, including field validation state.
      const field: string = params.length === 21 ? 'fsrsParams6' : (params.length === 19 ? 'fsrsParams5' : 'fsrsParams4');
      if (params.length < 21) this.form.设置浮点数组字段('fsrsParams6', '');
      if (params.length < 19) this.form.设置浮点数组字段('fsrsParams5', '');
      if (field === 'fsrsParams6') this.form.设置浮点数组字段('fsrsParams6', params.join(' '));
      else if (field === 'fsrsParams5') this.form.设置浮点数组字段('fsrsParams5', params.join(' '));
      else this.form.设置浮点数组字段('fsrsParams4', params.join(' '));
    } catch (error) {
      if (this.active) this.validationError = (error as Error).message;
    }
  }

  private async evaluate(): Promise<void> {
    const draft: DeckOptionsDraft | null = this.calculationDraft();
    if (draft === null) return;
    try { await this.session!.evaluate(draft.config!); }
    catch (error) { if (this.active) this.validationError = (error as Error).message; }
  }

  private async simulate(days: number): Promise<void> {
    const draft: DeckOptionsDraft | null = this.calculationDraft();
    if (draft === null) return;
    try { await this.session!.simulate(draft.config!, draft.options!, days); }
    catch (error) { if (this.active) this.validationError = (error as Error).message; }
  }

  private editPreset(action: string, value: string): void {
    const draft = this.calculationDraft();
    if (draft === null || this.session === null) return;
    try {
      if (!this.session.editPreset(action, value, draft.config!, draft.shared)) return;
      if (this.state.config?.config === null || this.state.config === null) return;
      this.form = 牌组配置表单.从配置创建(this.state.config.config!);
      if (this.options !== null) {
        this.options.applyToSharedDecks = this.state.presetShared ?? false;
        this.options.sharedDeckCount = this.state.presets?.find((entry): boolean => entry.key === this.state.presetKey)?.useCount ?? 0;
      }
      this.validationError = '';
    } catch (error) { this.validationError = (error as Error).message; }
  }

  private save(form: 牌组配置表单, options: 牌组选项编辑, _locale: string = this.uiLanguage): void {
    if (!this.active || this.showDiscard || this.state.config === null || this.state.phase !== 'ready') return;
    const draft = prepareDeckOptionsDraft(this.state.config, form, options);
    if (draft.config === null || draft.options === null) {
      this.validationError = namedResourceText(this.getUIContext(), draft.errorKey);
      return;
    }
    this.validationError = '';
    this.session?.save(draft.config, draft.shared, draft.options);
  }

  @Builder
  private statusHeader() {
    DialogHeader({ title: $r('app.string.deck_options_title'), showAction: false,
      isPageToolbar: true, showDivider: false,
      closeIcon: $r('app.media.ic_common_arrow_left'), closeLabel: $r('app.string.study_back'),
      onClose: (): void => this.requestClose() })
  }

  @Builder
  private statusBody() {
    if (this.state.phase === 'loading') {
      统一加载态({ 文案: $r('app.string.browser_loading') })
    } else {
      统一错误态({ 文案: this.state.error, onRetry: (): void => { this.session?.load(); } })
    }
  }

  @Builder
  private discardHeader() {
    DialogHeader({ title: $r('app.string.note_editor_discard_title'),
      actionLabel: $r('app.string.note_editor_discard'), destructive: true,
      onClose: (): void => { this.showDiscard = false; }, onAction: (): void => { this.discard(); } })
  }

  @Builder
  private discardBody() {
    Text($r('app.string.deck_options_discard_message')).fontSize(应用尺寸.字号_按钮)
      .fontColor($r('app.color.text_primary')).width('100%')
  }

  build() {
    Stack() {
      if (this.form !== null && this.options !== null) {
        牌组选项面板({ backRequest: this.panelBackRequest, isDark: this.isDark, deckName: this.deckName, form: this.form, options: this.options,
          busy: this.showDiscard || this.state.phase === 'saving' || this.state.fsrs.busy,
          computing: !this.showDiscard && this.state.fsrs.busy,
          fsrsState: this.state.fsrs, errorMessage: this.validationError || this.state.error,
          presets: this.state.presets ?? [], presetKey: this.state.presetKey ?? '',
          presetAssignmentsChanged: this.state.presetAssignmentsChanged ?? false,
          defaultValues: this.defaultValues, customScheduling: this.state.view?.cardStateCustomizer ?? '',
          onPreset: (action: string, value: string): void => { this.editPreset(action, value); },
          onOptimize: (all: boolean, retry: boolean): void => { this.optimize(all, retry); },
          onSimulate: (days: number): void => { this.simulate(days); },
          onEvaluate: (): void => { this.evaluate(); },
          onCancel: (): void => { this.requestClose(); },
          onSave: (form: 牌组配置表单, options: 牌组选项编辑): void => this.save(form, options) })
      } else {
        Column() {
          Column() { this.statusHeader() }.width('100%')
            .padding({ left: this.safeLeft + 应用尺寸.页面内边距_水平,
              right: this.safeRight + 应用尺寸.页面内边距_水平,
              top: 应用尺寸.pageToolbarTop(this.statusBarHeight, this.narrow, this.safeTop) })
          Column() { this.statusBody() }.width('100%').layoutWeight(1).justifyContent(FlexAlign.Center)
        }.width('100%').height('100%')
      }
      if (this.showDiscard) {
        DialogFrame({ header: () => { this.discardHeader(); }, content: () => { this.discardBody(); },
          onDismiss: (): void => { this.showDiscard = false; } })
      }
    }.width('100%').height('100%')
  }

}
