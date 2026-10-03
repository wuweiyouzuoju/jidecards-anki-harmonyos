// SPDX-License-Identifier: AGPL-3.0-or-later
import { DeckOptionsSession, DeckOptionsSnapshot, DeckOptionsFsrsState } from '../../model/home/DeckOptionsSession';
import { AnkiDeckOptions } from '../../backend/AnkiDeckOptions';
import { 牌组配置表单 } from '../../model/牌组配置表单';
import { 牌组选项编辑 } from '../../model/牌组选项编辑';
import { deckConfigUseCount } from '../../model/DeckConfigSave';
import { prepareDeckOptionsDraft, DeckOptionsDraft } from '../../model/DeckOptionsDraft';
import { namedResourceText } from '../../utils/UiFeedback';
import { 牌组选项面板 } from '../牌组选项面板';
import { 统一加载态 } from '../common/统一加载态';
import { 统一错误态 } from '../common/统一错误态';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';

/** 表单和提交状态随功能挂载，首页只持有打开目标与占用事实。 */
@Component
export struct DeckOptionsFeature {
  @Prop @Watch('handleBackRequest') backRequest: number = 0;

  private handleBackRequest(): void {
    if (this.form === null || this.options === null) this.onClose();
  }

  deckId: number = 0;
  deckName: string = '';
  @Prop isDark: boolean = false;
  onClose: () => void = (): void => {};
  onBusy: (busy: boolean) => void = (_busy: boolean): void => {};
  @State private state: DeckOptionsSnapshot = { phase: 'loading', view: null, config: null, error: '', fsrs: new DeckOptionsFsrsState() };
  @State private form: 牌组配置表单 | null = null;
  @State private options: 牌组选项编辑 | null = null;
  @State private validationError: string = '';
  private session: DeckOptionsSession | null = null;
  private active: boolean = false;

  aboutToAppear(): void {
    this.active = true;
    this.session = new DeckOptionsSession(this.deckId, new AnkiDeckOptions(), (state: DeckOptionsSnapshot): void => {
      this.state = state;
      this.onBusy(state.phase === 'saving' || state.fsrs.busy);
      if (state.phase === 'ready' && this.form === null && state.view !== null && state.config?.config !== null && state.config !== null) {
        this.form = 牌组配置表单.从配置创建(state.config.config!);
        const view = state.view;
        this.options = 牌组选项编辑.从视图创建(view.currentDeck === null ? null : view.currentDeck.limits,
          view.newCardsIgnoreReviewLimit, view.fsrs, view.applyAllParentLimits, view.fsrsHealthCheck);
        this.options.sharedDeckCount = deckConfigUseCount(view, state.config.id);
      }
      if (state.phase === 'saved') this.onClose();
    });
    this.session.load();
  }

  aboutToDisappear(): void { this.active = false; this.session?.dispose(); }

  private calculationDraft(): DeckOptionsDraft | null {
    if (this.form === null || this.options === null || this.state.config === null ||
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

  private async simulate(days: number): Promise<void> {
    const draft: DeckOptionsDraft | null = this.calculationDraft();
    if (draft === null) return;
    try { await this.session!.simulate(draft.config!, draft.options!, days); }
    catch (error) { if (this.active) this.validationError = (error as Error).message; }
  }

  private save(form: 牌组配置表单, options: 牌组选项编辑): void {
    if (this.state.config === null || this.state.phase !== 'ready') return;
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
      onClose: (): void => this.onClose() })
  }

  @Builder
  private statusBody() {
    if (this.state.phase === 'loading') {
      统一加载态({ 文案: $r('app.string.browser_loading') })
    } else {
      统一错误态({ 文案: this.state.error, onRetry: (): void => { this.session?.load(); } })
    }
  }

  build() {
    if (this.form !== null && this.options !== null) {
      牌组选项面板({ backRequest: this.backRequest, isDark: this.isDark, deckName: this.deckName, form: this.form, options: this.options,
        busy: this.state.phase === 'saving' || this.state.fsrs.busy, computing: this.state.fsrs.busy,
        fsrsState: this.state.fsrs, errorMessage: this.validationError || this.state.error,
        onOptimize: (all: boolean, retry: boolean): void => { this.optimize(all, retry); },
        onSimulate: (days: number): void => { this.simulate(days); },
        onCancel: (): void => { if (this.state.phase !== 'saving') this.onClose(); },
        onSave: (form: 牌组配置表单, options: 牌组选项编辑): void => this.save(form, options) })
    } else {
      DialogFrame({ header: () => { this.statusHeader(); }, content: () => { this.statusBody(); }, onDismiss: (): void => this.onClose() })
    }
  }
}
