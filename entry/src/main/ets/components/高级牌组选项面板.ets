// SPDX-License-Identifier: AGPL-3.0-or-later
import { DeckOptionField, DeckOptionChoice } from './home/DeckOptionField';
import { FsrsTools } from './home/FsrsTools';
import { DeckOptionsFsrsState } from '../model/home/DeckOptionsSession';
import { 牌组配置表单 } from '../model/牌组配置表单';
import { 牌组选项编辑 } from '../model/牌组选项编辑';
import { applyDeckOptionEdit } from '../model/DeckOptionsEdit';
import { validateDeckOptionText } from '../model/DeckOptionValidation';
import { DECK_OPTION_GROUPS, visibleDeckOptionFields, deckOptionChoices, compatibleNewSortOrder,
  easyDayValues, updateEasyDay, percentageText, percentageValue } from '../model/DeckOptionsCatalog';
import type { DeckOptionDefinition, DeckOptionGroup, DeckOptionEnumChoice } from '../model/DeckOptionsCatalog';
import type { DeckConfigSettings } from '../proto/messages/DeckConfigMessages';
import { fsrsParams } from '../model/FsrsOptions';
import { appInterface } from '../backend/AppInterfaceService';
import type { AppInterfaceControl, AppInterfaceValue } from '../model/AppInterface';
import { namedResourceText } from '../utils/UiFeedback';
import { 应用尺寸 } from '../utils/应用尺寸';

/** 完整模式内嵌所有官方分组；与简洁模式共用同一草稿和唯一保存入口。 */
@Component
export struct 高级牌组选项面板 {
  @StorageProp('系统语言') @Watch('publishInterface') private uiLanguage: string = 'zh-Hans';
  @ObjectLink @Watch('publishInterface') form: 牌组配置表单;
  @ObjectLink @Watch('publishInterface') options: 牌组选项编辑;
  @Prop @Watch('publishInterface') busy: boolean = false;
  @Prop defaults: DeckConfigSettings | null = null;
  @Prop customScheduling: string = '';
  @Prop fsrsState: DeckOptionsFsrsState = new DeckOptionsFsrsState();
  @Prop presetAssignmentsChanged: boolean = false;
  onOptimize: (all: boolean, retry: boolean) => void = (): void => {};
  onSimulate: (days: number) => void = (): void => {};
  onEvaluate: () => void = (): void => {};
  @State @Watch('publishInterface') private newScope: number = 0;
  @State @Watch('publishInterface') private reviewScope: number = 0;
  @State @Watch('publishInterface') private retentionScope: number = 0;
  @State private editRevision: number = 0;
  private mounted: boolean = false;

  aboutToAppear(): void { this.mounted = true; this.publishInterface(); }
  aboutToDisappear(): void {
    this.mounted = false;
    for (const group of DECK_OPTION_GROUPS) appInterface.leave('deck_options_group_' + group.id);
  }
  private text(key: string): string { return namedResourceText(this.getUIContext(), key); }
  private fields(group: DeckOptionGroup): DeckOptionDefinition[] {
    const revision: number = this.editRevision;
    return visibleDeckOptionFields(group, this.options.是否启用FSRS);
  }
  private scope(key: string): number { return key === 'newPerDay' ? this.newScope : key === 'reviewsPerDay' ? this.reviewScope : this.retentionScope; }
  private scopedKey(key: string): string {
    const scope = this.scope(key);
    if (scope === 0) return key;
    if (key === 'desiredRetention') return 'desiredRetentionOverride';
    if (key === 'newPerDay') return scope === 1 ? 'newLimit' : 'newToday';
    return scope === 1 ? 'reviewLimit' : 'reviewToday';
  }
  private rawValue(key: string): string {
    switch (this.scopedKey(key)) {
      case 'newPerDay': return this.form.每日新卡数文本;
      case 'reviewsPerDay': return this.form.每日复习数文本;
      case 'desiredRetention': return this.form.目标保留率文本;
      case 'newLimit': return this.options.新卡限额文本;
      case 'reviewLimit': return this.options.复习限额文本;
      case 'newToday': return this.options.今日新卡启用 ? this.options.今日新卡文本 : '';
      case 'reviewToday': return this.options.今日复习启用 ? this.options.今日复习文本 : '';
      case 'desiredRetentionOverride': return this.options.目标保留率覆盖文本;
      case 'learnSteps': return this.form.学习步骤文本;
      case 'relearnSteps': return this.form.重学步骤文本;
      case 'fsrsParameters': return fsrsParams(this.form.取配置()).join(' ');
      case 'paramSearch': return this.form.取配置().paramSearch;
      case 'ignoreRevlogsBeforeDate': return this.form.取配置().ignoreRevlogsBeforeDate;
      case 'customScheduling': return this.customScheduling;
      default: return this.form.取字段文本值(key as keyof DeckConfigSettings);
    }
  }
  private booleanValue(key: string): boolean {
    const config = this.form.取配置();
    switch (key) {
      case 'fsrsEnabled': return this.options.是否启用FSRS;
      case 'fsrsReschedule': return this.options.FSRS重排;
      case 'fsrsHealthCheck': return this.options.FSRS健康检查;
      case 'newCardsIgnoreReviewLimit': return this.options.新卡忽略复习限额;
      case 'applyAllParentLimits': return this.options.应用所有父级限额;
      case 'buryNew': return config.buryNew;
      case 'buryReviews': return config.buryReviews;
      case 'buryInterdayLearning': return config.buryInterdayLearning;
      case 'disableAutoplay': return config.disableAutoplay;
      case 'skipQuestionWhenReplayingAnswer': return config.skipQuestionWhenReplayingAnswer;
      case 'waitForAudio': return config.waitForAudio;
      case 'showTimer': return config.showTimer;
      case 'stopTimerOnAnswer': return config.stopTimerOnAnswer;
      default: return false;
    }
  }
  private value(field: DeckOptionDefinition): string {
    if (field.kind === 'boolean' || field.kind === 'global') return String(this.booleanValue(field.key));
    return field.kind === 'percentage' ? percentageText(this.rawValue(field.key)) : this.rawValue(field.key);
  }
  private choices(field: DeckOptionDefinition): DeckOptionChoice[] {
    if (field.kind === 'boolean' || field.kind === 'global') return [
      { label: $r('app.string.deck_option_off'), value: 'false' }, { label: $r('app.string.deck_option_on'), value: 'true' }];
    return deckOptionChoices(field.key, this.options.是否启用FSRS, this.form.取配置().newCardGatherPriority)
      .map((item: DeckOptionEnumChoice): DeckOptionChoice => ({ label: this.text(item.titleKey), value: String(item.value) }));
  }
  private validate(field: DeckOptionDefinition, text: string): string {
    let key = this.scopedKey(field.key);
    const raw = field.kind === 'percentage' ? percentageValue(text) : text;
    if (field.kind === 'params') key = raw.trim() === '' || raw.trim().split(/\s+/).length === 21 ? 'fsrsParams6' :
      raw.trim().split(/\s+/).length === 19 ? 'fsrsParams5' : 'fsrsParams4';
    const error = validateDeckOptionText(this.form, key, raw);
    return error === '' ? '' : this.text(error);
  }
  private change(field: DeckOptionDefinition, text: string): void {
    if (this.busy) return;
    const key = this.scopedKey(field.key);
    const raw = field.kind === 'percentage' ? percentageValue(text) : text;
    applyDeckOptionEdit(this.form, this.options, key, raw, field.kind);
    this.editRevision++;
    this.publishInterface();
  }
  private defaultValue(field: DeckOptionDefinition): string | undefined {
    if (field.key === 'customScheduling') return undefined;
    if (['newPerDay', 'reviewsPerDay', 'desiredRetention'].includes(field.key) && this.scope(field.key) !== 0) return '';
    if (this.defaults === null) return undefined;
    const form = 牌组配置表单.从配置创建(this.defaults);
    let text = form.取字段文本值(field.key as keyof DeckConfigSettings);
    if (field.key === 'learnSteps') text = form.学习步骤文本;
    if (field.key === 'relearnSteps') text = form.重学步骤文本;
    if (field.kind === 'params') text = fsrsParams(this.defaults).join(' ');
    if (field.kind === 'text') text = field.key === 'paramSearch' ? this.defaults.paramSearch : this.defaults.ignoreRevlogsBeforeDate;
    if (field.kind === 'global') return field.key === 'fsrsHealthCheck' ? 'true' : 'false';
    if (field.kind === 'boolean') {
      const config = this.defaults;
      switch (field.key) {
        case 'buryNew': return String(config.buryNew);
        case 'buryReviews': return String(config.buryReviews);
        case 'buryInterdayLearning': return String(config.buryInterdayLearning);
        case 'disableAutoplay': return String(config.disableAutoplay);
        case 'skipQuestionWhenReplayingAnswer': return String(config.skipQuestionWhenReplayingAnswer);
        case 'waitForAudio': return String(config.waitForAudio);
        case 'showTimer': return String(config.showTimer);
        case 'stopTimerOnAnswer': return String(config.stopTimerOnAnswer);
      }
    }
    return field.kind === 'percentage' ? percentageText(text) : text;
  }
  private publishInterface(): void {
    if (!this.mounted) return;
    for (const group of DECK_OPTION_GROUPS) {
      const items: AppInterfaceControl[] = this.fields(group).map((field: DeckOptionDefinition): AppInterfaceControl =>
        ({ id: field.key, titleKey: field.titleKey, title: this.text(field.titleKey), enabled: !this.busy && field.kind !== 'unsupported', selected: false }));
      const values: AppInterfaceValue[] = [{ id: 'scheduler', value: this.options.是否启用FSRS ? 'fsrs' : 'sm2' },
        { id: 'has_validation_errors', value: String(this.form.校验().length !== 0 || this.options.校验().length !== 0) }];
      if (group.id === 'daily_limits') {
        values.push({ id: 'new_limit_scope', value: String(this.newScope) }, { id: 'review_limit_scope', value: String(this.reviewScope) });
      }
      appInterface.observe({ surface: 'deck_options_group_' + group.id, sectionId: group.id, selectedId: '', optionIds: [], optionLabels: [],
        items: items, values: values, busy: this.busy, controlsComplete: false });
    }
  }
  private scopeChoices(key: string): DeckOptionChoice[] {
    const choices: DeckOptionChoice[] = [{ label: $r('app.string.deck_scope_preset'), value: '0' }, { label: $r('app.string.deck_scope_deck'), value: '1' }];
    if (key !== 'desiredRetention') choices.push({ label: $r('app.string.deck_scope_today'), value: '2' });
    return choices;
  }
  private dayChoices(): DeckOptionChoice[] { return [
    { label: $r('app.string.deck_easy_day_minimum'), value: '0' }, { label: $r('app.string.deck_easy_day_reduced'), value: '0.5' },
    { label: $r('app.string.deck_easy_day_normal'), value: '1' }]; }
  private dayValue(day: number): string {
    const value = easyDayValues(this.form.取配置().easyDaysPercentages)[day];
    return String(value === 0 ? 0 : value === 1 ? 1 : 0.5);
  }
  private changeDay(day: number, value: string): void {
    if (this.busy) return;
    this.form.设置浮点数组字段('easyDaysPercentages', updateEasyDay(this.form.取配置().easyDaysPercentages, day, Number(value)).join(' '));
    this.editRevision++;
    this.publishInterface();
  }
  @Builder
  private option(field: DeckOptionDefinition) {
    if (['newPerDay', 'reviewsPerDay', 'desiredRetention'].includes(field.key)) {
      DeckOptionField({ title: this.text(field.titleKey) + ' · ' + this.text('deck_scope_label'), help: this.text('deck_scope_help'),
        value: String(this.scope(field.key)), choices: this.scopeChoices(field.key), busy: this.busy,
        onChange: (value: string): void => { if (field.key === 'newPerDay') this.newScope = Number(value);
          else if (field.key === 'reviewsPerDay') this.reviewScope = Number(value); else this.retentionScope = Number(value); } })
    }
    if (field.kind === 'week') {
      ForEach([0, 1, 2, 3, 4, 5, 6], (day: number) => {
        DeckOptionField({ title: this.text('deck_weekday_' + String(day)), help: this.text(field.helpKey), value: this.dayValue(day),
          choices: this.dayChoices(), busy: this.busy, defaultValue: '1', onChange: (value: string): void => { this.changeDay(day, value); } })
      }, (day: number): string => String(day))
      Text(this.text('deck_easy_days_future_hint')).fontSize(14).fontColor($r('app.color.text_secondary')).width('100%')
      if (!easyDayValues(this.form.取配置().easyDaysPercentages).includes(1)) {
        Text(this.text('deck_easy_days_no_normal_hint')).fontSize(14).fontColor($r('app.color.error_text')).width('100%')
      }
    } else {
      DeckOptionField({ title: this.text(field.titleKey), help: this.text(field.helpKey), value: this.value(field),
        choices: this.choices(field), busy: this.busy || field.kind === 'unsupported', defaultValue: this.defaultValue(field),
        validate: (value: string): string => this.validate(field, value), onChange: (value: string): void => this.change(field, value) })
      if (field.kind === 'unsupported') {
        Text(this.text(field.helpKey)).fontSize(14).fontColor($r('app.color.text_secondary')).width('100%')
      }
    }
  }
  build() {
    Column({ space: 应用尺寸.间距_12 * 2 }) {
      ForEach(DECK_OPTION_GROUPS, (group: DeckOptionGroup) => {
        Column({ space: 应用尺寸.间距_12 }) {
          Text(this.text(group.titleKey)).fontSize(应用尺寸.字号_正文).fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_primary')).width('100%')
          ForEach(this.fields(group), (field: DeckOptionDefinition) => { this.option(field) }, (field: DeckOptionDefinition): string => field.key)
          if (group.id === 'fsrs' && this.options.是否启用FSRS) {
            if (this.presetAssignmentsChanged) {
              Text(this.text('deck_preset_save_before_optimize')).fontSize(14).fontColor($r('app.color.text_secondary')).width('100%')
            }
            FsrsTools({ state: this.fsrsState, busy: this.busy || this.presetAssignmentsChanged, onOptimize: this.onOptimize, onSimulate: this.onSimulate,
              onEvaluate: this.onEvaluate, onRetention: (value: string): void => { if (!this.busy) this.form.目标保留率文本 = value; } })
          }
        }.width('100%')
      }, (group: DeckOptionGroup): string => group.id)
    }.width('100%')
  }
}
