// SPDX-License-Identifier: AGPL-3.0-or-later
import { DeckOptionsSession, DeckOptionsSnapshot } from '../../model/home/DeckOptionsSession';
import { AnkiDeckOptions } from '../../backend/AnkiDeckOptions';
import { 牌组配置表单 } from '../../model/牌组配置表单';
import { 牌组选项编辑 } from '../../model/牌组选项编辑';
import { deckConfigUseCount } from '../../model/DeckConfigSave';
import { prepareDeckOptionsDraft } from '../../model/DeckOptionsDraft';
import { namedResourceText } from '../../utils/UiFeedback';
import { 牌组选项面板 } from '../牌组选项面板';
import { 统一加载态 } from '../common/统一加载态';
import { 统一错误态 } from '../common/统一错误态';
import { DialogHeader } from '../common/DialogHeader';

/** 表单和提交状态随功能挂载，首页只持有打开目标与占用事实。 */
@Component
export struct DeckOptionsFeature {
  deckId: number = 0;
  deckName: string = '';
  @Prop isDark: boolean = false;
  onClose: () => void = (): void => {};
  onBusy: (busy: boolean) => void = (_busy: boolean): void => {};
  @State private state: DeckOptionsSnapshot = { phase: 'loading', view: null, config: null, error: '' };
  @State private form: 牌组配置表单 | null = null;
  @State private options: 牌组选项编辑 | null = null;
  @State private validationError: string = '';
  private session: DeckOptionsSession | null = null;

  aboutToAppear(): void {
    this.session = new DeckOptionsSession(this.deckId, new AnkiDeckOptions(), (state: DeckOptionsSnapshot): void => {
      this.state = state;
      this.onBusy(state.phase === 'loading' || state.phase === 'saving');
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

  aboutToDisappear(): void { this.session?.dispose(); }

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

  build() {
    if (this.form !== null && this.options !== null) {
      牌组选项面板({ isDark: this.isDark, deckName: this.deckName, form: this.form, options: this.options,
        busy: this.state.phase === 'saving', errorMessage: this.validationError || this.state.error,
        onCancel: (): void => { if (this.state.phase !== 'saving') this.onClose(); },
        onSave: (form: 牌组配置表单, options: 牌组选项编辑): void => this.save(form, options) })
    } else {
      Column() {
        DialogHeader({ title: $r('app.string.deck_options_title'), onClose: (): void => this.onClose() })
        if (this.state.phase === 'loading') {
          统一加载态({ 文案: $r('app.string.browser_loading') })
        } else {
          统一错误态({ 文案: this.state.error, onRetry: (): void => { this.session?.load(); } })
        }
      }.width('100%').height('100%').backgroundColor($r('app.color.surface_page'))
    }
  }
}
